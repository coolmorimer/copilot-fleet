import { readdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import { deserializeGraph, type FleetGraph } from '@copilot-fleet/shared';
import { Command } from 'commander';

import { c, failure, printHeader, printTable, readJsonIfExists, repoPath, success, writeTextFile } from '../utils.js';

type TemplateSummary = { name: string; description: string; nodeCount: number; agentCount: number; graph: FleetGraph };

export function registerTemplatesCommand(program: Command): void {
  const command = program.command('templates').description('Manage graph templates');

  command.command('list').description('List available templates').action(async () => wrap(listTemplates));
  command.command('use <name>').description('Use template').action(async (name: string) => wrap(() => useTemplate(name)));
  command.command('info <name>').description('Show template details').action(async (name: string) => wrap(() => infoTemplate(name)));
}

async function listTemplates(): Promise<void> {
  const templates = await loadTemplates();
  printHeader('CopilotFleet Templates');
  printTable(
    ['Name', 'Description', 'Nodes', 'Agents'],
    templates.map((template) => [template.name, template.description, String(template.nodeCount), String(template.agentCount)]),
  );
}

async function useTemplate(name: string): Promise<void> {
  const template = await loadTemplate(name);
  await writeTextFile(resolve(process.cwd(), '.fleet', 'selected-template.json'), JSON.stringify(template.graph, null, 2));
  printHeader('CopilotFleet Templates');
  success(`Template ${c.bold(name)} saved as .fleet/selected-template.json.`);
}

async function infoTemplate(name: string): Promise<void> {
  const template = await loadTemplate(name);
  printHeader('CopilotFleet Templates');
  console.log(`${c.bold('🏷 Name')} ${template.name}`);
  console.log(`${c.bold('📝 Description')} ${template.description}`);
  console.log(`${c.bold('🔢 Nodes')} ${template.nodeCount}`);
  console.log(`${c.bold('🤖 Agents')} ${template.agentCount}`);
}

async function loadTemplates(): Promise<TemplateSummary[]> {
  const dir = repoPath('templates');
  const files = (await readdir(dir)).filter((file) => file.endsWith('.json')).sort();
  const templates = await Promise.all(files.map(async (file) => loadTemplate(basename(file, '.json'))));
  return templates;
}

async function loadTemplate(name: string): Promise<TemplateSummary> {
  const path = repoPath('templates', `${name}.json`);
  const raw = await readJsonIfExists<Record<string, unknown>>(path);
  if (!raw) {
    throw new Error(`Template ${name} was not found.`);
  }

  const graph = deserializeGraph(JSON.stringify(raw));
  return {
    name,
    description: graph.description ?? 'No description',
    nodeCount: graph.nodes.length,
    agentCount: graph.nodes.filter((node) => node.type === 'agent').length,
    graph,
  };
}

async function wrap(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Template command failed.';
    failure(message);
    process.exit(1);
  }
}