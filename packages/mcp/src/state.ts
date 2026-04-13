import { AgentRegistry } from '@copilot-fleet/agents';
import {
  DEFAULT_AGENT_PARAMETERS,
  DEFAULT_SESSION_CONFIG,
  PRESET_AGENTS,
  type AgentDefinition,
  type Preset,
  type SessionStatus,
} from '@copilot-fleet/shared';

export interface SessionResult {
  agent: string;
  wave: number;
  status: 'done' | 'error';
  output?: string;
  duration?: number;
}

export interface FleetSession {
  id: string;
  task: string;
  repo?: string;
  preset: Preset;
  template?: string;
  agentCount: number;
  status: SessionStatus;
  startedAt: string;
  completedAt?: string;
  waves: number;
  currentWave: number;
  results: SessionResult[];
}

const terminalStatuses = new Set<SessionStatus>(['completed', 'failed', 'aborted']);

const toSession = (
  task: string,
  repo: string | undefined,
  preset: Preset,
  template: string | undefined,
  agentCount: number,
): FleetSession => {
  const startedAt = new Date().toISOString();
  const waves = Math.max(1, Math.ceil(agentCount / DEFAULT_SESSION_CONFIG.maxConcurrency));

  return {
    id: crypto.randomUUID(),
    task,
    repo,
    preset,
    template,
    agentCount,
    status: 'running',
    startedAt,
    waves,
    currentWave: 0,
    results: [],
  };
};

export class FleetState {
  readonly agentRegistry: AgentRegistry;
  readonly sessions: Map<string, FleetSession>;

  constructor() {
    this.agentRegistry = new AgentRegistry();
    this.agentRegistry.loadBuiltins();
    this.sessions = new Map<string, FleetSession>();
  }

  createSession(
    task: string,
    repo?: string,
    preset: Preset = DEFAULT_SESSION_CONFIG.preset,
    template?: string,
    agentCountOverride?: number,
  ): FleetSession {
    const normalizedTask = task.trim();
    if (normalizedTask.length === 0) {
      throw new Error('Task must be a non-empty string.');
    }

    const normalizedRepo = repo?.trim() || undefined;
    const normalizedTemplate = template?.trim() || undefined;
    const agentCount = agentCountOverride ?? PRESET_AGENTS[preset];
    const session = toSession(normalizedTask, normalizedRepo, preset, normalizedTemplate, agentCount);
    this.sessions.set(session.id, session);
    return session;
  }

  getSession(id: string): FleetSession | undefined {
    return this.sessions.get(id);
  }

  getSessions(): FleetSession[] {
    return Array.from(this.sessions.values());
  }

  getActiveSession(): FleetSession | undefined {
    const sessions = this.getSessions();

    for (let index = sessions.length - 1; index >= 0; index -= 1) {
      const session = sessions[index];
      if (!terminalStatuses.has(session.status)) {
        return session;
      }
    }

    return undefined;
  }

  abortSession(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session || terminalStatuses.has(session.status)) {
      return false;
    }

    session.status = 'aborted';
    session.completedAt = new Date().toISOString();
    return true;
  }

  addAgent(agent: AgentDefinition): AgentDefinition {
    const existing = this.agentRegistry.get(agent.id);
    if (existing) {
      throw new Error(`Agent with id "${agent.id}" already exists.`);
    }

    this.agentRegistry.register({
      ...agent,
      parameters: {
        temperature: agent.parameters.temperature,
        maxTokens: agent.parameters.maxTokens,
        timeout: agent.parameters.timeout ?? DEFAULT_AGENT_PARAMETERS.timeout,
      },
    });

    const registered = this.agentRegistry.get(agent.id);
    if (!registered) {
      throw new Error(`Failed to register agent "${agent.id}".`);
    }

    return registered;
  }
}