import type {
  FleetEvent,
  FleetEventType,
  FleetGraph,
  FleetNode,
  FleetSession,
  LLMRequest,
  LLMResponse,
  NodeResult,
  NodeStatus,
  SessionConfig,
  SessionError,
  SessionStatus,
} from '@copilot-fleet/shared';

import { Dispatcher } from './dispatcher.js';
import { FleetEventEmitter } from './events.js';
import { computeWaves, getPredecessors } from './graph.js';
import { Monitor } from './monitor.js';
import { Scheduler } from './scheduler.js';
import { SessionState } from './state.js';
import type { OrchestratorOptions, ProviderAdapter } from './types.js';

type EngineNode = FleetNode & {
  id: string;
  agentId?: string;
  provider?: string;
  prompt?: string;
  input?: string;
  model?: string;
  config?: Record<string, unknown>;
  data?: Record<string, unknown>;
  status?: NodeStatus;
  progress?: number;
  result?: NodeResult;
};

type EngineSession = FleetSession & {
  id: string;
  graph: FleetGraph & { nodes?: EngineNode[] };
  config: SessionConfig;
  status: SessionStatus;
  currentWave?: number;
  totalWaves?: number;
  startedAt?: string;
  completedAt?: string;
  nodes?: EngineNode[];
  errors?: SessionError[];
};

function createEvent(type: string, detail: Record<string, unknown>): FleetEvent {
  return {
    type: type as FleetEventType,
    sessionId: typeof detail.sessionId === 'string' ? detail.sessionId : '',
    timestamp: new Date().toISOString(),
    data: detail,
  };
}

function asStatus<T>(value: string): T {
  return value as unknown as T;
}

function getNodes(graph: FleetGraph): EngineNode[] {
  return ((graph as FleetGraph & { nodes?: EngineNode[] }).nodes ?? []).filter(
    (node): node is EngineNode => typeof node?.id === 'string',
  );
}

function toSessionError(nodeId: string, error: Error): SessionError {
  return {
    nodeId,
    message: error.message,
    timestamp: new Date().toISOString(),
    recoverable: true,
  };
}

function toNodeResult(nodeId: string, response: LLMResponse, startedAt: string): NodeResult {
  return {
    nodeId,
    status: 'done',
    output: response,
    startedAt,
    completedAt: new Date().toISOString(),
    duration: Date.now() - Date.parse(startedAt),
  };
}

export class FleetEngine {
  private events: FleetEventEmitter;
  private state: SessionState | null;
  private scheduler: Scheduler<LLMResponse> | null;
  private dispatcher: Dispatcher;
  private monitor: Monitor;
  private providers: Map<string, ProviderAdapter>;
  private aborted: boolean;
  private sessions: Map<string, EngineSession>;

  constructor() {
    this.events = new FleetEventEmitter();
    this.state = null;
    this.scheduler = null;
    this.dispatcher = new Dispatcher(this.events);
    this.monitor = new Monitor(this.events);
    this.providers = new Map();
    this.aborted = false;
    this.sessions = new Map();
  }

  registerProvider(name: string, provider: ProviderAdapter): void {
    this.providers.set(name, provider);
  }

  createSession(options: OrchestratorOptions): FleetSession {
    if (options.onEvent) {
      this.events.on('*', options.onEvent);
    }

    const nodes = getNodes(options.graph).map((node) => ({
      ...node,
      status: node.status ?? asStatus<NodeStatus>('idle'),
      progress: node.progress ?? 0,
    }));
    const session = {
      id: crypto.randomUUID(),
      graph: { ...options.graph, nodes },
      config: options.config,
      status: asStatus<SessionStatus>('idle'),
      currentWave: 0,
      totalWaves: 0,
      startedAt: new Date().toISOString(),
      nodes,
      results: new Map<string, NodeResult>(),
      errors: [],
    } as EngineSession;
    this.sessions.set(session.id, session);
    this.events.emit(createEvent('log', { sessionId: session.id, message: 'Session created' }));
    return session;
  }

  async run(sessionId: string): Promise<FleetSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    this.aborted = false;
    this.state = new SessionState(session, this.events);
    this.monitor.start();
    this.state.updateSessionStatus(asStatus<SessionStatus>('running'));

    const waves = computeWaves(session.graph);
    session.totalWaves = waves.length;

