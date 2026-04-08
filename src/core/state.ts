import * as vscode from 'vscode';

export type TaskStatus =
  | 'pending'
  | 'dispatched'
  | 'working'
  | 'pr_created'
  | 'completed'
  | 'failed'
  | 'aborted';

export type SessionStatus =
  | 'planning'
  | 'awaiting_approval'
  | 'running'
  | 'completed'
  | 'failed'
  | 'aborted';

export interface SubTask {
  id: string;
  title: string;
  description: string;
  files: string[];
  dependsOn: string[];
  issueNumber?: number;
  issueUrl?: string;
  prNumber?: number;
  prUrl?: string;
  status: TaskStatus;
  agentId?: string;
  error?: string;
}

export interface FleetSession {
  id: string;
  prompt: string;
  repo: string;
  branch: string;
  maxAgents: number;
  tasks: SubTask[];
  status: SessionStatus;
  startedAt: number;
  completedAt?: number;
  error?: string;
}

export type StateChangeHandler = (session: FleetSession | undefined) => void;

const HISTORY_KEY = 'copilot-fleet.sessions';
const MAX_HISTORY = 20;

export class FleetState {
  private current: FleetSession | undefined;
  private readonly handlers: StateChangeHandler[] = [];

  constructor(private readonly globalState: vscode.Memento) {}

  get session(): FleetSession | undefined {
    return this.current;
  }

  createSession(
    prompt: string,
    repo: string,
    branch: string,
    maxAgents: number
  ): FleetSession {
    this.current = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      prompt,
      repo,
      branch,
      maxAgents,
      tasks: [],
      status: 'planning',
      startedAt: Date.now(),
    };
    this.notify();
    return this.current;
  }

  setTasks(tasks: SubTask[]): void {
    if (!this.current) { return; }
    this.current.tasks = tasks;
    this.notify();
  }

  updateTask(taskId: string, update: Partial<SubTask>): void {
    if (!this.current) { return; }
    const task = this.current.tasks.find(t => t.id === taskId);
    if (task) {
      Object.assign(task, update);
      this.notify();
    }
  }

  addTask(task: SubTask): void {
    if (!this.current) { return; }
    this.current.tasks.push(task);
    this.notify();
  }

  removeTask(taskId: string): void {
    if (!this.current) { return; }
    this.current.tasks = this.current.tasks.filter(t => t.id !== taskId);
    for (const task of this.current.tasks) {
      task.dependsOn = task.dependsOn.filter(d => d !== taskId);
    }
    this.notify();
  }

  setStatus(status: SessionStatus): void {
    if (!this.current) { return; }
    this.current.status = status;
    if (status === 'completed' || status === 'failed' || status === 'aborted') {
      this.current.completedAt = Date.now();
      this.saveToHistory();
    }
    this.notify();
  }

  abort(): void {
    if (!this.current) { return; }
    for (const task of this.current.tasks) {
      if (task.status === 'pending' || task.status === 'dispatched' || task.status === 'working') {
        task.status = 'aborted';
      }
    }
    this.setStatus('aborted');
  }

  reset(): void {
    this.current = undefined;
    this.notify();
  }

  get isTerminal(): boolean {
    if (!this.current) { return true; }
    return ['completed', 'failed', 'aborted'].includes(this.current.status);
  }

  onChange(handler: StateChangeHandler): void {
    this.handlers.push(handler);
  }

  async getHistory(): Promise<FleetSession[]> {
    return this.globalState.get<FleetSession[]>(HISTORY_KEY, []);
  }

  private async saveToHistory(): Promise<void> {
    if (!this.current) { return; }
    const history = await this.getHistory();
    history.unshift({ ...this.current });
    if (history.length > MAX_HISTORY) {
      history.length = MAX_HISTORY;
    }
    await this.globalState.update(HISTORY_KEY, history);
  }

  private notify(): void {
    for (const handler of this.handlers) {
      handler(this.current);
    }
  }
}
