import type { FleetSession, NodeStatus } from '@copilot-fleet/shared';

import { FleetEventEmitter } from './events.js';

type SessionNode = {
  id: string;
  status?: NodeStatus;
  progress?: number;
};

type SessionLike = FleetSession & {
  id?: string;
  status?: string;
  currentWave?: number;
  totalWaves?: number;
  nodes?: SessionNode[];
  graph?: { nodes?: SessionNode[] };
  errors?: Array<{ message?: string } | string>;
  startedAt?: string;
};

export interface MonitorSnapshot {
  sessionId: string;
  status: string;
  wave: number;
  totalWaves: number;
  nodes: { id: string; status: NodeStatus; progress: number }[];
  elapsed: number;
  errors: string[];
}

function getNodes(session: SessionLike): SessionNode[] {
  return session.nodes ?? session.graph?.nodes ?? [];
}

export class Monitor {
  private events: FleetEventEmitter;
  private startTime: number;

  constructor(events: FleetEventEmitter) {
    this.events = events;
    this.startTime = Date.now();
  }

  start(): void {
    this.startTime = Date.now();
    this.events.emit({
      type: 'log',
      sessionId: '',
      timestamp: new Date().toISOString(),
      data: { message: 'Monitor started' },
    });
  }

  getSnapshot(session: FleetSession): MonitorSnapshot {
    const value = session as SessionLike;
    const startedAt = value.startedAt ? Date.parse(value.startedAt) : this.startTime;
    return {
      sessionId: value.id ?? 'unknown',
      status: value.status ?? 'unknown',
      wave: value.currentWave ?? 0,
      totalWaves: value.totalWaves ?? 0,
      nodes: getNodes(value).map((node) => ({
        id: node.id,
        status: (node.status ?? 'idle') as NodeStatus,
        progress: node.progress ?? 0,
      })),
      elapsed: Date.now() - startedAt,
      errors: (value.errors ?? []).map((error) =>
        typeof error === 'string' ? error : error.message ?? 'Unknown error',
      ),
    };
  }

  formatLog(snapshot: MonitorSnapshot): string {
    const nodeSummary = snapshot.nodes
      .map((node) => `${node.id}:${String(node.status)}(${Math.round(node.progress)}%)`)
      .join(', ');
    const errors = snapshot.errors.length > 0 ? ` errors=${snapshot.errors.join(' | ')}` : '';
    return [
      `session=${snapshot.sessionId}`,
      `status=${snapshot.status}`,
      `wave=${snapshot.wave}/${snapshot.totalWaves}`,
      `elapsed=${snapshot.elapsed}ms`,
      `nodes=[${nodeSummary}]${errors}`,
    ].join(' ');
  }
}