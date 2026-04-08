import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { FleetLogger } from '../utils/logger';
import { getConfig, getTargetRepo } from '../utils/config';
import { GitHubApi } from '../github/api';
import { IssueService } from '../github/issues';
import { PullService } from '../github/pulls';
import { ModelsApi } from '../github/models';
import { Decomposer, RepoContext } from './decomposer';
import { Dispatcher } from './dispatcher';
import { Monitor } from './monitor';
import { Scheduler } from './scheduler';
import { Pipeline } from './pipeline';
import { FleetState, FleetSession, SubTask, StateChangeHandler } from './state';

export class FleetEngine {
  private readonly state: FleetState;
  private readonly api: GitHubApi;
  private readonly issueService: IssueService;
  private readonly pullService: PullService;
  private readonly models: ModelsApi;
  private readonly decomposer: Decomposer;
  private readonly dispatcher: Dispatcher;
  private readonly monitor: Monitor;
  private readonly scheduler: Scheduler;
  private readonly pipeline: Pipeline;

  constructor(context: vscode.ExtensionContext, private readonly logger: FleetLogger) {
    this.state = new FleetState(context.globalState);
    this.api = new GitHubApi(logger);
    this.issueService = new IssueService(this.api, logger);
    this.pullService = new PullService(this.api, logger);
    this.models = new ModelsApi(logger);
    this.decomposer = new Decomposer(this.models, logger);
    this.dispatcher = new Dispatcher(this.issueService, this.state, logger);
    this.monitor = new Monitor(this.pullService, this.state, logger);
    this.monitor.setDispatcher((task, prompt) => this.dispatcher.dispatch(task, prompt));
    this.scheduler = new Scheduler(logger);
    this.pipeline = new Pipeline();
  }

  onStateChange(handler: StateChangeHandler): void { this.state.onChange(handler); }
  get session(): FleetSession | undefined { return this.state.session; }

  /** Create a manual session without GitHub API validation */
  createManualSession(prompt?: string, repo?: string, branch?: string, maxAgents?: number): FleetSession {
    const config = getConfig();
    this.state.createSession(
      prompt || 'Ручная сессия',
      repo || 'owner/repo',
      branch || config.targetBranch,
      maxAgents || config.maxAgents
    );
    this.state.setStatus('awaiting_approval');
    return this.state.session!;
  }

  /** Add a task to the current session */
  addTask(taskData?: Partial<SubTask>): SubTask {
    if (!this.state.session) { throw new Error('Нет активной сессии'); }
    const newTask: SubTask = {
      id: 'task-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
      title: taskData?.title || 'Новая задача',
      description: taskData?.description || '',
      files: taskData?.files || [],
      dependsOn: taskData?.dependsOn || [],
      status: 'pending',
      agentId: taskData?.agentId,
    };
    this.state.addTask(newTask);
    this.pipeline.load(this.state.session.tasks);
    return newTask;
  }

  /** Edit an existing task */
  editTask(taskId: string, update: Partial<SubTask>): void {
    this.state.updateTask(taskId, update);
  }

  /** Remove a task from the current session */
  removeTask(taskId: string): void {
    this.state.removeTask(taskId);
    if (this.state.session) {
      this.pipeline.load(this.state.session.tasks);
    }
  }

  async plan(prompt: string, maxAgents: number, token: vscode.CancellationToken, repoOverride?: string): Promise<FleetSession> {
    const config = getConfig();
    const repo = repoOverride || await getTargetRepo();
    if (!repo) {
      throw new Error('Репозиторий не найден. Укажите --repo owner/repo или настройку copilot-fleet.target.repo');
    }

    const [owner, repoName] = this.parseRepoTuple(repo);

    // Validate repo access before planning (non-fatal on network error)
    const validation = await this.api.validateRepo(owner, repoName);
    if (!validation.ok) {
      this.logger.warn(`Repo validation failed: ${validation.error}`);
      // Network errors → proceed with empty context; permission errors → throw
      const isNetworkError = (validation.error ?? '').includes('подключиться') || (validation.error ?? '').includes('fetch');
      if (!isNetworkError) {
        throw new Error(validation.error ?? 'Не удалось проверить репозиторий');
      }
    }

    // Fetch repo context for smarter decomposition (tolerant to failures)
    let repoContext: RepoContext = { files: [] };
    try {
      repoContext = await this.fetchRepoContext(owner, repoName, config.targetBranch);
    } catch (err) {
      this.logger.warn(`Failed to fetch repo context: ${err}`);
    }

    const session = this.state.createSession(prompt, repo, config.targetBranch, maxAgents);
    const result = await this.decomposer.decompose(prompt, maxAgents, token, repoContext);
    this.state.setTasks(result.tasks);
    this.pipeline.load(result.tasks);
    if (this.pipeline.hasCycle()) {
      this.logger.warn('Dependency cycle detected — removing dependencies');
      for (const task of result.tasks) { task.dependsOn = []; }
      this.pipeline.load(result.tasks);
    }
    this.state.setStatus('awaiting_approval');
    return this.state.session!;
  }

