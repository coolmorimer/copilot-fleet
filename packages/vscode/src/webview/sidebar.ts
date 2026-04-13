import * as vscode from 'vscode';
import { AgentRegistry } from '@copilot-fleet/agents';

import type { FleetStatusSnapshot } from '../status-bar.js';

interface RecentSession {
  readonly id: string;
  readonly task: string;
  readonly status: string;
  readonly startedAt: string;
}

interface SidebarState {
  readonly version: string;
  readonly agentCount: number;
  readonly status: FleetStatusSnapshot;
  readonly recentSessions: readonly RecentSession[];
}

export class FleetSidebarProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = 'copilot-fleet.sidebar';

  private readonly agentRegistry = new AgentRegistry();
  private readonly disposables: vscode.Disposable[] = [];
  private view: vscode.WebviewView | undefined;
  private state: SidebarState;

  constructor(private readonly extensionUri: vscode.Uri) {
    this.agentRegistry.loadBuiltins();
    this.state = {
      version: '0.1.0',
      agentCount: this.agentRegistry.getAll().length,
      status: {
        status: 'idle',
        label: 'Idle',
        task: null,
        startedAt: null,
        progress: null,
      },
      recentSessions: [],
    };
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken,
  ): void {
    void context;
    void token;

    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    const messageDisposable = webviewView.webview.onDidReceiveMessage((message: { readonly type?: string }) => {
      switch (message.type) {
        case 'openGraph':
          void vscode.commands.executeCommand('copilot-fleet.openGraph');
          return;
        case 'run':
          void vscode.commands.executeCommand('copilot-fleet.run');
          return;
        case 'loadTemplate':
          void vscode.commands.executeCommand('copilot-fleet.loadTemplate');
          return;
        case 'listAgents':
          void vscode.commands.executeCommand('copilot-fleet.listAgents');
          return;
        case 'ready':
          this.postState();
          return;
        default:
          return;
      }
    });

    this.disposables.push(messageDisposable);
    this.postState();
  }

  updateStatus(status: FleetStatusSnapshot): void {
    this.state = { ...this.state, status };
    if (status.status === 'running' && status.task && status.startedAt) {
      this.recordSession(status.task, 'running', status.startedAt);
    }
    this.postState();
  }

  postMessage(message: Record<string, unknown>): void {
    if (!this.view) {
      return;
    }

    void this.view.webview.postMessage(message);
  }

  dispose(): void {
    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
  }

  private recordSession(task: string, status: string, startedAt: string): void {
    const nextSession: RecentSession = {
      id: `${startedAt}:${task}`,
      task,
      status,
      startedAt,
    };

    const deduped = this.state.recentSessions.filter((session) => session.id !== nextSession.id);
    this.state = {
      ...this.state,
      recentSessions: [nextSession, ...deduped].slice(0, 4),
    };
  }

  private postState(): void {
    this.postMessage({
      type: 'state',
      state: this.state,
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const cspSource = webview.cspSource;
    const iconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'fleet-icon.svg'));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data:; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${cspSource}; connect-src ${cspSource};">
  <title>CopilotFleet Sidebar</title>
  <style>
    :root { --bg: #09101c; --surface-alt: rgba(24, 38, 62, 0.92); --border: rgba(114, 140, 173, 0.22); --accent-soft: rgba(83, 183, 255, 0.16); --text: #e6eef8; --muted: #8da4bf; --success: #4ade80; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 16px; color: var(--text); font: 13px/1.45 'Segoe UI', system-ui, sans-serif; background: radial-gradient(circle at top, rgba(83, 183, 255, 0.14), transparent 28%), linear-gradient(180deg, #08101a 0%, #0c1423 100%); }
    .stack { display: grid; gap: 14px; }
    .card { border: 1px solid var(--border); border-radius: 18px; padding: 14px; background: linear-gradient(180deg, rgba(18, 27, 45, 0.96), rgba(10, 16, 28, 0.96)); box-shadow: 0 14px 32px rgba(0, 0, 0, 0.26); }
    .header { display: flex; align-items: center; gap: 10px; }
    .header img { width: 18px; height: 18px; }
    .title { font-size: 15px; font-weight: 700; }
    .version { margin-left: auto; color: var(--muted); font-size: 11px; }
    .status-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
    .status-pill { display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 999px; background: rgba(21, 34, 58, 0.92); color: #d9e7f8; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--success); box-shadow: 0 0 12px rgba(74, 222, 128, 0.62); }
    .muted { color: var(--muted); }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .action-btn { border: 1px solid var(--border); border-radius: 14px; background: var(--surface-alt); color: var(--text); padding: 10px; text-align: left; cursor: pointer; transition: 160ms ease; }
    .action-btn:hover { border-color: rgba(83, 183, 255, 0.46); background: var(--accent-soft); }
    .action-btn strong { display: block; margin-bottom: 2px; }
    .metric { display: flex; align-items: baseline; justify-content: space-between; margin-top: 8px; }
    .metric-value { font-size: 22px; font-weight: 700; }
    .session { display: none; margin-top: 10px; padding: 10px; border-radius: 14px; background: rgba(12, 20, 35, 0.92); }
    .session.visible { display: block; }
    .session-task { font-weight: 700; margin-bottom: 6px; }
    .tips, .recent-list { margin: 0; padding-left: 18px; color: var(--muted); }
    .recent-list li { margin-bottom: 8px; }
    .empty { color: var(--muted); }
  </style>
</head>
<body>
  <div class="stack">
    <section class="card">
      <div class="header"><img src="${iconUri}" alt=""><div class="title">CopilotFleet</div><div class="version" id="version">v0.1.0</div></div>
    </section>
    <section class="card">
      <div class="status-row"><div class="status-pill"><span class="status-dot"></span><span id="status-text">Idle</span></div><span class="muted" id="progress-text">Waiting</span></div>
      <div class="muted" id="status-detail">No active session.</div>
      <div class="session" id="session-card"><div class="session-task" id="session-task"></div><div class="muted" id="session-meta"></div></div>
    </section>
    <section class="card">
      <div class="actions">
        <button class="action-btn" type="button" data-command="run"><strong>Run</strong><span class="muted">Start a task</span></button>
        <button class="action-btn" type="button" data-command="openGraph"><strong>Graph</strong><span class="muted">Open editor</span></button>
        <button class="action-btn" type="button" data-command="loadTemplate"><strong>Templates</strong><span class="muted">Load starter flow</span></button>
        <button class="action-btn" type="button" data-command="listAgents"><strong>Agents</strong><span class="muted">Browse registry</span></button>
      </div>
      <div class="metric"><span class="muted">Available agents</span><span class="metric-value" id="agent-count">0</span></div>
    </section>
    <section class="card">
      <div class="title" style="font-size: 13px; margin-bottom: 10px;">Getting Started</div>
      <ul class="tips">
        <li>Use @fleet /plan to preview the decomposition before you run it.</li>
        <li>Open Graph when you want a visual pipeline instead of chat-first control.</li>
        <li>Load a template to bootstrap a quick fix, feature squad, or security audit flow.</li>
      </ul>
    </section>
    <section class="card">
      <div class="title" style="font-size: 13px; margin-bottom: 10px;">Recent Sessions</div>
      <ul class="recent-list" id="recent-list"><li class="empty">No sessions yet.</li></ul>
    </section>
  </div>
  <script nonce="${nonce}">
    const vscodeApi = acquireVsCodeApi();
    const statusText = document.getElementById('status-text');
    const statusDetail = document.getElementById('status-detail');
    const progressText = document.getElementById('progress-text');
    const sessionCard = document.getElementById('session-card');
    const sessionTask = document.getElementById('session-task');
    const sessionMeta = document.getElementById('session-meta');
    const agentCount = document.getElementById('agent-count');
    const version = document.getElementById('version');
    const recentList = document.getElementById('recent-list');
    document.querySelectorAll('[data-command]').forEach((button) => {
      button.addEventListener('click', () => {
        const type = button.getAttribute('data-command');
        if (type) {
          vscodeApi.postMessage({ type });
        }
      });
    });
    function formatStartedAt(value) {
      if (!value) {
        return 'Just now';
      }
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? 'Just now' : date.toLocaleTimeString();
    }
    function renderRecentSessions(items) {
      if (!recentList) {
        return;
      }
      recentList.innerHTML = '';
      if (!Array.isArray(items) || items.length === 0) {
        recentList.innerHTML = '<li class="empty">No sessions yet.</li>';
        return;
      }
      for (const item of items) {
        const entry = document.createElement('li');
        const task = typeof item.task === 'string' ? item.task : 'Untitled task';
        const status = typeof item.status === 'string' ? item.status : 'unknown';
        const startedAt = typeof item.startedAt === 'string' ? formatStartedAt(item.startedAt) : 'Just now';
        entry.textContent = task + ' - ' + status + ' - ' + startedAt;
        recentList.appendChild(entry);
      }
    }
    window.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || message.type !== 'state' || !message.state) {
        return;
      }
      const state = message.state;
      if (version && typeof state.version === 'string') {
        version.textContent = 'v' + state.version;
      }
      if (agentCount && typeof state.agentCount === 'number') {
        agentCount.textContent = String(state.agentCount);
      }
      const status = state.status ?? {};
      if (statusText && typeof status.label === 'string') {
        statusText.textContent = status.label;
      }
      if (progressText) {
        progressText.textContent = typeof status.progress === 'number' ? status.progress + '% complete' : 'Waiting';
      }
      const isRunning = status.status === 'running' && typeof status.task === 'string';
      if (statusDetail) {
        statusDetail.textContent = isRunning ? 'Session is active in the extension host.' : 'No active session.';
      }
      if (sessionCard && sessionTask && sessionMeta) {
        sessionCard.classList.toggle('visible', isRunning);
        sessionTask.textContent = isRunning ? status.task : '';
        sessionMeta.textContent = isRunning ? 'Started ' + formatStartedAt(status.startedAt) : '';
      }
      renderRecentSessions(state.recentSessions);
    });
    vscodeApi.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let index = 0; index < 32; index += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
