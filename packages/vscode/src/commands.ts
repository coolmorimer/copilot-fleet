import * as vscode from 'vscode';
import { AgentRegistry } from '@copilot-fleet/agents';

import type { FleetSidebarProvider } from './webview/sidebar.js';
import type { FleetStatusBar } from './status-bar.js';
import { GraphPanel } from './webview/graph-panel.js';

interface CommandDependencies {
  readonly context: vscode.ExtensionContext;
  readonly statusBar: FleetStatusBar;
  readonly sidebar: FleetSidebarProvider;
}

interface TemplateDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}

const templates: readonly TemplateDefinition[] = [
  { id: 'quick-fix', label: 'Quick Fix', description: '1 agent, fast fix' },
  { id: 'feature-squad', label: 'Feature Squad', description: '3 agents: plan -> code -> review' },
  { id: 'fullstack-team', label: 'Fullstack Team', description: '6 agents, full pipeline' },
  { id: 'refactor-platoon', label: 'Refactor Platoon', description: 'Refactoring pipeline' },
  { id: 'security-audit', label: 'Security Audit', description: 'Security audit flow' },
];

export function registerCommands(dependencies: CommandDependencies): vscode.Disposable {
  const { context, statusBar, sidebar } = dependencies;
  const registry = new AgentRegistry();
  registry.loadBuiltins();

  const commandDisposables = [
    vscode.commands.registerCommand('copilot-fleet.openGraph', () => {
      GraphPanel.createOrShow(context.extensionUri);
    }),
    vscode.commands.registerCommand('copilot-fleet.run', async (taskFromCaller?: string) => {
      const task = await resolveTask(taskFromCaller);
      if (!task) {
        return;
      }

      statusBar.setRunning(task);
      sidebar.updateStatus(statusBar.getSnapshot());
      GraphPanel.postMessage({ type: 'status', status: statusBar.getSnapshot() });
      await vscode.window.showInformationMessage(`CopilotFleet started: ${task}`);
    }),
    vscode.commands.registerCommand('copilot-fleet.stop', async () => {
      statusBar.setIdle();
      sidebar.updateStatus(statusBar.getSnapshot());
      GraphPanel.postMessage({ type: 'status', status: statusBar.getSnapshot() });
      await vscode.window.showInformationMessage('CopilotFleet stopped');
    }),
    vscode.commands.registerCommand('copilot-fleet.abort', async () => {
      await vscode.commands.executeCommand('copilot-fleet.stop');
    }),
    vscode.commands.registerCommand('copilot-fleet.status', async () => {
      const snapshot = statusBar.getSnapshot();
      const detail = snapshot.task ? `${snapshot.label}: ${snapshot.task}` : snapshot.label;
      await vscode.window.showInformationMessage(`CopilotFleet status - ${detail}`);
    }),
    vscode.commands.registerCommand('copilot-fleet.openSidebar', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.copilot-fleet');
    }),
    vscode.commands.registerCommand('copilot-fleet.loadTemplate', async () => {
      const pick = await vscode.window.showQuickPick(
        templates.map((template) => ({
          label: template.label,
          description: template.description,
          templateId: template.id,
        })),
        { placeHolder: 'Select a CopilotFleet template' },
      );

      if (!pick) {
        return;
      }

      GraphPanel.createOrShow(context.extensionUri);
      GraphPanel.postMessage({ type: 'loadTemplate', templateId: pick.templateId });
      sidebar.postMessage({ type: 'loadTemplate', templateId: pick.templateId });
      await vscode.window.showInformationMessage(`Loaded template: ${pick.label}`);
    }),
    vscode.commands.registerCommand('copilot-fleet.listAgents', async () => {
      const agents = registry.getAll();
      const pick = await vscode.window.showQuickPick(
        agents.map((agent) => ({
          label: agent.displayName,
          description: agent.description,
          detail: `${agent.provider} | ${agent.model}`,
        })),
        { placeHolder: `Available agents: ${agents.length}` },
      );

      if (pick) {
        await vscode.window.showInformationMessage(`${pick.label} - ${pick.detail}`);
      }
    }),
  ];

  return vscode.Disposable.from(...commandDisposables);
}

async function resolveTask(taskFromCaller?: string): Promise<string | undefined> {
  const initialValue = typeof taskFromCaller === 'string' ? taskFromCaller.trim() : '';
  if (initialValue) {
    return initialValue;
  }

  const value = await vscode.window.showInputBox({
    prompt: 'Describe the task for CopilotFleet',
    placeHolder: 'Refactor authentication flow and add tests',
    ignoreFocusOut: true,
  });

  return value?.trim() || undefined;
}
