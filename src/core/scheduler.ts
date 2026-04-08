import { FleetLogger } from '../utils/logger';
import { getConfig } from '../utils/config';
import { SubTask } from './state';
import { Pipeline } from './pipeline';

export class Scheduler {
  private readonly logger: FleetLogger;

  constructor(logger: FleetLogger) {
    this.logger = logger;
  }

  getNextBatch(
    pipeline: Pipeline,
    completedIds: Set<string>,
    inFlightIds: Set<string>,
    concurrency?: number
  ): SubTask[] {
    const config = getConfig();
    const maxConcurrent = concurrency ?? config.concurrency;
    const available = maxConcurrent - inFlightIds.size;

    if (available <= 0) {
      return [];
    }

    const ready = pipeline.getReady(completedIds)
      .filter(t => !inFlightIds.has(t.id));

    const batch = ready.slice(0, available);

    if (batch.length > 0) {
      this.logger.info(
        `Scheduler: dispatching ${batch.length} tasks ` +
        `(in-flight: ${inFlightIds.size}, completed: ${completedIds.size})`
      );
    }

    return batch;
  }

  getDelayMs(): number {
    return getConfig().delayMs;
  }
}
