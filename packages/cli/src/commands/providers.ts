import { stdin as input, stdout as output } from 'node:process';

import { Command } from 'commander';

import { c, failure, fleetPath, printHeader, printTable, readJsonIfExists, success, warn, writeTextFile } from '../utils.js';

type ProviderType = 'github-copilot' | 'openai' | 'anthropic' | 'ollama' | 'lmstudio' | 'custom-api' | 'vscode-local';
type StoredProvider = { type: ProviderType; name: string; apiKey?: string; models: string[]; status: 'configured' | 'available' };

const supportedProviders: StoredProvider[] = [
  { type: 'github-copilot', name: 'GitHub Copilot', models: ['claude-sonnet-4', 'gpt-4o'], status: 'available' },
  { type: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini'], status: 'available' },
  { type: 'anthropic', name: 'Anthropic', models: ['claude-sonnet-4'], status: 'available' },
  { type: 'ollama', name: 'Ollama', models: ['llama3.1'], status: 'available' },
  { type: 'lmstudio', name: 'LM Studio', models: ['local-model'], status: 'available' },
  { type: 'custom-api', name: 'Custom API', models: ['custom-model'], status: 'available' },
  { type: 'vscode-local', name: 'VS Code Local', models: ['copilot-local'], status: 'available' },
];

export function registerProvidersCommand(program: Command): void {
  const command = program.command('providers').description('Manage providers');

  command.command('list').description('List configured providers').action(async () => wrap(listProviders));
  command.command('add <type>').description('Add a provider and prompt for API key').action(async (type: ProviderType) => wrap(() => addProvider(type)));
  command.command('test <type>').description('Test provider connection').action(async (type: ProviderType) => wrap(() => testProvider(type)));
}

async function listProviders(): Promise<void> {
  const configured = await loadConfiguredProviders();
  const rows = supportedProviders.map((provider) => {
    const found = configured.find((item) => item.type === provider.type);
    return [provider.type, provider.name, provider.models.join(', '), found ? c.green('✓ configured') : c.yellow('⚠ available')];
  });
  printHeader('CopilotFleet Providers');
  printTable(['Type', 'Name', 'Models', 'Status'], rows);
}

async function addProvider(type: ProviderType): Promise<void> {
  ensureSupported(type);
  const configured = await loadConfiguredProviders();
  const apiKey = await prompt(`Enter API key for ${type}: `);
  const existing = configured.filter((item) => item.type !== type);
  const template = supportedProviders.find((item) => item.type === type);
  if (!template) {
    throw new Error(`Unsupported provider type: ${type}`);
  }

  existing.push({ ...template, apiKey, status: 'configured' });
  await writeTextFile(fleetPath('providers.json'), JSON.stringify({ providers: existing.map(({ status, ...provider }) => provider) }, null, 2));
  printHeader('CopilotFleet Providers');
  success(`Provider ${c.bold(type)} saved to .fleet/providers.json.`);
}

async function testProvider(type: ProviderType): Promise<void> {
  ensureSupported(type);
  const configured = await loadConfiguredProviders();
  printHeader('CopilotFleet Providers');
  const provider = configured.find((item) => item.type === type);
  if (!provider) {
    warn(`Provider ${type} is not configured.`);
    return;
  }

  success(`Provider ${c.bold(type)} looks configured. Live connectivity checks are not implemented yet.`);
}

async function loadConfiguredProviders(): Promise<StoredProvider[]> {
  const stored = await readJsonIfExists<{ providers?: Array<Omit<StoredProvider, 'status'> | StoredProvider> }>(fleetPath('providers.json'));
  return (stored?.providers ?? []).map((provider) => ({ ...provider, status: 'configured' }));
}

async function prompt(message: string): Promise<string> {
  if (!input.isTTY || !output.isTTY) {
    throw new Error('Interactive prompt requires a TTY.');
  }

  output.write(message);
  input.setEncoding('utf8');
  input.resume();
  return new Promise<string>((resolvePromise) => {
    input.once('data', (chunk: string | Buffer) => {
      input.pause();
      resolvePromise(String(chunk).trim());
    });
  });
}

function ensureSupported(type: string): asserts type is ProviderType {
  if (!supportedProviders.some((provider) => provider.type === type)) {
    throw new Error(`Unsupported provider type: ${type}`);
  }
}

async function wrap(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provider command failed.';
    failure(message);
    process.exit(1);
  }
}