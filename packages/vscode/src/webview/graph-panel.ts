import * as vscode from 'vscode';

interface GraphWebviewMessage {
  readonly type: string;
}

export class GraphPanel implements vscode.Disposable {
  public static currentPanel: GraphPanel | undefined;
  private static readonly viewType = 'copilot-fleet.graphEditor';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly disposables: vscode.Disposable[] = [];
  private isDisposed = false;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.panel.webview.html = this.getHtmlContent();

    this.panel.webview.onDidReceiveMessage(
      (message: GraphWebviewMessage) => {
        void this.handleMessage(message);
      },
      undefined,
      this.disposables,
    );

    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
  }

  static createOrShow(extensionUri: vscode.Uri): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
    if (GraphPanel.currentPanel) {
      GraphPanel.currentPanel.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      GraphPanel.viewType,
      'CopilotFleet Graph',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    );

    GraphPanel.currentPanel = new GraphPanel(panel, extensionUri);
  }

  static postMessage(message: Record<string, unknown>): void {
    if (!GraphPanel.currentPanel || GraphPanel.currentPanel.isDisposed) {
      return;
    }

    void GraphPanel.currentPanel.panel.webview.postMessage(message);
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    GraphPanel.currentPanel = undefined;
    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
  }

  private async handleMessage(message: GraphWebviewMessage): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    switch (message.type) {
      case 'ready':
        return;
      case 'run':
        await vscode.commands.executeCommand('copilot-fleet.run');
        return;
      case 'stop':
        await vscode.commands.executeCommand('copilot-fleet.stop');
        return;
      case 'saveGraph':
        await vscode.window.showInformationMessage('Fleet: Graph saved');
        return;
      default:
        return;
    }
  }

  private getHtmlContent(): string {
    const webview = this.panel.webview;
    const nonce = getNonce();
    const cspSource = webview.cspSource;
    const iconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'fleet-icon.svg'));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} https: data:; font-src ${cspSource}; connect-src ${cspSource}; script-src 'nonce-${nonce}';">
  <title>CopilotFleet Graph Editor</title>
  <style>
    :root { --bg: #0d1321; --surface: rgba(20, 33, 56, 0.92); --border: rgba(116, 141, 174, 0.24); --accent: #53b7ff; --accent-soft: rgba(83, 183, 255, 0.16); --danger: #ff6b8a; --text: #e7eef8; --muted: #8ea3bf; --success: #4ade80; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; color: var(--text); font: 13px/1.5 'Segoe UI', system-ui, sans-serif; background: radial-gradient(circle at top, rgba(55, 104, 191, 0.24), transparent 34%), linear-gradient(180deg, #09101c 0%, var(--bg) 100%); }
    .toolbar, .status-bar { display: flex; align-items: center; gap: 10px; padding: 10px 16px; backdrop-filter: blur(18px); background: rgba(12, 20, 35, 0.82); }
    .toolbar { border-bottom: 1px solid var(--border); }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; letter-spacing: 0.04em; }
    .brand img { width: 18px; height: 18px; }
    .spacer { flex: 1; }
    .toolbar-btn { border: 1px solid var(--border); border-radius: 10px; background: rgba(21, 34, 58, 0.92); color: var(--text); padding: 7px 12px; cursor: pointer; transition: 160ms ease; }
    .toolbar-btn:hover { transform: translateY(-1px); border-color: rgba(83, 183, 255, 0.48); background: rgba(29, 46, 78, 0.96); }
    .toolbar-btn.primary { background: linear-gradient(135deg, #1f7ae0, #53b7ff); border-color: rgba(83, 183, 255, 0.62); color: #07111f; font-weight: 700; }
    .toolbar-btn.danger { color: #ffc8d3; border-color: rgba(255, 107, 138, 0.45); }
    .toolbar-btn.danger:hover { background: rgba(255, 107, 138, 0.16); }
    .canvas-area { position: relative; flex: 1; overflow: hidden; background-color: var(--bg); background-image: radial-gradient(circle, rgba(116, 141, 174, 0.22) 1px, transparent 1px); background-size: 22px 22px; }
    .canvas-area::after { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at center, transparent 30%, rgba(9, 16, 28, 0.62) 100%); pointer-events: none; }
    .node-palette { position: absolute; top: 18px; left: 18px; width: 220px; padding: 14px; border: 1px solid var(--border); border-radius: 18px; background: linear-gradient(180deg, rgba(19, 29, 49, 0.94), rgba(10, 16, 28, 0.92)); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28); z-index: 1; }
    .node-palette h3 { margin: 0 0 10px; font-size: 11px; color: var(--muted); letter-spacing: 0.12em; text-transform: uppercase; }
    .palette-section { margin-bottom: 14px; }
    .palette-section-title { margin: 0 0 6px; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
    .palette-item { width: 100%; text-align: left; margin: 0 0 4px; padding: 8px 10px; border: 1px solid transparent; border-radius: 10px; background: transparent; color: var(--text); cursor: grab; }
    .palette-item:hover { border-color: rgba(83, 183, 255, 0.28); background: var(--accent-soft); }
    .canvas-placeholder { position: absolute; inset: 0; display: grid; place-items: center; padding: 32px; text-align: center; }
    .placeholder-card { max-width: 480px; padding: 28px; border: 1px solid var(--border); border-radius: 24px; background: rgba(11, 19, 33, 0.72); box-shadow: 0 18px 48px rgba(0, 0, 0, 0.3); }
    .placeholder-card h2 { margin: 0 0 8px; font-size: 24px; }
    .placeholder-card p { margin: 0 0 12px; color: var(--muted); }
    .hint { display: inline-block; margin-top: 10px; padding: 6px 10px; border-radius: 999px; background: rgba(21, 34, 58, 0.9); color: #bbd0ea; }
    .status-bar { justify-content: space-between; border-top: 1px solid var(--border); color: var(--muted); font-size: 11px; }
    .status-pill { display: inline-flex; align-items: center; gap: 8px; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--success); box-shadow: 0 0 12px rgba(74, 222, 128, 0.6); }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="brand"><img src="${iconUri}" alt=""><span>CopilotFleet</span></div>
    <div class="spacer"></div>
    <button class="toolbar-btn primary" data-command="run">Run</button>
    <button class="toolbar-btn danger" data-command="stop">Stop</button>
    <button class="toolbar-btn" data-command="saveGraph">Save</button>
  </div>
  <div class="canvas-area">
    <aside class="node-palette" aria-label="Node palette">
      <h3>Node Palette</h3>
      <div class="palette-section"><div class="palette-section-title">Triggers</div><button class="palette-item" type="button">Start</button></div>
      <div class="palette-section"><div class="palette-section-title">Agents</div><button class="palette-item" type="button">Coder</button><button class="palette-item" type="button">Reviewer</button><button class="palette-item" type="button">Tester</button><button class="palette-item" type="button">Researcher</button><button class="palette-item" type="button">Planner</button></div>
      <div class="palette-section"><div class="palette-section-title">Logic</div><button class="palette-item" type="button">Splitter</button><button class="palette-item" type="button">Merger</button><button class="palette-item" type="button">Condition</button><button class="palette-item" type="button">Human</button></div>
      <div class="palette-section"><div class="palette-section-title">Output</div><button class="palette-item" type="button">Output</button></div>
    </aside>
    <div class="canvas-placeholder">
      <div class="placeholder-card">
        <h2 id="placeholder-title">CopilotFleet Graph Editor</h2>
        <p>Drag nodes from the palette to sketch an orchestration flow.</p>
        <p>This placeholder webview is wired for commands, CSP, and extension-host messaging.</p>
        <span class="hint">Full React Flow canvas can replace this shell once the web build is embedded.</span>
      </div>
    </div>
  </div>
  <div class="status-bar">
    <span class="status-pill"><span class="status-dot"></span><span id="status-label">Ready</span></span>
    <span>CopilotFleet v0.1.0</span>
  </div>
  <script nonce="${nonce}">
    const vscodeApi = acquireVsCodeApi();
    const titleElement = document.getElementById('placeholder-title');
    const statusElement = document.getElementById('status-label');
    document.querySelectorAll('[data-command]').forEach((button) => {
      button.addEventListener('click', () => {
        const type = button.getAttribute('data-command');
        if (type) {
          vscodeApi.postMessage({ type });
        }
      });
    });
    window.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || typeof message.type !== 'string') {
        return;
      }
      if (message.type === 'loadTemplate' && typeof message.templateId === 'string' && titleElement) {
        titleElement.textContent = 'Template: ' + message.templateId;
      }
      if (message.type === 'status' && message.status && typeof message.status.label === 'string' && statusElement) {
        statusElement.textContent = message.status.label;
      }
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