  async run(prompt: string, maxAgents: number, token: vscode.CancellationToken, repoOverride?: string): Promise<FleetSession> {
    await this.plan(prompt, maxAgents, token, repoOverride);
    return this.execute(token);
  }

  async execute(token: vscode.CancellationToken): Promise<FleetSession> {
    const session = this.state.session;
    if (!session) { throw new Error('No active session to execute'); }
    this.state.setStatus('running');
    this.pipeline.load(session.tasks);
    const config = getConfig();

    // Dispatch all ready tasks (those with no pending dependencies)
    try {
      const dispatched = new Set<string>();
      const ready = session.tasks.filter(t => {
        if (t.status !== 'pending') { return false; }
        return t.dependsOn.length === 0;
      });

      for (const task of ready) {
        if (token.isCancellationRequested) { break; }
        try {
          await this.dispatcher.dispatch(task, session.prompt);
          dispatched.add(task.id);
        } catch {
          // dispatch failure already sets task.status = 'failed'
        }
        if (config.delayMs > 0) {
          await this.delay(config.delayMs);
        }
      }

      // Tasks with dependencies will be dispatched by the monitor
      // when their dependencies complete
      this.monitor.start();
      if (token.isCancellationRequested) { this.abort(); }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Execution error: ${message}`);
      this.state.setStatus('failed');
    }
    return this.state.session!;
  }

  abort(): void {
    this.monitor.stop(); this.state.abort(); this.logger.info('Session aborted');
  }

  reset(): void {
    this.monitor.stop(); this.state.reset(); this.logger.info('Session reset');
  }

  async mergePR(taskId: string): Promise<void> {
    const session = this.state.session;
    if (!session) { throw new Error('Нет активной сессии'); }
    const task = session.tasks.find(t => t.id === taskId);
    if (!task?.prNumber) { throw new Error('У задачи нет PR'); }
    const [owner, repo] = this.parseRepoTuple(session.repo);
    await this.pullService.mergePR(owner, repo, task.prNumber);
    this.state.updateTask(taskId, { status: 'completed' });
    this.logger.info(`PR #${task.prNumber} merged for task "${task.title}"`);
  }

  async mergeAllPRs(): Promise<{ merged: number; errors: string[] }> {
    const session = this.state.session;
    if (!session) { throw new Error('Нет активной сессии'); }
    const prTasks = session.tasks.filter(t => t.status === 'pr_created' && t.prNumber);
    let merged = 0;
    const errors: string[] = [];
    for (const task of prTasks) {
      try {
        await this.mergePR(task.id);
        merged++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`PR #${task.prNumber}: ${msg}`);
        this.logger.error(`Failed to merge PR #${task.prNumber}: ${msg}`);
      }
    }
    return { merged, errors };
  }

