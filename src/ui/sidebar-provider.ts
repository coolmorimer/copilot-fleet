import * as vscode from 'vscode';
import { FleetEngine } from '../core/engine';
import { FleetSession } from '../core/state';
import { getConfig, getSelectedRepo, setSelectedRepo } from '../utils/config';
import { GitHubApi } from '../github/api';
import { FleetLogger } from '../utils/logger';
import { agentRegistry } from '../core/agents';
import { SVG } from './icons';

const REPOS_KEY = 'copilot-fleet.recentRepos';
const MAX_REPOS = 20;

interface SidebarMessage {
  type: string;
  repo?: string;
  maxAgents?: number;
  preset?: string;
  branch?: string;
  taskId?: string;
  value?: string;
  agentId?: string;
}

export class FleetSidebarProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private lastSession: FleetSession | undefined;
  private readonly globalState: vscode.Memento;
  private readonly api: GitHubApi;
  private githubRepos: string[] = [];
  private reposFetched = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly engine: FleetEngine,
    globalState: vscode.Memento
  ) {
    this.globalState = globalState;
    this.api = new GitHubApi(new FleetLogger());
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    // Persist webview state when panel is hidden
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) { this.pushAll(); }
    });

    webviewView.webview.html = this.getHtml();
    webviewView.webview.onDidReceiveMessage((msg: SidebarMessage) => this.handleMessage(msg));
    this.pushAll();
    this.fetchGitHubRepos();
  }

  update(session: FleetSession | undefined): void {
    this.lastSession = session;
    this.pushState(session);
    if (session?.repo) { this.addRecentRepo(session.repo); }
  }

  private pushAll(): void {
    this.pushRepos();
    this.pushConfig();
    this.pushAgents();
    if (this.lastSession) { this.pushState(this.lastSession); }
  }

  private pushState(session: FleetSession | undefined): void {
    this.view?.webview.postMessage({ type: 'state', data: session ?? null });
  }

  private pushRepos(): void {
    const recent = this.getRecentRepos();
    const selected = getSelectedRepo() || getConfig().targetRepo;
    // Merge: recent repos first, then GitHub repos not already in recent
    const all = [...recent];
    for (const r of this.githubRepos) {
      if (!all.includes(r)) { all.push(r); }
    }
    this.view?.webview.postMessage({ type: 'repos', data: all, selected });
  }

  private pushConfig(): void {
    const cfg = getConfig();
    const selected = getSelectedRepo() || cfg.targetRepo;
    this.view?.webview.postMessage({
      type: 'config',
      data: {
        maxAgents: cfg.maxAgents, preset: cfg.preset,
        targetBranch: cfg.targetBranch, targetRepo: selected,
      },
    });
  }

  private pushAgents(): void {
    const agents = agentRegistry.getAllAgents();
    const skills = agentRegistry.getAllSkills();
    this.view?.webview.postMessage({ type: 'agents', agents, skills });
  }

  private getRecentRepos(): string[] {
    return this.globalState.get<string[]>(REPOS_KEY, []);
  }

  private async addRecentRepo(repo: string): Promise<void> {
    if (!repo) { return; }
    const repos = this.getRecentRepos().filter(r => r !== repo);
    repos.unshift(repo);
    if (repos.length > MAX_REPOS) { repos.length = MAX_REPOS; }
    await this.globalState.update(REPOS_KEY, repos);
    this.pushRepos();
  }

  private async fetchGitHubRepos(): Promise<void> {
    if (this.reposFetched) { this.pushRepos(); return; }
    try {
      await this.api.ensureAuth();
      const result = await this.api.get<Array<{ full_name: string }>>(
        '/user/repos?sort=updated&per_page=30&affiliation=owner,collaborator'
      );
      this.githubRepos = result.map(r => r.full_name);
      this.reposFetched = true;
      this.pushRepos();
    } catch {
      // Auth may fail silently — user can still add manually
    }
  }

  private async handleMessage(msg: SidebarMessage): Promise<void> {
    switch (msg.type) {
      case 'launch': {
        const repo = getSelectedRepo() || getConfig().targetRepo;
        vscode.commands.executeCommand('copilot-fleet.launch', repo);
        break;
      }
      case 'abort':
        vscode.commands.executeCommand('copilot-fleet.abort');
        break;
      case 'reset':
        vscode.commands.executeCommand('copilot-fleet.reset');
        break;
      case 'history':
        vscode.commands.executeCommand('copilot-fleet.history');
        break;
      case 'selectRepo':
        if (msg.repo) {
          const [owner, repoName] = msg.repo.split('/');
          const check = await this.api.validateRepo(owner, repoName);
          if (!check.ok) {
            vscode.window.showWarningMessage(`Fleet: ${check.error}`);
            this.view?.webview.postMessage({ type: 'repoError', error: check.error });
          }
          await setSelectedRepo(msg.repo);
          await this.addRecentRepo(msg.repo);
          this.pushConfig();
        }
        break;
      case 'addRepo': {
        const action = await vscode.window.showQuickPick(
          [
            { label: 'Привязать существующий', description: 'Ввести owner/repo', value: 'link' },
            { label: 'Создать новый на GitHub', description: 'Создаёт через API', value: 'create' },
          ],
          { title: 'Добавить репозиторий' }
        ) as { value: string } | undefined;
        if (!action) { break; }

        if (action.value === 'link') {
          const input = await vscode.window.showInputBox({
            prompt: 'Существующий репозиторий (owner/repo)',
            validateInput: v => v && v.includes('/') ? null : 'Формат: owner/repo',
          });
          if (input) {
            await this.addRecentRepo(input);
            await setSelectedRepo(input);
            this.pushRepos();
            this.pushConfig();
          }
        } else {
          const repoName = await vscode.window.showInputBox({
            prompt: 'Имя нового репозитория',
            placeHolder: 'my-new-project',
            validateInput: v => v && /^[\w.-]+$/.test(v) ? null : 'Допустимы: буквы, цифры, -, ., _',
          });
          if (!repoName) { break; }
          const visibility = await vscode.window.showQuickPick(
            [
              { label: 'Public', value: false },
              { label: 'Private', value: true },
            ],
            { title: 'Видимость' }
          ) as { value: boolean } | undefined;
          if (!visibility) { break; }
          try {
            const created = await this.api.createRepo(repoName, undefined, visibility.value);
            await this.addRecentRepo(created.full_name);
            await setSelectedRepo(created.full_name);
            this.reposFetched = false;
            await this.fetchGitHubRepos();
            this.pushConfig();
          } catch (err) {
            vscode.window.showErrorMessage(`Fleet: ${err}`);
          }
        }
        break;
      }
      case 'refreshRepos':
        this.reposFetched = false;
        await this.fetchGitHubRepos();
        break;
      case 'updateSetting':
        if (msg.maxAgents !== undefined) {
          await vscode.workspace.getConfiguration('copilot-fleet').update('agents.max', msg.maxAgents, vscode.ConfigurationTarget.Workspace);
        }
        if (msg.preset !== undefined) {
          await vscode.workspace.getConfiguration('copilot-fleet').update('preset', msg.preset, vscode.ConfigurationTarget.Workspace);
        }
        if (msg.branch !== undefined) {
          await vscode.workspace.getConfiguration('copilot-fleet').update('target.branch', msg.branch, vscode.ConfigurationTarget.Workspace);
        }
        this.pushConfig();
        break;
      case 'openIssue':
      case 'openPR':
        if (msg.taskId && this.lastSession) {
          const task = this.lastSession.tasks.find(t => t.id === msg.taskId);
          const url = msg.type === 'openIssue' ? task?.issueUrl : task?.prUrl;
          if (url) { vscode.env.openExternal(vscode.Uri.parse(url)); }
        }
        break;
      case 'mergePR':
        if (msg.taskId) { vscode.commands.executeCommand('copilot-fleet.mergePR', msg.taskId); }
        break;
      case 'mergeAll':
        vscode.commands.executeCommand('copilot-fleet.mergeAll');
        break;
      case 'amendTask':
        if (msg.taskId && msg.value) { vscode.commands.executeCommand('copilot-fleet.amendTask', msg.taskId, msg.value); }
        break;
      case 'openWorkflow':
        vscode.commands.executeCommand('copilot-fleet.openWorkflow');
        break;
      case 'addAgent': {
        const name = await vscode.window.showInputBox({ prompt: 'Имя агента' });
        if (!name) { break; }
        const desc = await vscode.window.showInputBox({ prompt: 'Описание агента' }) ?? '';
        const skills = agentRegistry.getAllSkills();
        const picked = await vscode.window.showQuickPick(
          skills.map(s => ({ label: s.name, description: s.description, value: s.id })),
          { canPickMany: true, title: 'Навыки агента' }
        ) as Array<{ value: string }> | undefined;
        const agentId = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        await agentRegistry.addCustomAgent({
          id: agentId, name, description: desc, icon: 'code',
          color: '#6366f1', skills: picked?.map(p => p.value) ?? [],
        });
        this.pushAgents();
        break;
      }
      case 'removeAgent':
        if (msg.agentId) { await agentRegistry.removeCustomAgent(msg.agentId); this.pushAgents(); }
        break;
    }
  }

  private getHtml(): string {
    const icons = JSON.stringify(SVG).replace(/</g, '\\x3c');
    return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{color:var(--vscode-foreground);background:var(--vscode-sideBar-background);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);padding:0;overflow-x:hidden}
