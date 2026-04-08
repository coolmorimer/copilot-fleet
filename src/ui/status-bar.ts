import * as vscode from 'vscode';
import { FleetSession } from '../core/state';

export class FleetStatusBar {
  readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      50
    );
    this.item.command = 'copilot-fleet.openDashboard';
    this.setIdle();
    this.item.show();
  }

  update(session: FleetSession | undefined): void {
    if (!session) {
      this.setIdle();
      return;
    }
    const done = session.tasks.filter(
      t => t.status === 'completed' || t.status === 'pr_created'
    ).length;
    const total = session.tasks.length;
    const failed = session.tasks.filter(t => t.status === 'failed').length;

    switch (session.status) {
      case 'planning':
      case 'awaiting_approval':
        this.item.text = '$(loading~spin) Fleet: планирую...';
        this.item.tooltip = `Copilot Fleet — ${session.prompt}`;
        break;

      case 'running':
        this.item.text = `$(sync~spin) Fleet: ${done}/${total} ✅`;
        this.item.tooltip = `Copilot Fleet — выполняется\n${done}/${total} завершено`;
        break;

      case 'completed':
        this.item.text = `$(check) Fleet: ${done}/${total} ✅`;
        this.item.tooltip = 'Copilot Fleet — все задачи завершены';
        break;

      case 'failed':
        this.item.text = `$(error) Fleet: ${done}/${total} ⚠️`;
        this.item.tooltip = `Copilot Fleet — ошибки: ${failed}`;
        break;

      case 'aborted':
        this.item.text = `$(debug-stop) Fleet: остановлено`;
        this.item.tooltip = 'Copilot Fleet — сессия остановлена';
        break;

      default:
        this.setIdle();
    }
  }

  private setIdle(): void {
    this.item.text = '$(rocket) Fleet';
    this.item.tooltip = 'Copilot Fleet — оркестратор облачных агентов';
  }

  dispose(): void {
    this.item.dispose();
  }
}
