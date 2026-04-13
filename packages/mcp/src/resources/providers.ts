import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ProviderType } from '@copilot-fleet/shared';

import type { FleetState } from '../state.js';

type ProviderInfo = {
  type: ProviderType;
  status: 'available';
  supportedModels: string[];
};

type TemplateInfo = {
  id: string;
  name: string;
  description: string;
  agents: number;
};

const PROVIDERS: ProviderInfo[] = [
  { type: 'github-copilot', status: 'available', supportedModels: ['claude-sonnet-4', 'gpt-4o', 'gpt-4o-mini', 'o3-mini'] },
  {
    type: 'openai',
    status: 'available',
    supportedModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o3-mini'],
  },
  {
    type: 'anthropic',
    status: 'available',
    supportedModels: ['claude-sonnet-4-20250514', 'claude-haiku-3-5-20241022', 'claude-opus-4-20250514'],
  },
  { type: 'ollama', status: 'available', supportedModels: [] },
  { type: 'lmstudio', status: 'available', supportedModels: [] },
  { type: 'custom-api', status: 'available', supportedModels: [] },
  { type: 'vscode-local', status: 'available', supportedModels: ['vscode-default'] },
];

const TEMPLATES: TemplateInfo[] = [
  { id: 'quick-fix', name: 'Quick Fix', description: 'Single-agent graph for fast fixes', agents: 1 },
  { id: 'feature-squad', name: 'Feature Squad', description: '3 agents: plan → code → review', agents: 3 },
  { id: 'fullstack-team', name: 'Fullstack Team', description: '6 agents, full pipeline', agents: 6 },
  { id: 'refactor-platoon', name: 'Refactor Platoon', description: 'Refactoring pipeline', agents: 5 },
  { id: 'security-audit', name: 'Security Audit', description: 'Security audit flow', agents: 3 },
];

function stringify(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function registerProviderResources(server: McpServer, _state: FleetState): void {
  server.registerResource(
    'providers',
    'fleet://providers',
    {
      description: 'Supported Fleet provider types and model families.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [{ uri: uri.href, text: stringify(PROVIDERS) }],
    }),
  );

  server.registerResource(
    'templates',
    'fleet://templates',
    {
      description: 'Built-in Fleet graph templates.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [{ uri: uri.href, text: stringify(TEMPLATES) }],
    }),
  );
}