    for (const wave of waves) {
      if (this.aborted) {
        this.state.updateSessionStatus(asStatus<SessionStatus>('aborted'));
        break;
      }

      this.scheduler = new Scheduler<LLMResponse>(
        {
          maxConcurrency: this.getMaxConcurrency(session.config),
          timeout: this.getTimeout(session.config),
        },
        this.events,
      );
      this.events.emit(createEvent('wave:start', { sessionId: session.id, wave: session.currentWave, nodes: wave }));

      this.scheduler.addTasks(
        wave.map((nodeId) => ({
          id: nodeId,
          execute: async () => this.runNode(session, nodeId),
        })),
      );

      const results = await this.scheduler.execute();
      for (const [nodeId, result] of results) {
        if (!result.error) {
          continue;
        }

        this.state.updateNodeStatus(nodeId, asStatus<NodeStatus>('error'), 100);
        this.state.addError(toSessionError(nodeId, result.error));
      }

      this.events.emit(createEvent('wave:complete', { sessionId: session.id, wave: session.currentWave, nodes: wave }));
      this.state.advanceWave();
      this.events.emit(createEvent('log', { sessionId: session.id, snapshot: this.monitor.getSnapshot(session) }));
    }

    if (!this.aborted) {
      const finalStatus = this.state.isComplete() && (session.errors?.length ?? 0) === 0 ? 'completed' : 'failed';
      this.state.updateSessionStatus(asStatus<SessionStatus>(finalStatus));
    }

    return this.state.getSession() as FleetSession;
  }

  abort(sessionId: string): void {
    if (!this.sessions.has(sessionId)) {
      return;
    }

    this.aborted = true;
    this.scheduler?.abort();
    this.state?.updateSessionStatus(asStatus<SessionStatus>('aborted'));
    this.events.emit(createEvent('session:abort', { sessionId }));
  }

  getSession(sessionId: string): FleetSession | undefined {
    return this.sessions.get(sessionId);
  }

  on(type: FleetEventType | '*', listener: (event: FleetEvent) => void): () => void {
    return this.events.on(type, listener);
  }

  async dispose(): Promise<void> {
    for (const provider of this.providers.values()) {
      await provider.dispose();
    }
    this.events.removeAllListeners();
    this.sessions.clear();
  }

  private async runNode(session: EngineSession, nodeId: string): Promise<LLMResponse> {
    const node = session.nodes?.find((candidate) => candidate.id === nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    const failedDependency = getPredecessors(session.graph, nodeId).find((dependencyId) => {
      const dependency = session.nodes?.find((candidate) => candidate.id === dependencyId);
      return String(dependency?.status ?? '').toLowerCase() === 'error';
    });
    if (failedDependency) {
      throw new Error(`Dependency ${failedDependency} failed`);
    }

    const provider = this.resolveProvider(node, session.config);
    const startedAt = new Date().toISOString();
    this.state?.updateNodeStatus(nodeId, asStatus<NodeStatus>('queued'), 0);
    this.state?.updateNodeStatus(nodeId, asStatus<NodeStatus>('running'), 0);
    const response = await this.dispatcher.dispatch({
      nodeId,
      agentId: this.getAgentId(node),
      provider,
      request: this.buildRequest(node, session),
    });
    this.state?.setNodeResult(nodeId, toNodeResult(nodeId, response, startedAt));
    this.state?.updateNodeStatus(nodeId, asStatus<NodeStatus>('done'), 100);
    return response;
  }

  private resolveProvider(node: EngineNode, config: SessionConfig): ProviderAdapter {
    const providerName = this.getProviderName(node, config);
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider ${providerName} is not registered`);
    }
    return provider;
  }

  private getProviderName(node: EngineNode, config: SessionConfig): string {
    const configLike = config as SessionConfig & { provider?: string; defaultProvider?: string };
    const nodeData = node.data ?? node.config;
    const fromData = typeof nodeData?.provider === 'string' ? nodeData.provider : undefined;
    return node.provider ?? fromData ?? configLike.defaultProvider ?? configLike.provider ?? 'default';
  }

  private getAgentId(node: EngineNode): string {
    const nodeData = node.data ?? node.config;
    return node.agentId ?? (typeof nodeData?.agentId === 'string' ? nodeData.agentId : undefined) ?? node.id;
  }

  private buildRequest(node: EngineNode, session: EngineSession): LLMRequest {
    const nodeData = node.data ?? node.config ?? {};
    const prompt =
      node.prompt ??
      node.input ??
      (typeof nodeData.prompt === 'string' ? nodeData.prompt : undefined) ??
      `Execute node ${node.id} in session ${session.id}`;
    return {
      model: node.model ?? (typeof nodeData.model === 'string' ? nodeData.model : undefined) ?? 'default-model',
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: `Session ${session.id}, node ${node.id}`,
      temperature: typeof nodeData.temperature === 'number' ? nodeData.temperature : 0.3,
      maxTokens: typeof nodeData.maxTokens === 'number' ? nodeData.maxTokens : undefined,
      stream: false,
    };
  }

  private getMaxConcurrency(config: SessionConfig): number {
    const configLike = config as SessionConfig & { maxConcurrency?: number };
    return Math.max(1, configLike.maxConcurrency ?? 4);
  }

  private getTimeout(config: SessionConfig): number {
    const configLike = config as SessionConfig & { timeout?: number };
    return Math.max(1, configLike.timeout ?? 300000);
  }
}