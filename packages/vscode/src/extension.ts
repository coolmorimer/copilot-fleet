import * as vscode from 'vscode';

import { registerCommands } from './commands.js';
import { FleetChatParticipant } from './chat/participant.js';
import { FleetStatusBar } from './status-bar.js';
import { FleetSidebarProvider } from './webview/sidebar.js';
import { GraphPanel } from './webview/graph-panel.js';

export function activate(context: vscode.ExtensionContext): void {
  const statusBar = new FleetStatusBar();
  const sidebar = new FleetSidebarProvider(context.extensionUri);
  const participant = new FleetChatParticipant(context, statusBar);

  context.subscriptions.push(statusBar);
  context.subscriptions.push(participant);
  context.subscriptions.push(sidebar);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(FleetSidebarProvider.viewType, sidebar, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
  context.subscriptions.push(registerCommands({ context, statusBar, sidebar }));
  context.subscriptions.push(
    statusBar.onDidChange((snapshot) => {
      sidebar.updateStatus(snapshot);
      GraphPanel.postMessage({ type: 'status', status: snapshot });
    }),
  );
}

export function deactivate(): void {
  if (GraphPanel.currentPanel) {
    GraphPanel.currentPanel.dispose();
  }
}