  async amendTask(taskId: string, amendment: string): Promise<void> {
    const session = this.state.session;
    if (!session) { throw new Error('Нет активной сессии'); }
    const task = session.tasks.find(t => t.id === taskId);
    if (!task) { throw new Error('Задача не найдена'); }
    if (!task.issueNumber) { throw new Error('У задачи нет Issue'); }
    const [owner, repo] = this.parseRepoTuple(session.repo);
    const existing = await this.issueService.getIssue(owner, repo, task.issueNumber);
    const newBody = (existing.body ?? '') + `\n\n---\n**Дополнение к ТЗ:**\n${amendment}`;
    await this.api.patch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${task.issueNumber}`,
      { body: newBody }
    );
    task.description = (task.description || '') + '\n[Дополнено]: ' + amendment;
    this.state.updateTask(taskId, { description: task.description });
    this.logger.info(`Task "${task.title}" amended: ${amendment}`);
  }

  async syncToWorkspace(): Promise<string> {
    const session = this.state.session;
    const branch = session?.branch ?? 'main';
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      throw new Error('Нет открытой рабочей области для синхронизации');
    }
    const cwd = folders[0].uri.fsPath;
    this.logger.info(`Syncing workspace at ${cwd} (branch: ${branch})`);

    return new Promise<string>((resolve, reject) => {
      execFile('git', ['pull', 'origin', branch], { cwd }, (err, stdout, stderr) => {
        if (err) {
          this.logger.error(`Git pull failed: ${stderr || err.message}`);
          reject(new Error(stderr || err.message));
        } else {
          this.logger.info(`Git pull success: ${stdout.trim()}`);
          resolve(stdout.trim() || 'Already up to date.');
        }
      });
    });
  }

  async launchInteractive(repoArg?: string): Promise<void> {
    // If there is already a planned session awaiting approval, just execute it
    const existing = this.state.session;
    if (existing && existing.status === 'awaiting_approval') {
      const tokenSource = new vscode.CancellationTokenSource();
      try { await this.execute(tokenSource.token); }
      catch (err) { vscode.window.showErrorMessage(`Fleet: ${err}`); }
      finally { tokenSource.dispose(); }
      return;
    }

    // Clear terminal session so a new one can start
    if (existing && this.state.isTerminal) {
      this.state.reset();
    }

    let repo = repoArg || existing?.repo || await getTargetRepo();
    if (!repo) {
      repo = await vscode.window.showInputBox({
        prompt: 'Укажите целевой репозиторий (owner/repo)',
        placeHolder: 'coolmorimer/local_AI_techsupport',
        validateInput: v => v && v.includes('/') ? null : 'Формат: owner/repo',
      }) ?? '';
      if (!repo) { return; }
    }
    const prompt = await vscode.window.showInputBox({
      prompt: 'Опишите задачу для облачных агентов',
      placeHolder: 'Оптимизируй UI, добавь тесты...',
    });
    if (!prompt) { return; }
    const config = getConfig();
    const tokenSource = new vscode.CancellationTokenSource();
    try { await this.run(prompt, config.maxAgents, tokenSource.token, repo); }
    catch (err) { vscode.window.showErrorMessage(`Fleet: ${err}`); }
    finally { tokenSource.dispose(); }
  }

  async dryRun(): Promise<void> {
    const prompt = await vscode.window.showInputBox({ prompt: 'Опишите задачу (dry run)' });
    if (!prompt) { return; }
    const config = getConfig();
    const tokenSource = new vscode.CancellationTokenSource();
    try {
      const session = await this.plan(prompt, config.maxAgents, tokenSource.token);
      const msg = session.tasks.map((t, i) => `${i + 1}. ${t.title}`).join('\n');
      vscode.window.showInformationMessage(`Plan:\n${msg}`);
    } catch (err) { vscode.window.showErrorMessage(`Fleet: ${err}`); }
    finally { tokenSource.dispose(); }
  }

  showStatus(): void {
    const session = this.state.session;
    if (!session) { vscode.window.showInformationMessage('Fleet: No active session'); return; }
    const done = session.tasks.filter(t => t.status === 'completed' || t.status === 'pr_created').length;
    vscode.window.showInformationMessage(`Fleet: ${done}/${session.tasks.length} tasks done — ${session.status}`);
  }

  async showHistory(): Promise<void> {
    const history = await this.state.getHistory();
    if (history.length === 0) { vscode.window.showInformationMessage('Fleet: No session history'); return; }
    const items = history.map(s => ({
      label: `${s.status === 'completed' ? '✅' : '❌'} ${s.prompt.slice(0, 60)}`,
      description: `${s.tasks.length} tasks — ${new Date(s.startedAt).toLocaleString()}`,
      detail: s.repo,
    }));
    vscode.window.showQuickPick(items, { title: 'Fleet Session History' });
  }

  private async fetchRepoContext(owner: string, repo: string, branch: string): Promise<RepoContext> {
    this.logger.info(`Fetching repo context for ${owner}/${repo}`);
    const files = await this.api.getRepoTree(owner, repo, branch);
    const readme = await this.api.getFileContent(owner, repo, 'README.md', branch);
    return { files, readme: readme ?? undefined };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private parseRepoTuple(fullRepo: string): [string, string] {
    const parts = fullRepo.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(`Неверный формат репозитория: "${fullRepo}". Ожидается "owner/repo".`);
    }
    return [parts[0], parts[1]];
  }
}
