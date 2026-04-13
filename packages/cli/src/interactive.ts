import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { AgentRegistry } from '@copilot-fleet/agents';
import {
  DEFAULT_SESSION_CONFIG,
  PRESET_AGENTS,
  VERSION,
  type AgentDefinition,
  type Locale,
  type Preset,
} from '@copilot-fleet/shared';
import { ProviderRegistry } from '@copilot-fleet/providers';

import { c, formatDuration, printHeader, printTable, timestamp } from './utils.js';

interface InteractiveSession {
  readonly task: string;
  readonly repo?: string;
  readonly preset: Preset;
  readonly startedAt: Date;
  readonly estimatedDurationMs: number;
}

interface InteractiveState {
  locale: Locale;
  defaultPreset: Preset;
  session?: InteractiveSession;
}

interface PromptOptions {
  readonly defaultValue?: string;
  readonly onInterrupt?: 'cancel' | 'exit';
}

const TEMPLATE_ROWS: readonly (readonly string[])[] = [
  ['quick-fix', 'Targeted single-agent patch flow'],
  ['feature-squad', 'Plan, implement, review'],
  ['fullstack-team', 'Broader multi-stream delivery flow'],
  ['refactor-platoon', 'Structural cleanup with validation'],
  ['security-audit', 'Audit-first security workflow'],
];

const PRESET_ORDER: readonly Preset[] = ['solo', 'squad', 'platoon', 'fleet'];
const DEFAULT_TASK = 'Explore repository health and propose next steps';
const DEFAULT_REPO_HINT = '.';

export async function startInteractive(): Promise<void> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const registry = new AgentRegistry();
  const providers = new ProviderRegistry();
  const state: InteractiveState = {
    locale: DEFAULT_SESSION_CONFIG.locale,
    defaultPreset: DEFAULT_SESSION_CONFIG.preset,
  };

  registry.loadBuiltins();
  printBanner();

  let running = true;

  try {
    while (running) {
      printMenu();
      const answer = await prompt(rl, `${c.cyan('fleet')}${c.dim('>')} `, { onInterrupt: 'exit' });
      if (answer === undefined) {
        break;
      }

      const choice = answer.trim().toLowerCase();

      switch (choice) {
        case '1':
        case 'run':
          await handleRun(rl, state);
          break;
        case '2':
        case 'status':
          handleStatus(state);
          break;
        case '3':
        case 'agents':
          handleAgents(registry);
          break;
        case '4':
        case 'templates':
          handleTemplates();
          break;
        case '5':
        case 'serve':
          handleServe();
          break;
        case '6':
        case 'settings':
          handleSettings(state, registry, providers);
          break;
        case '0':
        case 'quit':
        case 'exit':
          running = false;
          break;
        case 'help':
          printHelp();
          break;
        case '':
          printHelp();
          break;
        default:
          console.log(c.yellow('Unknown command. Type "help" for available commands.'));
          break;
      }
    }
  } finally {
    console.log(`\n${c.dim('👋 Goodbye!')}\n`);
    rl.close();
    await providers.dispose().catch(() => undefined);
  }
}

async function handleRun(rl: readline.Interface, state: InteractiveState): Promise<void> {
  printHeader('🚀 Run orchestration', 'Describe the job, optional repo, and the team size preset.');
  console.log(c.dim(`Available presets: ${formatPresetHelp()}`));

  const task = await prompt(rl, 'Task description: ', { defaultValue: DEFAULT_TASK, onInterrupt: 'cancel' });
  if (task === undefined) {
    return;
  }

  const repoInput = await prompt(rl, 'Repository (optional): ', { defaultValue: DEFAULT_REPO_HINT, onInterrupt: 'cancel' });
  if (repoInput === undefined) {
    return;
  }

  const presetInput = await prompt(rl, 'Preset: ', { defaultValue: state.defaultPreset, onInterrupt: 'cancel' });
  if (presetInput === undefined) {
    return;
  }

  const preset = resolvePreset(presetInput, state.defaultPreset);
  const repo = normalizeRepo(repoInput);
  const estimatedDurationMs = PRESET_AGENTS[preset] * 90_000;
  state.defaultPreset = preset;
  state.session = {
    task,
    repo,
    preset,
    startedAt: new Date(),
    estimatedDurationMs,
  };

  printHeader('Execution plan', `${PRESET_AGENTS[preset]} agent(s) staged at ${timestamp(state.session.startedAt)}`);
  printTable(
    ['Wave', 'Focus', 'Status'],
    [
      ['1', 'Task analysis and routing', 'Ready'],
      ['2', `Execution with ${PRESET_AGENTS[preset]} agent(s)`, 'Queued'],
      ['3', 'Review and delivery summary', 'Pending'],
    ],
  );

  console.log(`\n${c.green('✓ Plan created')}`);
  console.log(`Task: ${task}`);
  console.log(`Repo: ${repo ?? c.dim('not specified')}`);
  console.log(`Preset: ${preset} (${PRESET_AGENTS[preset]} agent(s))`);
  console.log(`ETA: ${formatDuration(estimatedDurationMs)}`);
}

