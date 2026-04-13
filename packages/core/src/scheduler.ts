import type { FleetEvent, FleetEventType } from '@copilot-fleet/shared';

import { FleetEventEmitter } from './events.js';
import type { SchedulerOptions } from './types.js';

export interface SchedulerTask<T> {
  id: string;
  execute: () => Promise<T>;
  priority?: number;
}

export interface SchedulerResult<T> {
  id: string;
  result?: T;
  error?: Error;
  duration: number;
}

function createEvent(type: FleetEventType, detail: Record<string, unknown>, sessionId = ''): FleetEvent {
  return {
    type,
    sessionId,
    timestamp: new Date().toISOString(),
    data: detail,
  };
}

export class Scheduler<T = unknown> {
  private queue: SchedulerTask<T>[];
  private running: Map<string, Promise<SchedulerResult<T>>>;
  private results: Map<string, SchedulerResult<T>>;
  private options: SchedulerOptions;
  private events: FleetEventEmitter;
  private abortController: AbortController;

  constructor(options: SchedulerOptions, events: FleetEventEmitter) {
    this.queue = [];
    this.running = new Map();
    this.results = new Map();
    this.options = options;
    this.events = events;
    this.abortController = new AbortController();
  }

  addTasks(tasks: SchedulerTask<T>[]): void {
    this.queue.push(...tasks);
    this.queue.sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
  }

  async execute(): Promise<Map<string, SchedulerResult<T>>> {
    while ((this.queue.length > 0 || this.running.size > 0) && !this.abortController.signal.aborted) {
      while (this.running.size < this.options.maxConcurrency && this.queue.length > 0) {
        const task = this.queue.shift();
        if (!task) {
          break;
        }

        const promise = this.runTask(task);
        this.running.set(task.id, promise);
      }

      if (this.running.size === 0) {
        continue;
      }

      const nextFinished = await Promise.race(
        [...this.running.entries()].map(async ([taskId, promise]) => ({
          taskId,
          result: await promise,
        })),
      );
      this.running.delete(nextFinished.taskId);
      this.results.set(nextFinished.taskId, nextFinished.result);
    }

    return new Map(this.results);
  }

  abort(): void {
    this.abortController.abort();
    this.queue = [];
    this.events.emit(createEvent('log', { level: 'warn', message: 'Scheduler aborted' }));
  }

  getStatus(): { queued: number; running: number; completed: number; failed: number } {
    const failed = [...this.results.values()].filter((result) => result.error).length;
    return {
      queued: this.queue.length,
      running: this.running.size,
      completed: this.results.size,
      failed,
    };
  }

  private async runTask(task: SchedulerTask<T>): Promise<SchedulerResult<T>> {
    const startedAt = Date.now();
    this.events.emit(createEvent('node:start', { nodeId: task.id }));

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        reject(new Error(`Task ${task.id} timed out after ${this.options.timeout}ms`));
      }, this.options.timeout);
    });

    try {
      const result = await Promise.race([task.execute(), timeoutPromise]);
      const completed: SchedulerResult<T> = {
        id: task.id,
        result,
        duration: Date.now() - startedAt,
      };
      this.events.emit(createEvent('node:complete', { nodeId: task.id, duration: completed.duration }));
      return completed;
    } catch (error) {
      const failure: SchedulerResult<T> = {
        id: task.id,
        error: error instanceof Error ? error : new Error(String(error)),
        duration: Date.now() - startedAt,
      };
      this.events.emit(
        createEvent('node:error', {
          nodeId: task.id,
          duration: failure.duration,
          error: failure.error?.message ?? 'Unknown error',
        }),
      );
      return failure;
    }
  }
}