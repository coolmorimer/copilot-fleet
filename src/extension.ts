import * as vscode from 'vscode';
import { registerFleetParticipant } from './chat/participant';
import { FleetSidebarProvider } from './ui/sidebar-provider';
import { FleetStatusBar } from './ui/status-bar';
import { FleetEngine } from './core/engine';
import { FleetLogger } from './utils/logger';
import { initConfigState } from './utils/config';
import { agentRegistry } from './core/agents';
import { WorkflowPanel } from './ui/workflow-panel';

export function activate(context: vscode.ExtensionContext): void {
  const logger = new FleetLogger();
  initConfigState(context.globalState);
  agentRegistry.init(context.globalState);
  const engine = new FleetEngine(context, logger);
  const statusBar = new FleetStatusBar();
  const sidebarProvider = new FleetSidebarProvider(
    context.extensionUri,
    engine,
    context.globalState
  );

  // 1. Chat Participant @fleet
  registerFleetParticipant(context, engine);

  // 2. Sidebar Dashboard
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'copilot-fleet.dashboard',
      sidebarProvider
    )
  );

  // 3. Status Bar
  context.subscriptions.push(statusBar.item);

  // 4. Workflow panel reference
  let workflowPanel: WorkflowPanel | undefined;

  // 5. Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-fleet.launch', (repo?: string) =>
      engine.launchInteractive(repo)
    ),
    vscode.commands.registerCommand('copilot-fleet.dryRun', () =>
      engine.dryRun()
    ),
    vscode.commands.registerCommand('copilot-fleet.status', () =>
      engine.showStatus()
    ),
    vscode.commands.registerCommand('copilot-fleet.abort', () =>
      engine.abort()
    ),
    vscode.commands.registerCommand('copilot-fleet.reset', () => {
      engine.reset();
      sidebarProvider.update(undefined);
    }),
    vscode.commands.registerCommand('copilot-fleet.mergePR', async (taskId: string) => {
      try {
        await engine.mergePR(taskId);
        vscode.window.showInformationMessage('Fleet: PR успешно смержен');
      } catch (err) {
        vscode.window.showErrorMessage(`Fleet: ${err}`);
      }
    }),
    vscode.commands.registerCommand('copilot-fleet.mergeAll', async () => {
      const confirm = await vscode.window.showWarningMessage(
        'Fleet: Смержить все готовые PR?',
        { modal: true },
        'Да, смержить'
      );
      if (confirm !== 'Да, смержить') { return; }
      try {
        const result = await engine.mergeAllPRs();
        if (result.errors.length > 0) {
          vscode.window.showWarningMessage(`Fleet: Смержено ${result.merged}, ошибок: ${result.errors.length}`);
        } else {
          vscode.window.showInformationMessage(`Fleet: Все ${result.merged} PR смержены!`);
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Fleet: ${err}`);
      }
    }),
    vscode.commands.registerCommand('copilot-fleet.openDashboard', () =>
      vscode.commands.executeCommand('copilot-fleet.dashboard.focus')
    ),
    vscode.commands.registerCommand('copilot-fleet.history', () =>
      engine.showHistory()
    ),
    vscode.commands.registerCommand('copilot-fleet.openWorkflow', () => {
      workflowPanel = WorkflowPanel.show(context.extensionUri, engine);
      workflowPanel.update(engine.session);
    }),
    vscode.commands.registerCommand('copilot-fleet.amendTask', async (taskId: string, amendment: string) => {
      try {
        await engine.amendTask(taskId, amendment);
        vscode.window.showInformationMessage('Fleet: ТЗ дополнено');
      } catch (err) {
        vscode.window.showErrorMessage(`Fleet: ${err}`);
      }
    }),
    vscode.commands.registerCommand('copilot-fleet.syncWorkspace', async () => {
      try {
        vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Fleet: Синхронизация...' },
          async () => {
            const result = await engine.syncToWorkspace();
            vscode.window.showInformationMessage(`Fleet: ${result}`);
          }
        );
      } catch (err) {
        vscode.window.showErrorMessage(`Fleet: Ошибка синхронизации — ${err}`);
      }
    }),
    vscode.commands.registerCommand('copilot-fleet.addTask', async () => {
      try {
        if (!engine.session) {
          engine.createManualSession();
        }
        const title = await vscode.window.showInputBox({ prompt: 'Название задачи', placeHolder: 'Добавить авторизацию' });
        if (!title) { return; }
        engine.addTask({ title });
        vscode.window.showInformationMessage(`Fleet: Задача "${title}" добавлена`);
      } catch (err) {
        vscode.window.showErrorMessage(`Fleet: ${err}`);
      }
    }),
    vscode.commands.registerCommand('copilot-fleet.removeTask', async (taskId: string) => {
      try {
        engine.removeTask(taskId);
        vscode.window.showInformationMessage('Fleet: Задача удалена');
      } catch (err) {
        vscode.window.showErrorMessage(`Fleet: ${err}`);
      }
    }),
    vscode.commands.registerCommand('copilot-fleet.newSession', () => {
      engine.reset();
      workflowPanel = WorkflowPanel.show(context.extensionUri, engine);
      workflowPanel.update(undefined);
    })
  );

  // 6. State change → UI updates + auto-open workflow on plan
  engine.onStateChange(session => {
    statusBar.update(session);
    sidebarProvider.update(session);
    if (workflowPanel) {
      workflowPanel.update(session);
    } else if (session && session.status === 'awaiting_approval' && session.tasks.length > 0) {
      // Auto-open workflow panel when plan is ready
      workflowPanel = WorkflowPanel.show(context.extensionUri, engine);
      workflowPanel.update(session);
    }
  });

  logger.info('Copilot Fleet activated');
}

export function deactivate(): void {
  // Cleanup handled by disposables
}
