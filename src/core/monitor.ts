import { FleetLogger } from '../utils/logger';
import { PullService } from '../github/pulls';
import { FleetState, SubTask } from './state';
import { getConfig } from '../utils/config';

export class Monitor {
  private timerId: ReturnType<typeof setInterval> | undefined;
  private aborted = false;
  private dispatchFn: ((task: SubTask, prompt: string) => Promise<void>) | undefined;
  private checkCounts = new Map<string, number>();

  constructor(
    private readonly pullService: PullService,
    private readonly state: FleetState,
    private readonly logger: FleetLogger
  ) {}

  /** Register a callback for dispatching tasks with pending dependencies */
  setDispatcher(fn: (task: SubTask, prompt: string) => Promise<void>): void {
    this.dispatchFn = fn;
  }

  start(): void {
    if (this.timerId) { return; }
    this.aborted = false;

    const config = getConfig();
    this.logger.info(
      `Monitor started (poll every ${config.pollIntervalMs}ms, timeout ${config.timeoutMs}ms)`
    );

    const pollMs = Math.min(config.pollIntervalMs, 15000); // Poll at least every 15s
    this.logger.info(`Effective poll interval: ${pollMs}ms`);
    this.timerId = setInterval(() => {
      this.poll().catch(err => {
        this.logger.error(`Monitor poll error: ${err}`);
      });
    }, pollMs);

    // Do an immediate first poll
    this.poll().catch(err => {
      this.logger.error(`Monitor initial poll error: ${err}`);
    });
  }

  stop(): void {
    this.aborted = true;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = undefined;
    }
    this.checkCounts.clear();
    this.logger.info('Monitor stopped');
  }

  private async poll(): Promise<void> {
    const session = this.state.session;
    if (!session || this.aborted) { return; }

    const [owner, repo] = session.repo.split('/');
    if (!owner || !repo) { return; }

    const workingTasks = session.tasks.filter(
      t => t.status === 'working' || t.status === 'dispatched'
    );

    if (workingTasks.length === 0) {
      this.checkCompletion();
      return;
    }

    for (const task of workingTasks) {
      if (this.aborted) { break; }
      if (!task.issueNumber) { continue; }

      await this.checkTask(owner, repo, task);
    }

    // Check timeout
    const elapsed = Date.now() - session.startedAt;
    const config = getConfig();
    if (elapsed > config.timeoutMs) {
      this.logger.warn('Session timed out');
      this.state.setStatus('failed');
      this.stop();
    }

    // Dispatch pending tasks whose dependencies are now met
    await this.dispatchReadyTasks();

    this.checkCompletion();
  }

  private async dispatchReadyTasks(): Promise<void> {
    if (!this.dispatchFn) { return; }
    const session = this.state.session;
    if (!session) { return; }

    const completedIds = new Set(
      session.tasks
        .filter(t => t.status === 'completed' || t.status === 'pr_created' || t.status === 'failed')
        .map(t => t.id)
    );

    const pendingReady = session.tasks.filter(t => {
      if (t.status !== 'pending') { return false; }
      if (t.dependsOn.length === 0) { return false; } // Already dispatched by execute()
      return t.dependsOn.every(dep => completedIds.has(dep));
    });

    for (const task of pendingReady) {
      if (this.aborted) { break; }
      try {
        this.logger.info(`Dispatching dependent task "${task.title}" — dependencies met`);
        await this.dispatchFn(task, session.prompt);
      } catch (err) {
        this.logger.error(`Failed to dispatch dependent task "${task.title}": ${err}`);
      }
    }
  }

  private async checkTask(
    owner: string,
    repo: string,
    task: SubTask
  ): Promise<void> {
    if (!task.issueNumber) { return; }

    const count = (this.checkCounts.get(task.id) || 0) + 1;
    this.checkCounts.set(task.id, count);

    try {
      const pr = await this.pullService.findPRForIssue(
        owner, repo, task.issueNumber
      );

      if (pr) {
        this.checkCounts.delete(task.id);
        this.state.updateTask(task.id, {
          prNumber: pr.number,
          prUrl: pr.html_url,
          status: pr.merged ? 'completed' : 'pr_created',
        });

        if (pr.merged) {
          this.logger.info(
            `Task "${task.title}": PR #${pr.number} merged`
          );
        } else {
          this.logger.info(
            `Task "${task.title}": PR #${pr.number} created`
          );
        }
      } else if (count % 10 === 0) {
        this.logger.warn(
          `Task "${task.title}" (issue #${task.issueNumber}): no PR found after ${count} checks`
        );
      }
    } catch (err) {
      this.logger.warn(
        `Failed to check task "${task.title}" (attempt ${count}): ${err}`
      );
    }
  }

  private checkCompletion(): void {
    const session = this.state.session;
    if (!session) { return; }

    const all = session.tasks.length;
    const done = session.tasks.filter(
      t => t.status === 'completed' || t.status === 'pr_created'
    ).length;
    const terminal = session.tasks.filter(
      t => t.status === 'failed' || t.status === 'aborted'
    ).length;

    if (done + terminal === all && all > 0) {
      this.state.setStatus(terminal > 0 && done === 0 ? 'failed' : 'completed');
      this.stop();
    }
  }
}
