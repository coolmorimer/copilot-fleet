import type {
  FleetEvent,
  FleetSession,
  FleetEventType,
  NodeResult,
  NodeStatus,
  SessionError,
  SessionStatus,
} from '@copilot-fleet/shared';

import { FleetEventEmitter } from './events.js';

type MutableNode = {
  id: string;
  status?: NodeStatus;
  progress?: number;
  result?: NodeResult;
};

type MutableSession = FleetSession & {
  status: SessionStatus;
  nodes?: MutableNode[];
  graph?: { nodes?: MutableNode[] };
  errors?: SessionError[];
  results?: Map<string, NodeResult>;
  currentWave?: number;
  startedAt?: string;
  completedAt?: string;
  updatedAt?: string;
};

function createEvent(type: FleetEventType, sessionId: string, detail: Record<string, unknown>): FleetEvent {
  return {
    type,
    sessionId,
    timestamp: new Date().toISOString(),
    data: detail,
  };
}

function getNodes(session: MutableSession): MutableNode[] {
  if (Array.isArray(session.nodes)) {
    return session.nodes;
  }

  if (Array.isArray(session.graph?.nodes)) {
    return session.graph.nodes;
  }

  session.nodes = [];
  return session.nodes;
}

function isFailedStatus(status: NodeStatus | SessionStatus | undefined): boolean {
  return ['error', 'failed'].includes(String(status ?? '').toLowerCase());
}

function isRunningStatus(status: NodeStatus | SessionStatus | undefined): boolean {
  return String(status ?? '').toLowerCase() === 'running';
}

function isDoneStatus(status: NodeStatus | SessionStatus | undefined): boolean {
  return ['done', 'completed', 'success'].includes(String(status ?? '').toLowerCase());
}

export class SessionState {
  private session: MutableSession;
  private events: FleetEventEmitter;

  constructor(session: FleetSession, events: FleetEventEmitter) {
    this.session = session as MutableSession;
    this.events = events;
    this.session.results ??= new Map<string, NodeResult>();
  }

  getSession(): Readonly<FleetSession> {
    return this.session;
  }

  getStatus(): SessionStatus {
    return this.session.status;
  }

  updateSessionStatus(status: SessionStatus): void {
    this.session.status = status;
    this.session.updatedAt = new Date().toISOString();
    if (isDoneStatus(status) || isFailedStatus(status)) {
      this.session.completedAt = this.session.updatedAt;
    }
    const sessionId = (this.session as { id?: string }).id ?? '';
    const eventType = this.getSessionEventType(status);
    this.events.emit(createEvent(eventType, sessionId, { status }));
  }

  updateNodeStatus(nodeId: string, status: NodeStatus, progress?: number): void {
    const node = getNodes(this.session).find((candidate) => candidate.id === nodeId);
    if (!node) {
      return;
    }

    node.status = status;
    if (typeof progress === 'number') {
      node.progress = progress;
    }
    this.session.updatedAt = new Date().toISOString();
    const sessionId = (this.session as { id?: string }).id ?? '';
    this.events.emit(createEvent(this.getNodeEventType(status), sessionId, { nodeId, status, progress }));
  }

  setNodeResult(nodeId: string, result: NodeResult): void {
    const node = getNodes(this.session).find((candidate) => candidate.id === nodeId);
    if (!node) {
      return;
    }

    node.result = result;
    this.session.results?.set(nodeId, result);
  }

  addError(error: SessionError): void {
    const errors = this.session.errors ?? [];
    errors.push(error);
    this.session.errors = errors;
    const sessionId = (this.session as { id?: string }).id ?? '';
    this.events.emit(createEvent('session:error', sessionId, { error }));
  }

  advanceWave(): void {
    this.session.currentWave = (this.session.currentWave ?? 0) + 1;
    const sessionId = (this.session as { id?: string }).id ?? '';
    this.events.emit(createEvent('log', sessionId, { wave: this.session.currentWave }));
  }

  isComplete(): boolean {
    const nodes = getNodes(this.session);
    return nodes.length > 0 && nodes.every((node) => isDoneStatus(node.status) || isFailedStatus(node.status));
  }

  getSummary(): { total: number; done: number; failed: number; running: number; duration: number } {
    const nodes = getNodes(this.session);
    const startTime = this.session.startedAt ? Date.parse(this.session.startedAt) : Date.now();
    return {
      total: nodes.length,
      done: nodes.filter((node) => isDoneStatus(node.status)).length,
      failed: nodes.filter((node) => isFailedStatus(node.status)).length,
      running: nodes.filter((node) => isRunningStatus(node.status)).length,
      duration: Date.now() - startTime,
    };
  }

  private getSessionEventType(status: SessionStatus): FleetEventType {
    switch (status) {
      case 'running':
        return 'session:start';
      case 'completed':
        return 'session:complete';
      case 'failed':
        return 'session:error';
      case 'aborted':
        return 'session:abort';
      default:
        return 'log';
    }
  }

  private getNodeEventType(status: NodeStatus): FleetEventType {
    switch (status) {
      case 'queued':
        return 'node:queued';
      case 'running':
        return 'node:start';
      case 'done':
        return 'node:complete';
      case 'error':
        return 'node:error';
      case 'skipped':
      case 'cancelled':
        return 'node:skipped';
      default:
        return 'node:progress';
    }
  }
}