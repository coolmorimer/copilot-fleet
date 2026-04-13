import { resolve } from 'node:path';

import { AgentRegistry, discoverAgentFiles, loadAgentFromString } from '@copilot-fleet/agents';
import { FleetEngine, type ProviderAdapter, computeWaves } from '@copilot-fleet/core';
import {
  AnthropicProvider,
  CustomAPIProvider,
  GitHubCopilotProvider,
  LMStudioProvider,
  OllamaProvider,
  OpenAIProvider,
  ProviderRegistry,
  VSCodeLocalProvider,
} from '@copilot-fleet/providers';
import {
  DEFAULT_SESSION_CONFIG,
  PRESET_AGENTS,
  deserializeGraph,
  serializeSession,
  type AgentDefinition,
  type FleetEvent,
  type FleetGraph,
  type FleetSession,
  type Preset,
  type ProviderConfig,
  type ProviderType,
  validateProviderConfig,
} from '@copilot-fleet/shared';
import { Command } from 'commander';

import {
  c,
  failure,
  fileExists,
  fleetPath,
  formatDuration,
  info,
  printHeader,
  readJsonIfExists,
  readTextIfExists,
  repoPath,
  success,
  timestamp,
  warn,
  writeTextFile,
} from '../utils.js';

type RunOptions = {
  repo?: string;
  task?: string;
  preset: Preset;
  agents?: string;
  template?: string;
  dryRun?: boolean;
  timeout: string;
  concurrency?: string;
};

type StoredProviders = { providers?: ProviderConfig[] } | ProviderConfig[];

const providerFactories: Record<ProviderType, (config: ProviderConfig) => ProviderAdapter> = {
  'github-copilot': (config) => new GitHubCopilotProvider(config),
  openai: (config) => new OpenAIProvider(config),
  anthropic: (config) => new AnthropicProvider(config),
  ollama: (config) => new OllamaProvider(config),
  lmstudio: (config) => new LMStudioProvider(config),
  'custom-api': (config) => new CustomAPIProvider(config),
  'vscode-local': (config) => new VSCodeLocalProvider(config),
};

class DemoProvider {
  readonly type = 'demo';

  async initialize(): Promise<void> {}

  async testConnection(): Promise<boolean> {
    return true;
  }

  async listModels(): Promise<string[]> {
    return ['demo-model'];
  }

  async complete(request: { model: string; messages: Array<{ content: string }> }): Promise<{ content: string; model: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number }; finishReason: 'stop' }> {
    const prompt = request.messages.at(-1)?.content ?? 'task';
    return {
      content: `Simulated execution for: ${prompt}`,
      model: request.model,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: 'stop',
    };
  }

  async dispose(): Promise<void> {}
}

export function registerRunCommand(program: Command): void {
  program
    .command('run [task...]')
    .description('Run orchestration for a repository task')
    .option('--repo <owner/repo>', 'Target repository')
    .option('--task <description>', 'Task description')
    .option('--preset <preset>', 'solo|squad|platoon|fleet', DEFAULT_SESSION_CONFIG.preset)
    .option('--agents <count>', 'Number of agents')
    .option('--template <name>', 'Use a graph template')
    .option('--dry-run', 'Plan without executing')
    .option('--timeout <minutes>', 'Timeout in minutes', '30')
    .option('--concurrency <n>', 'Max parallel tasks')
    .action(async (taskParts: string[], options: RunOptions) => {
      try {
        await runCommand(taskParts, options);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown execution error.';
        failure(message);
        process.exit(1);
      }
    });
}

