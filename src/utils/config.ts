import * as vscode from 'vscode';

export interface FleetConfig {
  maxAgents: number;
  concurrency: number;
  delayMs: number;
  preset: 'solo' | 'squad' | 'platoon' | 'fleet';
  targetRepo: string;
  targetBranch: string;
  decomposerModel: string;
  pollIntervalMs: number;
  timeoutMs: number;
  enableDependencies: boolean;
  requireApproval: boolean;
  autoMergePRs: boolean;
}

const PRESET_DEFAULTS: Record<string, { concurrency: number; maxAgents: number; delayMs: number }> = {
  solo: { concurrency: 1, maxAgents: 1, delayMs: 0 },
  squad: { concurrency: 3, maxAgents: 3, delayMs: 5000 },
  platoon: { concurrency: 6, maxAgents: 6, delayMs: 3000 },
  fleet: { concurrency: 10, maxAgents: 10, delayMs: 0 },
};

const SELECTED_REPO_KEY = 'copilot-fleet.selectedRepo';
let _globalState: vscode.Memento | undefined;

export function initConfigState(globalState: vscode.Memento): void {
  _globalState = globalState;
}

export function getSelectedRepo(): string {
  return _globalState?.get<string>(SELECTED_REPO_KEY, '') ?? '';
}

export async function setSelectedRepo(repo: string): Promise<void> {
  await _globalState?.update(SELECTED_REPO_KEY, repo);
}

export function getConfig(): FleetConfig {
  const cfg = vscode.workspace.getConfiguration('copilot-fleet');
  const preset = cfg.get<string>('preset', 'squad');
  const presetDef = PRESET_DEFAULTS[preset] ?? PRESET_DEFAULTS.squad;

  return {
    maxAgents: cfg.get<number>('agents.max', presetDef.maxAgents),
    concurrency: cfg.get<number>('agents.concurrency', presetDef.concurrency),
    delayMs: cfg.get<number>('agents.delayMs', presetDef.delayMs),
    preset: preset as FleetConfig['preset'],
    targetRepo: cfg.get<string>('target.repo', ''),
    targetBranch: cfg.get<string>('target.branch', 'main'),
    decomposerModel: cfg.get<string>('decomposer.model', 'gpt-4o-mini'),
    pollIntervalMs: cfg.get<number>('monitor.pollIntervalMs', 30000),
    timeoutMs: cfg.get<number>('monitor.timeoutMs', 3600000),
    enableDependencies: cfg.get<boolean>('pipeline.enableDependencies', true),
    requireApproval: cfg.get<boolean>('pipeline.requireApproval', true),
    autoMergePRs: cfg.get<boolean>('pipeline.autoMergePRs', false),
  };
}

export async function getTargetRepo(): Promise<string> {
  // 1. Check globalState (sidebar selection)
  const selected = getSelectedRepo();
  if (selected) { return selected; }
  // 2. Check workspace config
  const cfg = getConfig();
  if (cfg.targetRepo) { return cfg.targetRepo; }
  // 3. Detect from git remote
  return detectRepoFromWorkspace();
}

async function detectRepoFromWorkspace(): Promise<string> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return '';
  }

  const gitExt = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!gitExt) { return ''; }

  const git = gitExt.isActive ? gitExt.exports : await gitExt.activate();
  const api = git.getAPI(1);
  if (api.repositories.length === 0) { return ''; }

  const repo = api.repositories[0];
  const remote = repo.state.remotes.find((r: { name: string }) => r.name === 'origin')
    ?? repo.state.remotes[0];

  if (!remote?.fetchUrl) { return ''; }

  const match = remote.fetchUrl.match(/github\.com[/:](.*?)(\.git)?$/);
  return match?.[1] ?? '';
}

interface GitExtension {
  getAPI(version: number): {
    repositories: Array<{
      state: {
        remotes: Array<{ name: string; fetchUrl?: string }>;
      };
    }>;
  };
}
