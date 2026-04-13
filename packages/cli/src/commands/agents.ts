import { readFile, unlink } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';

import { AgentRegistry, discoverAgentFiles, loadAgentFromString } from '@copilot-fleet/agents';
import { Command } from 'commander';

import { c, failure, fileExists, fleetPath, info, printHeader, printTable, success, warn, writeTextFile } from '../utils.js';

export function registerAgentsCommand(program: Command): void {
  const command = program.command('agents').description('Manage builtin and custom agents');

  command.command('list').description('List all agents').action(async () => wrap(listAgents));
  command.command('add <path>').description('Add a custom agent from YAML/JSON').action(async (path: string) => wrap(() => addAgent(path)));
  command.command('remove <id>').description('Remove a custom agent').action(async (id: string) => wrap(() => removeAgent(id)));
  command.command('info <id>').description('Show agent details').action(async (id: string) => wrap(() => showAgentInfo(id)));
}

async function listAgents(): Promise<void> {
  const registry = await loadRegistry();
  printHeader('CopilotFleet Agents');
  const rows = registry.getAll().map((agent) => [
    agent.id,
    agent.displayName,
    agent.provider,
    agent.model,
    agent.builtin ? c.green('✓') : c.dim('custom'),
  ]);
  printTable(['ID', 'Name', 'Provider', 'Model', 'Builtin'], rows);
}

async function addAgent(sourcePath: string): Promise<void> {
  const absolutePath = resolve(process.cwd(), sourcePath);
  if (!(await fileExists(absolutePath))) {
    throw new Error(`Agent definition file was not found: ${absolutePath}`);
  }

  const content = await readFile(absolutePath, 'utf8');
  const extension = extname(absolutePath).toLowerCase();
  const agent = loadAgentFromString(content, extension === '.json' ? 'json' : 'yaml');
  const targetPath = fleetPath('agents', `${agent.id}${extension === '.json' ? '.json' : '.yaml'}`);
  await writeTextFile(targetPath, content);
  printHeader('CopilotFleet Agents');
  success(`Added custom agent ${c.bold(agent.id)}.`);
}

async function removeAgent(id: string): Promise<void> {
  const files = await discoverAgentFiles(fleetPath('agents'));
  const match = files.find((file) => basename(file, extname(file)) === id);
  printHeader('CopilotFleet Agents');
  if (!match) {
    warn(`Custom agent ${id} was not found.`);
    return;
  }

  await unlink(match);
  success(`Removed custom agent ${c.bold(id)}.`);
}

async function showAgentInfo(id: string): Promise<void> {
  const registry = await loadRegistry();
  const agent = registry.get(id);
  printHeader('CopilotFleet Agents');
  if (!agent) {
    warn(`Agent ${id} was not found.`);
    return;
  }

  console.log(`${c.bold('🆔 ID')} ${agent.id}`);
  console.log(`${c.bold('🏷 Name')} ${agent.displayName}`);
  console.log(`${c.bold('📝 Description')} ${agent.description}`);
  console.log(`${c.bold('🔌 Provider')} ${agent.provider}`);
  console.log(`${c.bold('🧠 Model')} ${agent.model}`);
  console.log(`${c.bold('📌 Builtin')} ${agent.builtin ? 'yes' : 'no'}`);
  if (agent.labels?.length) {
    info(`Labels: ${agent.labels.join(', ')}`);
  }
}

async function loadRegistry(): Promise<AgentRegistry> {
  const registry = new AgentRegistry();
  registry.loadBuiltins();
  const files = await discoverAgentFiles(fleetPath('agents'));
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    const format = file.endsWith('.json') ? 'json' : 'yaml';
    registry.register(loadAgentFromString(content, format));
  }
  return registry;
}

async function wrap(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent command failed.';
    failure(message);
    process.exit(1);
  }
}