async function runCommand(taskParts: string[], options: RunOptions): Promise<void> {
  const task = options.task ?? taskParts.join(' ').trim();
  if (!task) {
    throw new Error('Task description is required. Use --task or provide a positional task.');
  }

  const preset = ensurePreset(options.preset);
  const timeoutMs = parsePositiveInt(options.timeout, 'timeout') * 60_000;
  const concurrency = options.concurrency ? parsePositiveInt(options.concurrency, 'concurrency') : DEFAULT_SESSION_CONFIG.maxConcurrency;
  const desiredAgents = options.agents ? parsePositiveInt(options.agents, 'agents') : PRESET_AGENTS[preset];
  const registry = await loadAgents();
  const graph = options.template ? await loadTemplateGraph(options.template) : buildGeneratedGraph(task, registry.getAll(), desiredAgents);

  printHeader('CopilotFleet Run');
  console.log(`${c.magenta('🚀 TASK')} ${c.bold(task)}`);
  console.log(`${c.blue('📦 REPO')} ${options.repo ?? 'current workspace'}`);
  console.log(`${c.cyan('🧠 PRESET')} ${preset} (${desiredAgents} agents)`);
  console.log(`${c.yellow('⏱ TIMEOUT')} ${formatDuration(timeoutMs)}`);
  console.log(`${c.green('📊 CONCURRENCY')} ${concurrency}`);

  const plan = computeWaves(graph);
  printPlan(graph, plan, registry);

  if (options.dryRun) {
    success('Dry run complete. No execution started.');
    return;
  }

  const engine = new FleetEngine();
  const sessionFile = fleetPath('session.json');
  const historyFilePrefix = fleetPath('history');

  try {
    await registerProviders(engine, graph);

    const session = engine.createSession({
      config: {
        ...DEFAULT_SESSION_CONFIG,
        repo: options.repo,
        preset,
        maxConcurrency: concurrency,
        timeout: timeoutMs,
        dryRun: false,
      },
      graph,
    });

    await persistSession(sessionFile, session);
    engine.on('*', async (event) => {
      printEvent(event);
      const snapshot = engine.getSession(session.id);
      if (snapshot) {
        await persistSession(sessionFile, snapshot);
      }
    });

    const startedAt = Date.now();
    const result = await engine.run(session.id);
    await persistSession(sessionFile, result);
    await persistSession(resolve(historyFilePrefix, `${result.id}.json`), result);
    printSummary(result, Date.now() - startedAt);
  } finally {
    await engine.dispose();
  }
}

async function loadAgents(): Promise<AgentRegistry> {
  const registry = new AgentRegistry();
  registry.loadBuiltins();
  const customDir = fleetPath('agents');
  if (!(await fileExists(customDir))) {
    return registry;
  }

  const files = await discoverAgentFiles(customDir);
  for (const file of files) {
    const content = await readTextIfExists(file);
    if (!content) {
      continue;
    }
    const format = file.endsWith('.json') ? 'json' : 'yaml';
    const loaded = loadAgentFromString(content, format);
    registry.register(loaded);
  }
  info(`Loaded ${registry.count()} agents.`);
  return registry;
}

async function loadTemplateGraph(name: string): Promise<FleetGraph> {
  const path = repoPath('templates', `${name}.json`);
  const json = await readJsonIfExists<Record<string, unknown>>(path);
  if (!json) {
    throw new Error(`Template "${name}" was not found in templates/.`);
  }
  return deserializeGraph(JSON.stringify(json));
}

function buildGeneratedGraph(task: string, agents: AgentDefinition[], count: number): FleetGraph {
  const selected = agents.slice(0, Math.max(1, count));
  const nodes = [
    createNode('trigger', 'trigger', 'Trigger', { task }),
    ...selected.map((agent, index) =>
      createNode(`agent-${index + 1}`, 'agent', agent.displayName, {
        agentId: agent.id,
        provider: agent.provider,
        model: agent.model,
      }),
    ),
    createNode('output', 'output', 'Output', {}),
  ];
  const chain = ['trigger', ...selected.map((_, index) => `agent-${index + 1}`), 'output'];
  const edges = chain.slice(0, -1).map((source, index) => ({
    id: `${source}-to-${chain[index + 1]}`,
    source,
    sourcePort: 'out',
    target: chain[index + 1] ?? 'output',
    targetPort: 'in',
  }));
  return { id: `run-${Date.now()}`, name: task, description: task, nodes, edges };
}

function createNode(id: string, type: 'trigger' | 'agent' | 'output', label: string, config: Record<string, unknown>): FleetGraph['nodes'][number] {
  const ports =
    type === 'trigger'
      ? [{ id: 'out', name: 'Output', type: 'output' as const, dataType: 'task' }]
      : type === 'output'
        ? [{ id: 'in', name: 'Input', type: 'input' as const, dataType: 'task' }]
        : [
            { id: 'in', name: 'Input', type: 'input' as const, dataType: 'task' },
            { id: 'out', name: 'Output', type: 'output' as const, dataType: 'task' },
          ];
  return { id, type, label, position: { x: 0, y: 0 }, ports, config, status: 'idle' };
}