function handleStatus(state: InteractiveState): void {
  printHeader('📊 Status');
  if (!state.session) {
    console.log(c.dim('No active session.'));
    return;
  }

  const elapsedMs = Date.now() - state.session.startedAt.getTime();
  printTable(
    ['Task', 'Preset', 'Started', 'Elapsed'],
    [[state.session.task, state.session.preset, timestamp(state.session.startedAt), formatDuration(elapsedMs)]],
  );
  console.log(`\nRepo: ${state.session.repo ?? c.dim('not specified')}`);
  console.log(`Estimated completion window: ${formatDuration(state.session.estimatedDurationMs)}`);
}

function handleAgents(registry: AgentRegistry): void {
  printHeader('🤖 Agents', 'Builtin agents available to the fleet.');
  const rows = registry.getAll().map((agent) => formatAgentRow(agent));
  printTable(['Status', 'Name', 'Provider', 'Model'], rows);
  console.log(`\n${c.dim(`${rows.length} agent(s) available`)}`);
}

function handleTemplates(): void {
  printHeader('📋 Templates', 'Starter orchestration graphs available in the workspace.');
  printTable(['Template', 'Description'], TEMPLATE_ROWS);
}

function handleServe(): void {
  printHeader('🌐 Web server');
  console.log(`Run ${c.bold('fleet serve')} to launch the web UI from the CLI entrypoint.`);
  console.log(c.dim('This interactive screen does not start the server directly.'));
}

function handleSettings(state: InteractiveState, registry: AgentRegistry, providers: ProviderRegistry): void {
  printHeader('⚙️  Settings');
  printTable(
    ['Key', 'Value'],
    [
      ['version', VERSION],
      ['locale', state.locale],
      ['default preset', state.defaultPreset],
      ['builtin agents', String(registry.getBuiltins().length)],
      ['active providers', String(providers.getAll().size)],
    ],
  );
}

function printBanner(): void {
  console.log(c.cyan('  ╔══════════════════════════════════════╗'));
  console.log(c.cyan(`  ║  ⚡ CopilotFleet v${VERSION.padEnd(18, ' ')}║`));
  console.log(c.cyan('  ║  Visual Agent Orchestration Platform ║'));
  console.log(c.cyan('  ╚══════════════════════════════════════╝'));
}

function printMenu(): void {
  console.log(`\n${c.bold(`⚡ CopilotFleet Interactive Mode v${VERSION}`)}`);
  console.log('\nWhat would you like to do?\n');
  console.log('  1) 🚀 Run orchestration');
  console.log('  2) 📊 View status');
  console.log('  3) 🤖 List agents');
  console.log('  4) 📋 List templates');
  console.log('  5) 🌐 Start web server');
  console.log('  6) ⚙️  Settings');
  console.log('  0) 👋 Exit\n');
}

function printHelp(): void {
  printHeader('Help', 'Available commands from the main menu prompt.');
  printTable(
    ['Command', 'Action'],
    [
      ['1 / run', 'Create a simulated orchestration plan'],
      ['2 / status', 'Show the active session summary'],
      ['3 / agents', 'List registered agents'],
      ['4 / templates', 'Show starter templates'],
      ['5 / serve', 'Explain how to start the web server'],
      ['6 / settings', 'Show current interactive settings'],
      ['0 / quit / exit', 'Close interactive mode'],
      ['help', 'Show this help screen'],
    ],
  );
}

function formatPresetHelp(): string {
  return PRESET_ORDER.map((preset) => `${preset}=${PRESET_AGENTS[preset]}`).join(', ');
}

function formatAgentRow(agent: AgentDefinition): [string, string, string, string] {
  return [agent.builtin ? 'builtin' : 'custom', agent.displayName, agent.provider, agent.model];
}

function normalizeRepo(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === DEFAULT_REPO_HINT) {
    return undefined;
  }
  return trimmed;
}

function resolvePreset(value: string, fallback: Preset): Preset {
  const normalized = value.trim().toLowerCase();
  if (PRESET_ORDER.includes(normalized as Preset)) {
    return normalized as Preset;
  }

  console.log(c.yellow(`Unknown preset "${value}". Using ${fallback}.`));
  return fallback;
}

async function prompt(rl: readline.Interface, message: string, options: PromptOptions = {}): Promise<string | undefined> {
  const { defaultValue, onInterrupt = 'cancel' } = options;
  const controller = new AbortController();
  const handleSigint = (): void => controller.abort();
  process.once('SIGINT', handleSigint);

  const suffix = defaultValue && defaultValue.length > 0 ? c.dim(` [default: ${defaultValue}]`) : '';

  try {
    const answer = await new Promise<string | undefined>((resolve, reject) => {
      const handleClose = (): void => resolve(undefined);
      rl.once('close', handleClose);

      rl.question(`${message}${suffix}`, { signal: controller.signal }).then(
        (value) => {
          rl.off('close', handleClose);
          resolve(value);
        },
        (error: unknown) => {
          rl.off('close', handleClose);
          reject(error);
        },
      );
    });

    if (answer === undefined) {
      return undefined;
    }
    const trimmed = answer.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
    return defaultValue;
  } catch (error: unknown) {
    if (isAbortError(error)) {
      console.log();
      if (onInterrupt === 'exit') {
        return undefined;
      }
      console.log(c.yellow('Input cancelled. Returning to the main menu.'));
      return undefined;
    }
    if (isClosedError(error)) {
      return undefined;
    }
    throw error;
  } finally {
    process.off('SIGINT', handleSigint);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isClosedError(error: unknown): boolean {
  return error instanceof Error && /close|canceled|cancelled/i.test(error.message);
}