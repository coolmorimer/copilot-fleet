import * as vscode from 'vscode';
import { FleetEngine } from '../core/engine';
import { FleetSession, SubTask } from '../core/state';
import { agentRegistry, AgentDefinition } from '../core/agents';
import { SVG } from './icons';

export class WorkflowPanel {
  private static instance: WorkflowPanel | undefined;
  private readonly panel: vscode.WebviewPanel;

  private constructor(
    extensionUri: vscode.Uri,
    private readonly engine: FleetEngine
  ) {
    this.panel = vscode.window.createWebviewPanel(
      'copilot-fleet.workflow',
      'Fleet Workflow',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [extensionUri] }
    );

    this.panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'fleet-icon.svg');
    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage(msg => {
      switch (msg.type) {
        case 'mergePR': vscode.commands.executeCommand('copilot-fleet.mergePR', msg.taskId); break;
        case 'mergeAll': vscode.commands.executeCommand('copilot-fleet.mergeAll'); break;
        case 'amendTask': vscode.commands.executeCommand('copilot-fleet.amendTask', msg.taskId, msg.value); break;
        case 'launch': vscode.commands.executeCommand('copilot-fleet.launch'); break;
        case 'syncWorkspace': vscode.commands.executeCommand('copilot-fleet.syncWorkspace'); break;
        case 'forceComplete': vscode.commands.executeCommand('copilot-fleet.forceComplete'); break;
        case 'resetSession': {
          this.engine.reset();
          this.update(undefined);
          break;
        }
        case 'createSession': {
          try {
            const s = this.engine.createManualSession(msg.prompt, msg.repo, msg.branch);
            this.update(s);
          } catch (err) {
            vscode.window.showErrorMessage(`Fleet: ${err}`);
          }
          break;
        }
        case 'addTask': {
          try {
            this.engine.addTask(msg.task);
            this.update(this.engine.session);
          } catch (err) {
            vscode.window.showErrorMessage(`Fleet: ${err}`);
          }
          break;
        }
        case 'editTask': {
          try {
            this.engine.editTask(msg.taskId, msg.update);
            this.update(this.engine.session);
          } catch (err) {
            vscode.window.showErrorMessage(`Fleet: ${err}`);
          }
          break;
        }
        case 'removeTask': {
          try {
            this.engine.removeTask(msg.taskId);
            this.update(this.engine.session);
          } catch (err) {
            vscode.window.showErrorMessage(`Fleet: ${err}`);
          }
          break;
        }
        case 'assignAgent': {
          const session = this.engine.session;
          if (session) {
            const task = session.tasks.find(t => t.id === msg.taskId);
            if (task) {
              task.agentId = msg.agentId;
              this.update(session);
            }
          }
          break;
        }
        case 'openIssue': case 'openPR': {
          const session = this.engine.session;
          if (session) {
            const task = session.tasks.find(t => t.id === msg.taskId);
            const url = msg.type === 'openIssue' ? task?.issueUrl : task?.prUrl;
            if (url) { vscode.env.openExternal(vscode.Uri.parse(url)); }
          }
          break;
        }
      }
    });

    this.panel.onDidDispose(() => { WorkflowPanel.instance = undefined; });
  }

  static show(extensionUri: vscode.Uri, engine: FleetEngine): WorkflowPanel {
    if (WorkflowPanel.instance) {
      WorkflowPanel.instance.panel.reveal();
      return WorkflowPanel.instance;
    }
    WorkflowPanel.instance = new WorkflowPanel(extensionUri, engine);
    return WorkflowPanel.instance;
  }

  update(session: FleetSession | undefined): void {
    const agents = agentRegistry.getAllAgents();
    this.panel.webview.postMessage({ type: 'state', data: session ?? null, agents });
  }

  private getHtml(): string {
    const icons = JSON.stringify(SVG).replace(/</g, '\\x3c');
    const agents = JSON.stringify(agentRegistry.getAllAgents()).replace(/</g, '\\x3c');
    return /* html */`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:var(--vscode-editor-background);--fg:var(--vscode-foreground);--border:var(--vscode-widget-border);
--grid:#ffffff08;--node-bg:var(--vscode-editor-background);--node-border:var(--vscode-widget-border);
--accent:var(--vscode-focusBorder);--desc:var(--vscode-descriptionForeground);
--input-bg:var(--vscode-input-background);--input-border:var(--vscode-input-border);
--input-fg:var(--vscode-input-foreground);--panel-bg:var(--vscode-sideBar-background)}
body{background:var(--bg);color:var(--fg);font-family:var(--vscode-font-family);font-size:13px;overflow:hidden;height:100vh}

/* Toolbar */
.toolbar{display:flex;align-items:center;gap:8px;padding:8px 16px;background:var(--bg);border-bottom:1px solid var(--border);z-index:10;flex-shrink:0}
.toolbar-title{font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.6px;display:flex;align-items:center;gap:6px}
.toolbar-title svg{width:16px;height:16px}
.toolbar-spacer{flex:1}
.btn{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border:none;border-radius:4px;font-size:11px;cursor:pointer;font-family:inherit;transition:opacity .15s}
.btn:hover{opacity:.85}
.btn:disabled{opacity:.4;cursor:default}
.btn svg{width:14px;height:14px}
.btn-primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
.btn-secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
.btn-success{background:#2e7d32;color:#fff}
.btn-launch{background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;font-weight:600;padding:6px 16px;font-size:12px}
.btn-sync{background:linear-gradient(135deg,#059669,#10b981);color:#fff;font-weight:600;padding:6px 14px;font-size:12px}
.badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600}
.badge.running{background:#1565c0;color:#fff}
.badge.completed{background:#2e7d32;color:#fff}
.badge.failed{background:#c62828;color:#fff}
.badge.planning,.badge.awaiting_approval{background:#6a1b9a;color:#fff}
.badge.aborted{background:#e65100;color:#fff}

/* Layout */
.layout{display:flex;flex-direction:column;height:100vh}
.main{display:flex;flex:1;overflow:hidden}

/* Canvas */
.canvas-wrap{position:relative;flex:1;overflow:hidden;cursor:grab}
.canvas-wrap.grabbing{cursor:grabbing}
.canvas-inner{position:absolute;transform-origin:0 0}
.grid{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,var(--grid) 1px,transparent 1px);background-size:24px 24px}

/* Edges */
.edges{position:absolute;inset:0;pointer-events:none}
.edge{fill:none;stroke:var(--desc);stroke-width:2;opacity:.4}
.edge.active{stroke:var(--accent);opacity:.8;stroke-width:2.5}
.edge.dep{stroke:#f59e0b;opacity:.6;stroke-dasharray:6 3}

/* Nodes */
.node{position:absolute;width:240px;border-radius:10px;background:var(--node-bg);border:2px solid var(--node-border);
box-shadow:0 2px 12px rgba(0,0,0,.2);cursor:pointer;transition:border-color .2s,box-shadow .2s;user-select:none}
.node:hover,.node.selected{border-color:var(--accent);box-shadow:0 4px 20px rgba(0,0,0,.35)}
.node.dragging{opacity:.9;z-index:100;cursor:grabbing}
.node-header{padding:8px 12px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:6px;font-weight:600;font-size:12px;color:#fff;cursor:grab}
.node-header svg{width:14px;height:14px;flex-shrink:0}
.node-header-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.node-body{padding:8px 12px;font-size:11px;line-height:1.4}
.node-files{font-size:10px;color:var(--desc);margin-top:4px}
.node-files code{font-size:10px;background:var(--input-bg);padding:1px 4px;border-radius:3px}
.node-status{display:flex;align-items:center;gap:4px;font-size:10px;padding:6px 12px;border-top:1px solid var(--border);color:var(--desc)}
.node-status svg{width:12px;height:12px}
.node-agent{display:flex;align-items:center;gap:4px;font-size:10px;padding:4px 12px;border-top:1px solid var(--border);color:var(--desc)}
.node-agent select{font-size:10px;background:var(--input-bg);color:var(--input-fg);border:1px solid var(--input-border);border-radius:3px;padding:2px 4px;font-family:inherit;cursor:pointer}
.node-port{width:10px;height:10px;border-radius:50%;background:var(--desc);position:absolute;cursor:crosshair;transition:background .15s}
.node-port:hover{background:var(--accent)}
.node-port.out{bottom:-5px;left:50%;margin-left:-5px}
.node-port.in{top:-5px;left:50%;margin-left:-5px}
.node-actions{display:flex;gap:4px;padding:4px 12px 8px;flex-wrap:wrap}
.node-actions .btn{padding:2px 8px;font-size:10px}

/* Node type colors */
.node-prompt .node-header{background:linear-gradient(135deg,#7c3aed,#2563eb)}
.node-decomposer .node-header{background:linear-gradient(135deg,#6366f1,#8b5cf6)}
.node-agent .node-header{background:#3b82f6}
.node-merge .node-header{background:linear-gradient(135deg,#059669,#10b981)}

/* Detail Panel (right side) */
.detail-panel{width:320px;background:var(--panel-bg);border-left:1px solid var(--border);overflow-y:auto;flex-shrink:0;display:none}
.detail-panel.open{display:block}
.detail-header{display:flex;align-items:center;gap:8px;padding:12px;border-bottom:1px solid var(--border);font-weight:600;font-size:13px}
.detail-header svg{width:16px;height:16px}
.detail-close{margin-left:auto;cursor:pointer;opacity:.6;background:none;border:none;color:var(--fg);padding:4px}
.detail-close:hover{opacity:1}
.detail-section{padding:10px 12px;border-bottom:1px solid var(--border)}
.detail-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--desc);margin-bottom:4px}
.detail-value{font-size:12px;line-height:1.5}
.detail-files{display:flex;flex-direction:column;gap:2px}
.detail-files code{font-size:11px;background:var(--input-bg);padding:2px 6px;border-radius:3px;display:inline-block}
.detail-desc{font-size:12px;line-height:1.5;white-space:pre-wrap;max-height:200px;overflow-y:auto}
.detail-select{width:100%;font-size:12px;background:var(--input-bg);color:var(--input-fg);border:1px solid var(--input-border);border-radius:4px;padding:4px 8px;font-family:inherit}
.detail-deps{display:flex;flex-wrap:wrap;gap:4px}
.detail-deps .dep-tag{font-size:10px;background:var(--input-bg);padding:2px 6px;border-radius:10px;color:var(--desc)}
.detail-actions{display:flex;flex-wrap:wrap;gap:6px;padding:12px}
.detail-amend-input{width:100%;font-size:12px;background:var(--input-bg);color:var(--input-fg);border:1px solid var(--input-border);border-radius:4px;padding:6px 8px;font-family:inherit;resize:vertical;min-height:60px;margin-bottom:6px}

/* Empty state */
.empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--desc);gap:12px}
.empty svg{width:64px;height:64px;opacity:.3}
.empty-title{font-size:16px;font-weight:600;color:var(--fg)}

/* Phase banner (planning state) */
.phase-banner{display:none;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border);background:linear-gradient(90deg,#7c3aed10,#2563eb10)}
.phase-banner.show{display:flex}
.phase-text{font-size:12px;flex:1}
.phase-text strong{font-size:13px}

/* Animations */
@keyframes spin{to{transform:rotate(360deg)}}
.spin{animation:spin 1s linear infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.pulse{animation:pulse 2s ease-in-out infinite}

/* Zoom controls */
.zoom-controls{position:absolute;bottom:16px;left:16px;display:flex;flex-direction:column;gap:4px;z-index:5}
.zoom-controls .btn{width:32px;height:32px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:6px;font-size:16px;font-weight:700}

/* Progress bar */
.progress-wrap{display:none;align-items:center;gap:8px;flex:1;max-width:200px}
.progress-wrap.show{display:flex}
.progress-bar{flex:1;height:6px;background:var(--input-bg);border-radius:3px;overflow:hidden}
.progress-fill{height:100%;background:linear-gradient(90deg,#2e7d32,#4caf50);border-radius:3px;transition:width .4s ease}

/* Session form (empty state) */
.session-form{display:flex;flex-direction:column;gap:10px;width:360px;text-align:left}
.session-form label{font-size:11px;font-weight:600;color:var(--desc);text-transform:uppercase;letter-spacing:.4px}
.session-form input,.session-form textarea{background:var(--input-bg);color:var(--input-fg);border:1px solid var(--input-border);border-radius:6px;padding:8px 10px;font-size:12px;font-family:inherit}
.session-form textarea{min-height:60px;resize:vertical}
.form-row{display:flex;gap:8px}
.form-row input{flex:1}
.form-actions{display:flex;gap:8px;margin-top:4px}

/* Editable fields in detail panel */
.detail-edit-input{width:100%;font-size:12px;background:var(--input-bg);color:var(--input-fg);border:1px solid var(--input-border);border-radius:4px;padding:6px 8px;font-family:inherit}
.detail-edit-textarea{width:100%;font-size:12px;background:var(--input-bg);color:var(--input-fg);border:1px solid var(--input-border);border-radius:4px;padding:6px 8px;font-family:inherit;resize:vertical;min-height:80px}
.file-tag{display:inline-flex;align-items:center;gap:3px;font-size:10px;background:var(--input-bg);padding:2px 6px;border-radius:10px;margin:2px}
.file-tag .remove-file{cursor:pointer;opacity:.6;font-size:10px}
.file-tag .remove-file:hover{opacity:1;color:#ef4444}
.add-file-row{display:flex;gap:4px;margin-top:4px}
.add-file-row input{flex:1;font-size:11px;background:var(--input-bg);color:var(--input-fg);border:1px solid var(--input-border);border-radius:3px;padding:3px 6px}
.btn-danger{background:#c62828;color:#fff}
</style></head><body>

<div class="layout">
  <!-- Toolbar -->
  <div class="toolbar">
    <div class="toolbar-title">${SVG.workflow} Fleet Workflow</div>
    <div class="toolbar-spacer"></div>
    <span id="statusBadge" class="badge" style="display:none"></span>
    <div class="progress-wrap" id="progressWrap">
      <div class="progress-bar"><div class="progress-fill" id="progressFill" style="width:0%"></div></div>
      <span id="progressText" style="font-size:11px;color:var(--desc)"></span>
    </div>
    <button id="btnAddTask" class="btn btn-secondary" style="display:none" onclick="addNewTask()">${SVG.plus} Задача</button>
    <button id="btnLaunch" class="btn btn-launch" style="display:none" onclick="send('launch')">${SVG.rocket} Запустить агентов</button>
    <button id="btnForceComplete" class="btn btn-secondary" style="display:none" onclick="send('forceComplete')">${SVG.check} Завершить</button>
    <button id="btnReset" class="btn btn-secondary" style="display:none" onclick="confirmReset()">${SVG.close} Сбросить</button>
    <button id="btnMergeAll" class="btn btn-success" style="display:none" onclick="send('mergeAll')">${SVG.gitMerge} Merge All</button>
    <button id="btnSync" class="btn btn-sync" style="display:none" onclick="send('syncWorkspace')">${SVG.sync} Sync to Workspace</button>
    <button class="btn btn-secondary" onclick="resetView()">${SVG.sync} Reset View</button>
  </div>

  <!-- Planning phase banner -->
  <div class="phase-banner" id="phaseBanner">
    <span>${SVG.info}</span>
    <div class="phase-text" id="phaseText"><strong>Планирование</strong><br>Просмотрите граф, назначьте агентов и нажмите «Запустить»</div>
  </div>

  <div class="main">
    <!-- Canvas -->
    <div class="canvas-wrap" id="canvasWrap">
      <div class="canvas-inner" id="canvasInner">
        <div class="grid"></div>
        <svg class="edges" id="edgesSvg"></svg>
        <div id="nodes"></div>
      </div>
      <div class="empty" id="emptyState">
        ${SVG.workflow}
        <div class="empty-title">Fleet Workflow Editor</div>
        <div style="margin-bottom:8px;color:var(--desc)">Создайте сессию вручную или используйте <code>@fleet /plan задача</code></div>
        <div class="session-form" id="sessionForm">
          <label>Задача</label>
          <textarea id="formPrompt" placeholder="Опишите задачу для агентов..."></textarea>
          <div class="form-row">
            <div style="flex:1"><label>Репозиторий</label><input id="formRepo" placeholder="owner/repo"></div>
            <div style="flex:1"><label>Ветка</label><input id="formBranch" placeholder="main" value="main"></div>
          </div>
          <div class="form-actions">
            <button class="btn btn-launch" onclick="createSession()">${SVG.rocket} Создать сессию</button>
            <button class="btn btn-secondary" onclick="createAndAddTask()">${SVG.plus} Создать + задача</button>
          </div>
        </div>
      </div>

      <!-- Zoom controls -->
      <div class="zoom-controls">
        <button class="btn btn-secondary" onclick="zoomIn()" title="Zoom In">+</button>
        <button class="btn btn-secondary" onclick="zoomOut()" title="Zoom Out">&minus;</button>
        <button class="btn btn-secondary" onclick="resetView()" title="Fit">${SVG.sync}</button>
      </div>
    </div>

    <!-- Detail Panel -->
    <div class="detail-panel" id="detailPanel">
      <div class="detail-header">
        <span id="detailIcon"></span>
        <span id="detailTitle">Детали узла</span>
        <button class="detail-close" onclick="closeDetail()">${SVG.close}</button>
      </div>
      <div id="detailContent"></div>
    </div>
  </div>
</div>

<script>
const vscode=acquireVsCodeApi();
const I=${icons};
const SI={pending:I.clock,dispatched:I.send,working:I.loading,pr_created:I.pullRequest,completed:I.check,failed:I.error,aborted:I.stop};
const SL={planning:'Планирование',awaiting_approval:'Ожидание подтверждения',running:'Выполняется',completed:'Завершено',failed:'Ошибка',aborted:'Остановлено'};
const TL={pending:'Ожидание',dispatched:'Назначено',working:'В работе',pr_created:'PR создан',completed:'Завершено',failed:'Ошибка',aborted:'Остановлено'};

const NODE_W=240,NODE_H=130,COL_GAP=300,ROW_GAP=180;
let pan={x:40,y:40},zoom=1,panStart=null;
let session=null,agents=${agents},selectedNode=null;

// Dragging state
let dragNode=null,dragOffset={x:0,y:0},nodePositions={};

function send(t,d){vscode.postMessage({type:t,...(d||{})});}

/* Pan & zoom */
const wrap=document.getElementById('canvasWrap');
const inner=document.getElementById('canvasInner');

wrap.addEventListener('pointerdown',e=>{
  const nodeEl=e.target.closest?.('.node');
  if(nodeEl && e.target.closest('.node-header') && !e.target.closest('select') && !e.target.closest('button')){
    // Drag node
    const id=nodeEl.getAttribute('data-id');
    if(id && nodePositions[id]){
      dragNode={id,el:nodeEl};
      const rect=inner.getBoundingClientRect();
      dragOffset={x:e.clientX/zoom-nodePositions[id].x-rect.left/zoom,y:e.clientY/zoom-nodePositions[id].y-rect.top/zoom};
      nodeEl.classList.add('dragging');
      wrap.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
  }
  if(e.target===wrap||e.target.classList.contains('grid')||e.target.tagName==='svg'){
    panStart={x:e.clientX-pan.x,y:e.clientY-pan.y};
    wrap.classList.add('grabbing');
    wrap.setPointerCapture(e.pointerId);
  }
});
wrap.addEventListener('pointermove',e=>{
  if(dragNode){
    const rect=inner.getBoundingClientRect();
    const nx=e.clientX/zoom-dragOffset.x-rect.left/zoom;
    const ny=e.clientY/zoom-dragOffset.y-rect.top/zoom;
    nodePositions[dragNode.id]={x:nx,y:ny};
    dragNode.el.style.left=nx+'px';
    dragNode.el.style.top=ny+'px';
    redrawEdges();
    return;
  }
  if(panStart){
    pan.x=e.clientX-panStart.x;
    pan.y=e.clientY-panStart.y;
    applyTransform();
  }
});
wrap.addEventListener('pointerup',()=>{
  if(dragNode){dragNode.el.classList.remove('dragging');dragNode=null;}
  panStart=null;wrap.classList.remove('grabbing');
});
wrap.addEventListener('wheel',e=>{
  e.preventDefault();
  const delta=e.deltaY>0?0.9:1.1;
  const newZoom=Math.max(0.2,Math.min(3,zoom*delta));
  const rect=wrap.getBoundingClientRect();
  const mx=e.clientX-rect.left,my=e.clientY-rect.top;
  pan.x=mx-(mx-pan.x)*(newZoom/zoom);
  pan.y=my-(my-pan.y)*(newZoom/zoom);
  zoom=newZoom;
  applyTransform();
},{passive:false});

function applyTransform(){inner.style.transform='translate('+pan.x+'px,'+pan.y+'px) scale('+zoom+')';}
function resetView(){pan={x:40,y:40};zoom=1;applyTransform();}
function zoomIn(){zoom=Math.min(3,zoom*1.2);applyTransform();}
function zoomOut(){zoom=Math.max(0.2,zoom/1.2);applyTransform();}
applyTransform();

/* State handler */
window.addEventListener('message',e=>{
  if(e.data.type==='state'){
    session=e.data.data;
    if(e.data.agents)agents=e.data.agents;
    render();
    vscode.setState({session});
  }
});

function render(){
  const empty=document.getElementById('emptyState');
  const nodesCont=document.getElementById('nodes');

  if(!session||!session.tasks||session.tasks.length===0){
    empty.style.display='flex';
    nodesCont.innerHTML='';
    document.getElementById('edgesSvg').innerHTML='';
    document.getElementById('statusBadge').style.display='none';
    document.getElementById('progressText').textContent='';
    document.getElementById('btnMergeAll').style.display='none';
    document.getElementById('btnLaunch').style.display='none';
    document.getElementById('btnSync').style.display='none';
    document.getElementById('phaseBanner').classList.remove('show');
    return;
  }

  empty.style.display='none';
  updateToolbar();
  layoutNodes();
  // Re-select if still valid
  if(selectedNode){
    const task=session.tasks.find(t=>t.id===selectedNode);
    if(task)showDetail(task);
    else closeDetail();
  }
}

function updateToolbar(){
  const badge=document.getElementById('statusBadge');
  badge.style.display='';
  badge.className='badge '+session.status;
  badge.innerHTML=(SI[session.status]||I.clock)+' '+(SL[session.status]||session.status);

  const done=session.tasks.filter(t=>t.status==='completed'||t.status==='pr_created').length;
  const total=session.tasks.length;
  const pct=total>0?Math.round(done/total*100):0;
  const pw=document.getElementById('progressWrap');
  pw.classList.toggle('show',total>0);
  document.getElementById('progressFill').style.width=pct+'%';
  document.getElementById('progressText').textContent=done+'/'+total+' ('+pct+'%)';

  const isPlanning=session.status==='planning'||session.status==='awaiting_approval';
  const isRunning=session.status==='running';
  const isDone=session.status==='completed'||session.status==='failed'||session.status==='aborted';
  const hasPRs=session.tasks.some(t=>t.status==='pr_created'&&t.prNumber);
  const allMerged=isDone&&session.tasks.filter(t=>t.status==='completed').length===session.tasks.length;

  // Add Task button: only in planning/approval phase
  document.getElementById('btnAddTask').style.display=isPlanning?'':'none';

  // Launch button: only in planning/approval phase with tasks
  document.getElementById('btnLaunch').style.display=(isPlanning&&total>0)?'':'none';

  // Force complete: when running (to unstick)
  document.getElementById('btnForceComplete').style.display=isRunning?'':'none';

  // Reset: always show when there is a session (to start fresh)
  document.getElementById('btnReset').style.display=(session)?'':'none';

  // Merge All: when there are PRs ready
  document.getElementById('btnMergeAll').style.display=hasPRs?'':'none';

  // Sync: after completion or when all tasks completed
  document.getElementById('btnSync').style.display=(isDone||allMerged)?'':'none';

  // Phase banner
  const banner=document.getElementById('phaseBanner');
  const phaseText=document.getElementById('phaseText');
  if(isPlanning){
    banner.classList.add('show');
    phaseText.innerHTML='<strong>Этап планирования</strong><br>Перетаскивайте узлы, назначайте агентов, затем нажмите «Запустить агентов»';
  } else if(isRunning){
    banner.classList.add('show');
    phaseText.innerHTML='<strong>Выполняется</strong><br>Агенты работают над задачами. Кликните на узел для деталей.';
  } else if(isDone && hasPRs){
    banner.classList.add('show');
    phaseText.innerHTML='<strong>Работа завершена</strong><br>Смержите PR и нажмите «Sync to Workspace» для загрузки изменений в рабочую область.';
  } else if(isDone){
    banner.classList.add('show');
    phaseText.innerHTML='<strong>Завершено</strong><br>Нажмите «Sync to Workspace» для загрузки изменений из Git в рабочую область.';
  } else {
    banner.classList.remove('show');
  }
}

function layoutNodes(){
  const nodesCont=document.getElementById('nodes');
  const edgesSvg=document.getElementById('edgesSvg');
  nodesCont.innerHTML='';
  edgesSvg.innerHTML='';

  const tasks=session.tasks;
  const pos=computeLayout(tasks);
  // Save positions for dragging (only if not already moved by user)
  for(const key of Object.keys(pos)){
    if(!nodePositions[key])nodePositions[key]=pos[key];
  }
  // Use nodePositions for rendering
  const np=nodePositions;

  // Compute SVG size
  let maxX=0,maxY=0;
  for(const p of Object.values(np)){maxX=Math.max(maxX,p.x+NODE_W+120);maxY=Math.max(maxY,p.y+200);}
  edgesSvg.setAttribute('width',maxX);
  edgesSvg.setAttribute('height',maxY);
  edgesSvg.style.width=maxX+'px';
  edgesSvg.style.height=maxY+'px';

  const isPlanning=session.status==='planning'||session.status==='awaiting_approval';

  // Prompt node
  const promptNode=makeSpecialNode('_prompt','node-prompt',I.rocket,
    session.prompt.slice(0,50)+(session.prompt.length>50?'...':''),
    session.repo+' | '+session.branch,np._prompt);
  nodesCont.appendChild(promptNode);

  // Decomposer node
  const decompNode=makeSpecialNode('_decomposer','node-decomposer',I.list,
    'Декомпозиция',tasks.length+' подзадач',np._decomposer);
  nodesCont.appendChild(decompNode);

  // Edge: prompt → decomposer
  drawEdge(edgesSvg,np._prompt,np._decomposer,false,false);

  // Agent task nodes
  tasks.forEach(task=>{
    const p=np[task.id];
    if(!p)return;
    const isActive=task.status==='working'||task.status==='dispatched';
    const node=document.createElement('div');
    node.className='node node-agent'+(selectedNode===task.id?' selected':'');
    node.style.left=p.x+'px';
    node.style.top=p.y+'px';
    node.setAttribute('data-id',task.id);

    // Header color by status
    let hc='#3b82f6';
    if(task.status==='completed'||task.status==='pr_created')hc='#2e7d32';
    else if(task.status==='failed')hc='#c62828';
    else if(isActive)hc='#1565c0';
    else if(isPlanning)hc='#7c3aed';

    // If agent assigned, use agent color
    const assignedAgent=agents.find(a=>a.id===task.agentId);
    if(assignedAgent)hc=assignedAgent.color;

    let h='<div class="node-header" style="background:'+hc+'">'+I.code+' <span class="node-header-title">'+esc(task.title)+'</span></div>';
    h+='<div class="node-body">';
    if(task.files&&task.files.length)h+='<div class="node-files">'+task.files.slice(0,3).map(f=>'<code>'+esc(f)+'</code>').join(' ')+(task.files.length>3?' +':'')+'</div>';
    if(task.description)h+='<div style="margin-top:4px;font-size:10px;max-height:28px;overflow:hidden;color:var(--desc)">'+esc(task.description.slice(0,80))+'</div>';
    h+='</div>';

    // Agent row (in planning mode, show dropdown; otherwise show assigned agent)
    if(isPlanning){
      h+='<div class="node-agent"><span style="flex-shrink:0">'+I.agents+'</span> <select class="agent-select" data-taskid="'+task.id+'" onchange="onAgentChange(this)">';
      h+='<option value="">Авто</option>';
      agents.forEach(a=>{h+='<option value="'+a.id+'"'+(task.agentId===a.id?' selected':'')+'>'+esc(a.name)+'</option>';});
      h+='</select></div>';
    } else if(assignedAgent){
      h+='<div class="node-agent">'+I.agents+' '+esc(assignedAgent.name)+'</div>';
    }

    // Status row
    const statusIcon=SI[task.status]||I.clock;
    h+='<div class="node-status">'+statusIcon+' '+(TL[task.status]||task.status);
    if(task.prNumber)h+=' #'+task.prNumber;
    h+='</div>';

    // Action buttons
    let actions='';
    if(task.status==='pr_created'&&task.prNumber){
      actions='<div class="node-actions">'
        +'<button class="btn btn-success" onclick="event.stopPropagation();send(\'mergePR\',{taskId:\''+task.id+'\'})">'+I.gitMerge+' Merge</button>'
        +'<button class="btn btn-secondary" onclick="event.stopPropagation();amendNode(\''+task.id+'\')">'+I.edit+' Amend</button>'
        +'</div>';
    } else if(isActive){
      actions='<div class="node-actions">'
        +'<button class="btn btn-secondary" onclick="event.stopPropagation();amendNode(\''+task.id+'\')">'+I.edit+' Amend</button>'
        +'</div>';
    }
    h+=actions;

    // Ports
    h+='<div class="node-port in"></div><div class="node-port out"></div>';
    node.innerHTML=h;

    // Click → show detail panel
    node.addEventListener('click',e=>{
      if(e.target.closest('select')||e.target.closest('button'))return;
      selectedNode=task.id;
      document.querySelectorAll('.node').forEach(n=>n.classList.remove('selected'));
      node.classList.add('selected');
      showDetail(task);
    });

    nodesCont.appendChild(node);

    // Edge: decomposer → agent
    drawEdge(edgesSvg,np._decomposer,p,isActive,false);

    // Dependency edges
    task.dependsOn.forEach(depId=>{
      const dp=np[depId];
      if(dp)drawEdge(edgesSvg,dp,p,false,true);
    });
  });

  // Merge node (always visible after planning)
  const completedOrPR=tasks.filter(t=>t.status==='pr_created'||t.status==='completed');
  if(np._merge){
    const mergeLabel=completedOrPR.length>0?completedOrPR.length+' PR':'Слияние';
    const mergeNode=makeSpecialNode('_merge','node-merge',I.gitMerge,'Merge',mergeLabel,np._merge);
    nodesCont.appendChild(mergeNode);
    // Edges from completed/PR tasks to merge
    tasks.forEach(t=>{
      const tp=np[t.id];
      if(tp)drawEdge(edgesSvg,tp,np._merge,false,false);
    });
  }
}

function makeSpecialNode(id,cls,icon,title,subtitle,pos){
  const node=document.createElement('div');
  node.className='node '+cls;
  node.style.left=pos.x+'px';
  node.style.top=pos.y+'px';
  node.setAttribute('data-id',id);
  node.innerHTML='<div class="node-header">'+icon+' <span class="node-header-title">'+esc(title)+'</span></div>'
    +'<div class="node-body" style="font-size:11px;color:var(--desc)">'+esc(subtitle)+'</div>'
    +(id!=='_prompt'?'<div class="node-port in"></div>':'')
    +'<div class="node-port out"></div>';
  return node;
}

function computeLayout(tasks){
  const pos={};
  // Topological layer assignment
  const layers={};const visited=new Set();
  function assignLayer(t,depth){
    if(visited.has(t.id))return layers[t.id]||0;
    visited.add(t.id);
    let maxDep=0;
    t.dependsOn.forEach(did=>{
      const dep=tasks.find(x=>x.id===did);
      if(dep)maxDep=Math.max(maxDep,assignLayer(dep,depth+1)+1);
    });
    layers[t.id]=maxDep;return maxDep;
  }
  tasks.forEach(t=>assignLayer(t,0));

  const byLayer={};
  tasks.forEach(t=>{const l=layers[t.id]||0;if(!byLayer[l])byLayer[l]=[];byLayer[l].push(t);});
  const layerKeys=Object.keys(byLayer).map(Number).sort((a,b)=>a-b);
  const maxPerRow=Math.max(...layerKeys.map(l=>byLayer[l].length),1);
  const totalWidth=Math.max(maxPerRow*COL_GAP,NODE_W+100);

  pos._prompt={x:totalWidth/2-NODE_W/2,y:0};
  pos._decomposer={x:totalWidth/2-NODE_W/2,y:ROW_GAP};

  let yBase=ROW_GAP*2;
  layerKeys.forEach(l=>{
    const group=byLayer[l];
    const rowWidth=group.length*COL_GAP;
    const xStart=(totalWidth-rowWidth)/2+COL_GAP/2-NODE_W/2;
    group.forEach((t,i)=>{pos[t.id]={x:xStart+i*COL_GAP,y:yBase+l*ROW_GAP};});
  });

  const maxY=Math.max(...tasks.map(t=>pos[t.id]?.y||0),yBase);
  pos._merge={x:totalWidth/2-NODE_W/2,y:maxY+ROW_GAP};
  return pos;
}

function drawEdge(svg,from,to,active,isDep){
  const x1=from.x+NODE_W/2,y1=from.y+130;
  const x2=to.x+NODE_W/2,y2=to.y;
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  const my=(y1+y2)/2;
  path.setAttribute('d','M'+x1+','+y1+' C'+x1+','+(my)+' '+x2+','+(my)+' '+x2+','+y2);
  path.classList.add('edge');
  if(active)path.classList.add('active');
  if(isDep)path.classList.add('dep');
  svg.appendChild(path);
}

function redrawEdges(){
  if(!session)return;
  const svg=document.getElementById('edgesSvg');
  svg.innerHTML='';
  const np=nodePositions;
  let maxX=0,maxY=0;
  for(const p of Object.values(np)){maxX=Math.max(maxX,p.x+NODE_W+120);maxY=Math.max(maxY,p.y+200);}
  svg.setAttribute('width',maxX);svg.setAttribute('height',maxY);
  svg.style.width=maxX+'px';svg.style.height=maxY+'px';

  // prompt → decomposer
  drawEdge(svg,np._prompt,np._decomposer,false,false);
  // decomposer → agents
  session.tasks.forEach(t=>{
    const p=np[t.id];if(!p)return;
    const isActive=t.status==='working'||t.status==='dispatched';
    drawEdge(svg,np._decomposer,p,isActive,false);
    t.dependsOn.forEach(did=>{const dp=np[did];if(dp)drawEdge(svg,dp,p,false,true);});
    // agent → merge
    if(np._merge)drawEdge(svg,p,np._merge,false,false);
  });
}

/* Detail panel */
function showDetail(task){
  const panel=document.getElementById('detailPanel');
  const content=document.getElementById('detailContent');
  panel.classList.add('open');

  document.getElementById('detailIcon').innerHTML=I.code;
  document.getElementById('detailTitle').textContent=task.title;

  let html='';
  const isPlanning=session.status==='planning'||session.status==='awaiting_approval';

  // Title (editable in planning)
  if(isPlanning){
    html+='<div class="detail-section"><div class="detail-label">Название</div>';
    html+='<input class="detail-edit-input" id="editTitle" value="'+esc(task.title)+'" onchange="saveField(\''+task.id+'\',\'title\',this.value)">';
    html+='</div>';
  }

  // Status
  html+='<div class="detail-section"><div class="detail-label">Статус</div><div class="detail-value">'+(SI[task.status]||'')+' '+(TL[task.status]||task.status);
  if(task.prNumber)html+=' — PR #'+task.prNumber;
  if(task.issueNumber)html+=' — Issue #'+task.issueNumber;
  html+='</div></div>';

  // Agent
  html+='<div class="detail-section"><div class="detail-label">Агент</div>';
  if(isPlanning){
    html+='<select class="detail-select" onchange="onDetailAgentChange(this,\''+task.id+'\')">';
    html+='<option value="">Авто (выбор по задаче)</option>';
    agents.forEach(a=>{html+='<option value="'+a.id+'"'+(task.agentId===a.id?' selected':'')+'>'+esc(a.name)+' — '+esc(a.description)+'</option>';});
    html+='</select>';
  } else {
    const ag=agents.find(a=>a.id===task.agentId);
    html+='<div class="detail-value">'+(ag?esc(ag.name)+' — '+esc(ag.description):'Авто')+'</div>';
  }
  html+='</div>';

  // Description (editable in planning)
  html+='<div class="detail-section"><div class="detail-label">Описание</div>';
  if(isPlanning){
    html+='<textarea class="detail-edit-textarea" id="editDesc" onchange="saveField(\''+task.id+'\',\'description\',this.value)">'+esc(task.description||'')+'</textarea>';
  } else {
    html+='<div class="detail-desc">'+esc(task.description||'Нет описания')+'</div>';
  }
  html+='</div>';

  // Files (editable in planning)
  html+='<div class="detail-section"><div class="detail-label">Файлы</div>';
  if(isPlanning){
    html+='<div id="fileTagsWrap">';
    (task.files||[]).forEach((f,i)=>{
      html+='<span class="file-tag"><code>'+esc(f)+'</code><span class="remove-file" onclick="removeFile(\''+task.id+'\','+i+')">&times;</span></span>';
    });
    html+='</div>';
    html+='<div class="add-file-row"><input id="newFileInput" placeholder="src/file.ts" onkeydown="if(event.key===\'Enter\')addFile(\''+task.id+'\')"><button class="btn btn-secondary" style="padding:3px 8px;font-size:10px" onclick="addFile(\''+task.id+'\')">+</button></div>';
  } else if(task.files&&task.files.length){
    html+='<div class="detail-files">'+task.files.map(f=>'<code>'+esc(f)+'</code>').join('')+'</div>';
  } else {
    html+='<div class="detail-value" style="color:var(--desc)">—</div>';
  }
  html+='</div>';

  // Dependencies (editable in planning)
  if(isPlanning){
    html+='<div class="detail-section"><div class="detail-label">Зависимости</div>';
    html+='<div class="detail-deps" id="depsWrap">';
    (task.dependsOn||[]).forEach(did=>{
      const dep=session.tasks.find(t=>t.id===did);
      html+='<span class="dep-tag">'+esc(dep?dep.title:did)+' <span class="remove-file" onclick="removeDep(\''+task.id+'\',\''+did+'\')">&times;</span></span>';
    });
    html+='</div>';
    // Dropdown to add dep
    const others=session.tasks.filter(t=>t.id!==task.id&&!(task.dependsOn||[]).includes(t.id));
    if(others.length){
      html+='<select class="detail-select" style="margin-top:4px" onchange="addDep(\''+task.id+'\',this.value);this.value=\'\'"><option value="">+ Добавить зависимость...</option>';
      others.forEach(t=>{html+='<option value="'+t.id+'">'+esc(t.title)+'</option>';});
      html+='</select>';
    }
    html+='</div>';
  } else if(task.dependsOn&&task.dependsOn.length){
    html+='<div class="detail-section"><div class="detail-label">Зависимости</div><div class="detail-deps">';
    task.dependsOn.forEach(did=>{
      const dep=session.tasks.find(t=>t.id===did);
      html+='<span class="dep-tag">'+(dep?esc(dep.title):did)+'</span>';
    });
    html+='</div></div>';
  }

  // Links
  if(task.issueUrl||task.prUrl){
    html+='<div class="detail-section"><div class="detail-label">Ссылки</div><div class="detail-value">';
    if(task.issueUrl)html+='<a href="#" onclick="send(\'openIssue\',{taskId:\''+task.id+'\'});return false" style="color:var(--accent)">Issue #'+task.issueNumber+'</a> ';
    if(task.prUrl)html+='<a href="#" onclick="send(\'openPR\',{taskId:\''+task.id+'\'});return false" style="color:var(--accent)">PR #'+task.prNumber+'</a>';
    html+='</div></div>';
  }

  // Amend
  if(task.status==='working'||task.status==='dispatched'||task.status==='pr_created'){
    html+='<div class="detail-section"><div class="detail-label">Дополнить ТЗ</div>';
    html+='<textarea class="detail-amend-input" id="amendInput" placeholder="Добавьте уточнение к задаче..."></textarea>';
    html+='<button class="btn btn-primary" onclick="sendAmend(\''+task.id+'\')">'+I.edit+' Дополнить</button>';
    html+='</div>';
  }

  // Actions
  html+='<div class="detail-actions">';
  if(task.status==='pr_created'&&task.prNumber){
    html+='<button class="btn btn-success" onclick="send(\'mergePR\',{taskId:\''+task.id+'\'})">'+I.gitMerge+' Merge PR</button>';
  }
  if(isPlanning){
    html+='<button class="btn btn-danger" onclick="deleteTask(\''+task.id+'\')">'+I.close+' Удалить задачу</button>';
  }
  html+='</div>';

  content.innerHTML=html;
}

function closeDetail(){
  document.getElementById('detailPanel').classList.remove('open');
  selectedNode=null;
  document.querySelectorAll('.node').forEach(n=>n.classList.remove('selected'));
}

function onAgentChange(sel){
  const taskId=sel.getAttribute('data-taskid');
  send('assignAgent',{taskId,agentId:sel.value});
}

function onDetailAgentChange(sel,taskId){
  send('assignAgent',{taskId,agentId:sel.value});
  // Also update inline dropdown
  const inlineSel=document.querySelector('.agent-select[data-taskid="'+taskId+'"]');
  if(inlineSel)inlineSel.value=sel.value;
}

function amendNode(taskId){
  const text=prompt('Дополнение к ТЗ задачи:');
  if(text)send('amendTask',{taskId,value:text});
}

function sendAmend(taskId){
  const input=document.getElementById('amendInput');
  if(input&&input.value.trim()){
    send('amendTask',{taskId,value:input.value.trim()});
    input.value='';
  }
}

function esc(s){const d=document.createElement('span');d.textContent=s;return d.innerHTML;}

/* === Manual CRUD functions === */

function createSession(){
  const prompt=document.getElementById('formPrompt').value.trim();
  const repo=document.getElementById('formRepo').value.trim();
  const branch=document.getElementById('formBranch').value.trim()||'main';
  if(!prompt){document.getElementById('formPrompt').focus();return;}
  send('createSession',{prompt,repo,branch});
}

function createAndAddTask(){
  const prompt=document.getElementById('formPrompt').value.trim();
  const repo=document.getElementById('formRepo').value.trim();
  const branch=document.getElementById('formBranch').value.trim()||'main';
  if(!prompt){document.getElementById('formPrompt').focus();return;}
  send('createSession',{prompt,repo,branch});
  // Add a task after session is created (will happen on next state update)
  setTimeout(()=>send('addTask',{task:{}}),200);
}

function addNewTask(){
  send('addTask',{task:{}});
}

function deleteTask(taskId){
  if(!confirm('Удалить задачу?'))return;
  send('removeTask',{taskId});
  closeDetail();
  // Clear saved positions for removed node
  delete nodePositions[taskId];
}

function confirmReset(){
  if(!confirm('Сбросить текущую сессию? Все задачи будут потеряны.'))return;
  send('resetSession');
  nodePositions={};
  selectedNode=null;
}

function saveField(taskId,field,value){
  const update={};
  update[field]=value;
  send('editTask',{taskId,update});
  // Update header title in detail panel if title changed
  if(field==='title'){
    document.getElementById('detailTitle').textContent=value;
  }
}

function addFile(taskId){
  const input=document.getElementById('newFileInput');
  if(!input||!input.value.trim())return;
  const task=session.tasks.find(t=>t.id===taskId);
  if(!task)return;
  const files=[...(task.files||[]),input.value.trim()];
  send('editTask',{taskId,update:{files}});
  input.value='';
}

function removeFile(taskId,idx){
  const task=session.tasks.find(t=>t.id===taskId);
  if(!task)return;
  const files=[...(task.files||[])];
  files.splice(idx,1);
  send('editTask',{taskId,update:{files}});
}

function addDep(taskId,depId){
  if(!depId)return;
  const task=session.tasks.find(t=>t.id===taskId);
  if(!task)return;
  const deps=[...(task.dependsOn||[]),depId];
  send('editTask',{taskId,update:{dependsOn:deps}});
}

function removeDep(taskId,depId){
  const task=session.tasks.find(t=>t.id===taskId);
  if(!task)return;
  const deps=(task.dependsOn||[]).filter(d=>d!==depId);
  send('editTask',{taskId,update:{dependsOn:deps}});
}

const initState=vscode.getState();
if(initState?.session){session=initState.session;render();}
</script></body></html>`;
  }
}