.header{padding:10px 12px 8px;border-bottom:1px solid var(--vscode-widget-border);display:flex;align-items:center;gap:8px}
.header-title{font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.8px;flex:1}
.header svg{opacity:.6;cursor:pointer;transition:opacity .15s}
.header svg:hover{opacity:1}
.tabs{display:flex;border-bottom:1px solid var(--vscode-widget-border)}
.tab{flex:1;padding:8px 4px;text-align:center;font-size:11px;cursor:pointer;border-bottom:2px solid transparent;color:var(--vscode-descriptionForeground);transition:all .15s;display:flex;align-items:center;justify-content:center;gap:4px}
.tab.active{color:var(--vscode-foreground);border-color:var(--vscode-focusBorder)}
.tab:hover{color:var(--vscode-foreground)}
.tab svg{width:14px;height:14px}
.tab-panel{display:none;padding:10px 12px} .tab-panel.active{display:block}
.section{margin-bottom:14px}
.label{font-size:10px;color:var(--vscode-descriptionForeground);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px;font-weight:600;display:flex;align-items:center;gap:4px}
.label svg{width:12px;height:12px;opacity:.7}
.btn{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border:none;border-radius:4px;font-size:11px;cursor:pointer;font-family:inherit;transition:opacity .15s}
.btn:hover{opacity:.85}
.btn svg{width:14px;height:14px}
.btn-primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
.btn-secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
.btn-danger{background:#c62828;color:#fff}
.btn-success{background:#2e7d32;color:#fff}
.btn-sm{padding:3px 8px;font-size:10px}
.btn-icon{padding:4px;background:none;border:none;color:var(--vscode-foreground);cursor:pointer;opacity:.6;border-radius:3px}
.btn-icon:hover{opacity:1;background:var(--vscode-list-hoverBackground)}
.btn-row{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
select,input[type=number],input[type=text],textarea{width:100%;padding:5px 8px;border:1px solid var(--vscode-input-border);background:var(--vscode-input-background);color:var(--vscode-input-foreground);font-family:inherit;font-size:12px;border-radius:3px;margin-top:2px;outline:none}
select:focus,input:focus,textarea:focus{border-color:var(--vscode-focusBorder)}
textarea{resize:vertical;min-height:48px}
.badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600}
.badge svg{width:12px;height:12px}
.badge.running{background:#1565c0;color:#fff}
.badge.completed{background:#2e7d32;color:#fff}
.badge.failed{background:#c62828;color:#fff}
.badge.planning,.badge.awaiting_approval{background:#6a1b9a;color:#fff}
.badge.aborted{background:#e65100;color:#fff}
.progress-bar{height:4px;background:var(--vscode-widget-border);border-radius:2px;margin:6px 0;overflow:hidden}
.progress-fill{height:100%;background:var(--vscode-progressBar-background);transition:width .4s ease}
.task-item{padding:8px 0;border-bottom:1px solid var(--vscode-widget-border)}
.task-header{display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer}
.task-icon{flex-shrink:0;width:16px;height:16px;display:flex;align-items:center}
.task-icon svg{width:14px;height:14px}
.task-icon.pending{color:var(--vscode-descriptionForeground)}
.task-icon.dispatched,.task-icon.working{color:#1565c0}
.task-icon.pr_created,.task-icon.completed{color:#2e7d32}
.task-icon.failed{color:#c62828}
.task-icon.aborted{color:#e65100}
.task-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.task-meta{font-size:10px;color:var(--vscode-descriptionForeground);display:flex;gap:6px;margin-top:3px;padding-left:22px;flex-wrap:wrap;align-items:center}
.task-meta a{color:var(--vscode-textLink-foreground);text-decoration:none;display:inline-flex;align-items:center;gap:2px}
.task-meta a:hover{text-decoration:underline}
.task-meta a svg{width:10px;height:10px}
.task-detail{padding:4px 0 2px 22px;font-size:11px;color:var(--vscode-descriptionForeground);display:none}
.task-detail.open{display:block}
.task-files{font-size:10px;color:var(--vscode-descriptionForeground);padding-left:22px}
.task-error{color:var(--vscode-errorForeground);font-size:10px;padding-left:22px;margin-top:2px}
.task-actions{display:flex;gap:4px;margin-top:4px;padding-left:22px}
.agent-card{display:flex;align-items:center;gap:8px;padding:8px;margin-bottom:4px;border-radius:6px;background:var(--vscode-editor-background);border:1px solid var(--vscode-widget-border);transition:border-color .15s}
.agent-card:hover{border-color:var(--vscode-focusBorder)}
.agent-avatar{width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.agent-avatar svg{width:16px;height:16px;color:#fff}
.agent-info{flex:1;min-width:0}
.agent-name{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.agent-desc{font-size:10px;color:var(--vscode-descriptionForeground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.agent-skills{display:flex;gap:3px;flex-wrap:wrap;margin-top:3px}
.skill-tag{font-size:9px;padding:1px 5px;border-radius:8px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.empty{text-align:center;padding:32px 12px;color:var(--vscode-descriptionForeground)}
.empty svg{width:48px;height:48px;opacity:.4;margin-bottom:8px}
.empty-title{font-weight:600;font-size:13px;margin-bottom:4px;color:var(--vscode-foreground)}
.empty-sub{font-size:11px;line-height:1.5}
.timer{font-variant-numeric:tabular-nums;font-size:12px;font-weight:600}
@keyframes spin{to{transform:rotate(360deg)}}
.spin{animation:spin 1s linear infinite}
::-webkit-scrollbar{width:6px}
::-webkit-scrollbar-thumb{background:var(--vscode-scrollbarSlider-background);border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:var(--vscode-scrollbarSlider-hoverBackground)}
</style></head><body>

<div class="header">
  <span class="header-title">Copilot Fleet</span>
  <span onclick="send('openWorkflow')" title="Редактор потока">${SVG.workflow}</span>
  <span onclick="send('history')" title="История">${SVG.history}</span>
</div>

<div class="tabs">
  <div class="tab active" data-tab="session" onclick="switchTab('session')">${SVG.list} Сессия</div>
  <div class="tab" data-tab="agents" onclick="switchTab('agents')">${SVG.agents} Агенты</div>
  <div class="tab" data-tab="settings" onclick="switchTab('settings')">${SVG.gear} Настройки</div>
</div>

<div id="tab-session" class="tab-panel active">
  <div id="empty" class="empty">
    ${SVG.rocket}
    <div class="empty-title">Copilot Fleet</div>
    <div class="empty-sub">Используйте <code>@fleet</code> в чате<br>или запустите из панели</div>
    <div class="btn-row" style="justify-content:center;margin-top:12px">
      <button class="btn btn-primary" onclick="send('launch')">${SVG.play} Запустить</button>
    </div>
  </div>
  <div id="session" style="display:none">
    <div class="section">
      <div id="prompt" style="font-weight:600;font-size:12px;margin-bottom:6px;word-break:break-word"></div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span id="sessionStatus" class="badge"></span>
        <span id="timerDisplay" class="timer"></span>
      </div>
      <div style="font-size:10px;color:var(--vscode-descriptionForeground);margin-top:4px;display:flex;align-items:center;gap:4px">
        <span style="display:inline-flex">${SVG.repo}</span> <span id="repoDisplay"></span>
        <span style="opacity:.4">|</span>
        <span style="display:inline-flex">${SVG.branch}</span> <span id="branchDisplay"></span>
      </div>
    </div>
    <div class="section">
      <div class="label">${SVG.dashboard} Прогресс</div>
      <div class="progress-bar"><div id="progressFill" class="progress-fill" style="width:0"></div></div>
      <div id="progressText" style="font-size:11px"></div>
    </div>
    <div class="section">
      <div class="label">${SVG.list} Подзадачи</div>
      <div id="taskList"></div>
    </div>
    <div id="sessionButtons" class="btn-row"></div>
  </div>
</div>

<div id="tab-agents" class="tab-panel">
  <div class="section">
    <div class="label">${SVG.agents} Доступные агенты</div>
    <div id="agentList"></div>
    <div class="btn-row">
      <button class="btn btn-secondary btn-sm" onclick="send('addAgent')">${SVG.plus} Добавить агента</button>
    </div>
  </div>
  <div class="section" id="activeAgentsSection" style="display:none">
    <div class="label">${SVG.sync} Активные</div>
    <div id="activeAgentList"></div>
  </div>
</div>

<div id="tab-settings" class="tab-panel">
  <div class="section">
    <div class="label" style="justify-content:space-between">
      <span style="display:flex;align-items:center;gap:4px">${SVG.repo} Целевой репозиторий</span>
      <span class="btn-icon" onclick="send('refreshRepos')" title="Обновить">${SVG.sync}</span>
    </div>
    <select id="repoSelect" onchange="onRepoChange(this.value)"><option value="">-- выберите --</option></select>
    <div class="btn-row"><button class="btn btn-secondary btn-sm" onclick="send('addRepo')">${SVG.plus} Добавить</button></div>
  </div>
  <div class="section">
    <div class="label">${SVG.branch} Ветка</div>
    <input type="text" id="branchInput" value="main" onchange="sendSetting({branch:this.value})"/>
  </div>
  <div class="section">
    <div class="label">${SVG.agents} Пресет</div>
    <select id="presetSelect" onchange="sendSetting({preset:this.value})">
      <option value="solo">Solo — 1 агент</option>
      <option value="squad" selected>Squad — 3 агента</option>
      <option value="platoon">Platoon — 6 агентов</option>
      <option value="fleet">Fleet — 10 агентов</option>
    </select>
  </div>
</div>

<script>
const vscode = acquireVsCodeApi();
const I = ${icons};
const SI = {pending:I.clock,dispatched:I.send,working:I.loading,pr_created:I.pullRequest,completed:I.check,failed:I.error,aborted:I.stop};
const SL = {planning:'Планирование',awaiting_approval:'Ожидание',running:'Выполняется',completed:'Завершено',failed:'Ошибка',aborted:'Остановлено'};
let timerInterval;
let allAgents=[];
let allSkills=[];

function send(t,d){vscode.postMessage({type:t,...(d||{})});}
function sendSetting(s){vscode.postMessage({type:'updateSetting',...s});}
function onRepoChange(v){if(v)vscode.postMessage({type:'selectRepo',repo:v});}

function switchTab(name){
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===name));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id==='tab-'+name));
  vscode.setState({...(vscode.getState()||{}),activeTab:name});
}
const saved=vscode.getState();
if(saved?.activeTab)switchTab(saved.activeTab);

window.addEventListener('message',e=>{
  const{type}=e.data;
  if(type==='state')renderSession(e.data.data);
  else if(type==='repos')renderRepos(e.data.data,e.data.selected);
  else if(type==='config')renderConfig(e.data.data);
  else if(type==='agents'){allAgents=e.data.agents;allSkills=e.data.skills;renderAgentList();}
});

function renderSession(s){
  vscode.setState({...(vscode.getState()||{}),session:s});
  document.getElementById('empty').style.display=s?'none':'';
  document.getElementById('session').style.display=s?'':'none';
  if(!s){renderActiveAgents(null);return;}

  document.getElementById('prompt').textContent=s.prompt;
  document.getElementById('repoDisplay').textContent=s.repo||'-';
  document.getElementById('branchDisplay').textContent=s.branch||'main';

  const b=document.getElementById('sessionStatus');
  b.innerHTML=(SI[s.status]||'')+' '+(SL[s.status]||s.status);
  b.className='badge '+s.status;

  const done=s.tasks.filter(t=>t.status==='completed'||t.status==='pr_created').length;
  const pct=s.tasks.length>0?Math.round(done/s.tasks.length*100):0;
  document.getElementById('progressFill').style.width=pct+'%';
  document.getElementById('progressText').textContent=done+'/'+s.tasks.length+' ('+pct+'%)';

  renderTaskList(s.tasks);
  renderActiveAgents(s);
  renderButtons(s);

  clearInterval(timerInterval);
  if(s.status==='running'){timerInterval=setInterval(()=>showTimer(s.startedAt),1000);showTimer(s.startedAt);}
  else if(s.completedAt){showDuration(s.completedAt-s.startedAt);}
}

function renderButtons(s){
  const box=document.getElementById('sessionButtons');
  const terminal=['completed','failed','aborted'].includes(s.status);
  const hasPRs=s.tasks.some(t=>t.status==='pr_created'&&t.prNumber);
  let h='';
  if(!terminal)h+='<button class="btn btn-danger btn-sm" onclick="send(\\'abort\\')">'+I.stop+' Остановить</button>';
  if(terminal)h+='<button class="btn btn-primary btn-sm" onclick="send(\\'reset\\')">'+I.sync+' Новая сессия</button>';
  if(hasPRs)h+='<button class="btn btn-success btn-sm" onclick="send(\\'mergeAll\\')">'+I.gitMerge+' Смержить все</button>';
  h+='<button class="btn btn-secondary btn-sm" onclick="send(\\'openWorkflow\\')">'+I.workflow+' Граф</button>';
  box.innerHTML=h;
}

function renderTaskList(tasks){
  const list=document.getElementById('taskList');
  list.innerHTML='';
  tasks.forEach(t=>{
    const div=document.createElement('div');
    div.className='task-item';
    const icon=SI[t.status]||I.clock;
    let html='<div class="task-header" onclick="toggleDetail(this)">'
      +'<span class="task-icon '+t.status+'">'+icon+'</span>'
      +'<span class="task-title">'+esc(t.title)+'</span></div>';
    let meta='<div class="task-meta">';
    if(t.issueUrl)meta+='<a href="#" onclick="openLink(event,\\'openIssue\\',\\''+t.id+'\\')">'+I.issue+' #'+t.issueNumber+'</a>';
    if(t.prUrl)meta+='<a href="#" onclick="openLink(event,\\'openPR\\',\\''+t.id+'\\')">'+I.pullRequest+' PR #'+t.prNumber+'</a>';
    if(t.files&&t.files.length)meta+='<span>'+t.files.length+' файлов</span>';
    meta+='</div>';
    let actions='';
    if(t.status==='pr_created'&&t.prNumber){
      actions='<div class="task-actions"><button class="btn btn-success btn-sm" onclick="mergePR(\\''+t.id+'\\')">'+I.gitMerge+' Merge</button>'
        +'<button class="btn btn-secondary btn-sm" onclick="amendTask(\\''+t.id+'\\')">'+I.edit+' Дополнить</button></div>';
    }
    if(t.status==='working'||t.status==='dispatched'){
      actions='<div class="task-actions"><button class="btn btn-secondary btn-sm" onclick="amendTask(\\''+t.id+'\\')">'+I.edit+' Дополнить</button></div>';
    }
    let detail='';
    if(t.description)detail='<div class="task-detail">'+esc(t.description)+'</div>';
    if(t.files&&t.files.length)detail+='<div class="task-files">'+t.files.map(f=>'<code>'+esc(f)+'</code>').join(', ')+'</div>';
    if(t.error)detail+='<div class="task-error">'+I.error+' '+esc(t.error)+'</div>';
    div.innerHTML=html+meta+actions+detail;
    list.appendChild(div);
  });
}

function renderAgentList(){
  const list=document.getElementById('agentList');
  list.innerHTML='';
  allAgents.forEach(a=>{
    const card=document.createElement('div');
    card.className='agent-card';
    const ic=I[a.icon]||I.code;
    let skills='';
    if(a.skills&&a.skills.length)skills='<div class="agent-skills">'+a.skills.map(sid=>{const sk=allSkills.find(s=>s.id===sid);return '<span class="skill-tag">'+(sk?sk.name:sid)+'</span>';}).join('')+'</div>';
    card.innerHTML='<div class="agent-avatar" style="background:'+a.color+'">'+ic+'</div>'
      +'<div class="agent-info"><div class="agent-name">'+esc(a.name)+(a.builtIn?'':' <span style="opacity:.5;font-size:9px">(custom)</span>')+'</div>'
      +'<div class="agent-desc">'+esc(a.description)+'</div>'+skills+'</div>'
      +(a.builtIn?'':'<span class="btn-icon" onclick="event.stopPropagation();send(\\'removeAgent\\',{agentId:\\''+a.id+'\\'})">'+I.close+'</span>');
    list.appendChild(card);
  });
}

function renderActiveAgents(s){
  const sec=document.getElementById('activeAgentsSection');
  const list=document.getElementById('activeAgentList');
  if(!s||!s.tasks){sec.style.display='none';return;}
  const active=s.tasks.filter(t=>t.status==='dispatched'||t.status==='working');
  if(!active.length){sec.style.display='none';return;}
  sec.style.display='';list.innerHTML='';
  active.forEach((t,i)=>{
    const d=document.createElement('div');
    d.className='agent-card';
    d.innerHTML='<div class="agent-avatar" style="background:#1565c0">'+I.loading+'</div>'
      +'<div class="agent-info"><div class="agent-name">Agent #'+(i+1)+'</div>'
      +'<div class="agent-desc">'+esc(t.title)+'</div></div>';
    list.appendChild(d);
  });
}

function renderRepos(repos,selected){
  const sel=document.getElementById('repoSelect');
  while(sel.options.length>1)sel.remove(1);
  repos.forEach(r=>{const opt=document.createElement('option');opt.value=r;opt.textContent=r;if(r===selected)opt.selected=true;sel.appendChild(opt);});
}

function renderConfig(cfg){
  document.getElementById('presetSelect').value=cfg.preset;
  document.getElementById('branchInput').value=cfg.targetBranch;
  if(cfg.targetRepo){const sel=document.getElementById('repoSelect');for(let i=0;i<sel.options.length;i++){if(sel.options[i].value===cfg.targetRepo){sel.selectedIndex=i;break;}}}
}

function toggleDetail(hdr){const item=hdr.closest('.task-item');const det=item.querySelector('.task-detail');if(det)det.classList.toggle('open');}
function openLink(e,type,taskId){e.preventDefault();vscode.postMessage({type,taskId});}
function mergePR(taskId){vscode.postMessage({type:'mergePR',taskId});}
function amendTask(taskId){
  const text=prompt('Дополнение к ТЗ задачи:');
  if(text)vscode.postMessage({type:'amendTask',taskId,value:text});
}

function showTimer(st){showDuration(Date.now()-st);}
function showDuration(ms){const s=Math.floor(ms/1000),m=Math.floor(s/60),sc=s%60;document.getElementById('timerDisplay').textContent=(m>0?m+' мин ':'')+sc+' сек';}
function esc(s){const d=document.createElement('span');d.textContent=s;return d.innerHTML;}

const initState=vscode.getState();
if(initState?.session)renderSession(initState.session);
</script></body></html>`;
  }
}
