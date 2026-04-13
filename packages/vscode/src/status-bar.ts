import * as vscode from 'vscode';

export interface FleetStatusSnapshot {
  readonly status: 'idle' | 'running';
  readonly label: string;
  readonly task: string | null;
  readonly startedAt: string | null;
  readonly progress: number | null;
}

export class FleetStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly changeEmitter = new vscode.EventEmitter<FleetStatusSnapshot>();
  private snapshot: FleetStatusSnapshot = {
    status: 'idle',
    label: 'Idle',
    task: null,
    startedAt: null,
    progress: null,
  };

  public readonly onDidChange = this.changeEmitter.event;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'copilot-fleet.status';
    this.render();
    this.item.show();
  }

  setRunning(task: string): void {
    this.snapshot = {
      status: 'running',
      label: 'Running',
      task,
      startedAt: new Date().toISOString(),
      progress: 0,
    };
    this.render();
  }

  setProgress(progress: number): void {
    if (this.snapshot.status !== 'running') {
      return;
    }

    this.snapshot = {
      ...this.snapshot,
      progress: Math.max(0, Math.min(100, Math.round(progress))),
    };
    this.render();
  }

  setIdle(label = 'Idle'): void {
    this.snapshot = {
      status: 'idle',
      label,
      task: null,
      startedAt: null,
      progress: null,
    };
    this.render();
  }

  getStatus(): string {
    return this.snapshot.status === 'running' && this.snapshot.task
      ? `${this.snapshot.label}: ${this.snapshot.task}`
      : this.snapshot.label;
  }

  getSnapshot(): FleetStatusSnapshot {
    return { ...this.snapshot };
  }

  dispose(): void {
    this.changeEmitter.dispose();
    this.item.dispose();
  }

  private render(): void {
    const icon = this.snapshot.status === 'running' ? '$(sync~spin)' : '$(debug-pause)';
    const suffix = this.snapshot.task ? ` ${this.snapshot.task}` : ` ${this.snapshot.label}`;
    this.item.text = `${icon} Fleet:${suffix}`;
    this.item.tooltip = this.snapshot.status === 'running'
      ? `CopilotFleet is running: ${this.snapshot.task ?? 'Unnamed task'}`
      : 'CopilotFleet is idle';
    this.changeEmitter.fire(this.getSnapshot());
  }
}