function printPlan(graph: FleetGraph, waves: string[][], registry: AgentRegistry): void {
  info(`Execution plan: ${waves.length} wave(s), ${graph.nodes.length} node(s).`);
  for (const [index, wave] of waves.entries()) {
    const entries = wave.map((nodeId) => {
      const node = graph.nodes.find((item) => item.id === nodeId);
      const agentId = typeof node?.config.agentId === 'string' ? node.config.agentId : undefined;
      const agent = agentId ? registry.get(agentId) : undefined;
      return `${c.bold(node?.label ?? nodeId)}${agent ? c.dim(` → ${agent.displayName}`) : ''}`;
    });
    console.log(`${c.cyan(`🌊 Wave ${index + 1}`)} ${entries.join(c.dim(' | '))}`);
  }
}

async function registerProviders(engine: FleetEngine, graph: FleetGraph): Promise<void> {
  const configs = await loadProviderConfigs();
  const registry = new ProviderRegistry();
  for (const [type, factory] of Object.entries(providerFactories) as Array<[ProviderType, typeof providerFactories[ProviderType]]>) {
    registry.register(type, factory);
  }

  const required = new Set<ProviderType>();
  for (const node of graph.nodes) {
    const provider = typeof node.config.provider === 'string' ? node.config.provider : undefined;
    if (provider && provider in providerFactories) {
      required.add(provider as ProviderType);
    }
  }

  for (const providerType of required) {
    const config = configs.find((item) => item.type === providerType);
    if (config) {
      const instance = await registry.create(config);
      engine.registerProvider(providerType, instance);
      continue;
    }

    warn(`Provider ${providerType} is not configured in .fleet/providers.json. Using demo provider.`);
    engine.registerProvider(providerType, new DemoProvider());
  }
}

async function loadProviderConfigs(): Promise<ProviderConfig[]> {
  const stored = await readJsonIfExists<StoredProviders>(fleetPath('providers.json'));
  const values = Array.isArray(stored) ? stored : stored?.providers ?? [];
  return values.filter((config) => validateProviderConfig(config).valid);
}

async function persistSession(filePath: string, session: FleetSession): Promise<void> {
  await writeTextFile(filePath, serializeSession(session));
}

function printEvent(event: FleetEvent): void {
  const message = getEventMessage(event);
  if (!message) {
    return;
  }
  console.log(`[${timestamp(new Date(event.timestamp))}] ${message}`);
}

function getEventMessage(event: FleetEvent): string | null {
  switch (event.type) {
    case 'session:start':
      return `${c.green('🚦 RUN')} Session started`;
    case 'wave:start':
      return `${c.cyan('🌊 WAVE')} Starting wave ${String(event.data.wave ?? '?')}`;
    case 'node:start':
      return `${c.blue('🤖 NODE')} Running ${String(event.data.nodeId ?? 'node')}`;
    case 'node:complete':
      return `${c.green('✅ DONE')} ${String(event.data.nodeId ?? 'node')} completed`;
    case 'node:error':
      return `${c.red('💥 ERROR')} ${String(event.data.nodeId ?? 'node')} failed`;
    case 'session:complete':
      return `${c.green('🏁 DONE')} Session completed`;
    case 'session:abort':
      return `${c.yellow('🛑 ABORT')} Session aborted`;
    case 'log':
      return `${c.dim('📝 LOG')} ${String(event.data.message ?? 'Progress update')}`;
    default:
      return null;
  }
}

function printSummary(session: FleetSession, elapsedMs: number): void {
  printHeader('Run Summary');
  console.log(`${c.bold('📌 Session')} ${session.id}`);
  console.log(`${c.bold('📈 Status')} ${session.status}`);
  console.log(`${c.bold('🧮 Waves')} ${session.currentWave}/${session.totalWaves}`);
  console.log(`${c.bold('⏳ Duration')} ${formatDuration(elapsedMs)}`);
  console.log(`${c.bold('🧯 Errors')} ${session.errors.length}`);
  if (session.errors.length === 0) {
    success('Execution completed without recorded errors.');
  }
}

function ensurePreset(value: string): Preset {
  if (value === 'solo' || value === 'squad' || value === 'platoon' || value === 'fleet') {
    return value;
  }
  throw new Error(`Invalid preset "${value}". Use solo, squad, platoon, or fleet.`);
}

function parsePositiveInt(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Option ${label} must be a positive integer.`);
  }
  return parsed;
}