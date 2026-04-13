import type { FleetEvent, LLMResponse } from '@copilot-fleet/shared';

import { FleetEventEmitter } from './events.js';
import type { DispatcherTarget } from './types.js';

function createEvent(type: 'log' | 'node:complete' | 'node:error', detail: Record<string, unknown>): FleetEvent {
  return {
    type,
    sessionId: '',
    timestamp: new Date().toISOString(),
    data: detail,
  };
}

export class Dispatcher {
  private events: FleetEventEmitter;

  constructor(events: FleetEventEmitter) {
    this.events = events;
  }

  async dispatch(target: DispatcherTarget): Promise<LLMResponse> {
    this.events.emit(
      createEvent('log', {
        nodeId: target.nodeId,
        agentId: target.agentId,
        providerType: target.provider.type,
        message: 'Dispatch started',
      }),
    );

    try {
      const response = await target.provider.complete(target.request);
      this.events.emit(createEvent('node:complete', { nodeId: target.nodeId, agentId: target.agentId }));
      return response;
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      this.events.emit(
        createEvent('node:error', {
          nodeId: target.nodeId,
          agentId: target.agentId,
          error: normalized.message,
        }),
      );
      throw normalized;
    }
  }

  async dispatchBatch(targets: DispatcherTarget[]): Promise<Map<string, LLMResponse>> {
    const results = await Promise.all(
      targets.map(async (target) => ({
        nodeId: target.nodeId,
        response: await this.dispatch(target),
      })),
    );

    return new Map(results.map(({ nodeId, response }) => [nodeId, response]));
  }
}