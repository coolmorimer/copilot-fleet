import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { FleetState } from '../state.js';
import { errorResponse, textResponse } from './response.js';

function formatAgentsTable(state: FleetState): string {
  const agents = state.agentRegistry.getAll();
  if (agents.length === 0) {
    return 'No agents are currently registered.';
  }

  const header = '| ID | Name | Provider | Model | Builtin |';
  const divider = '| --- | --- | --- | --- | --- |';
  const rows = agents.map(
    (agent) =>
      `| ${agent.id} | ${agent.displayName} | ${agent.provider} | ${agent.model} | ${agent.builtin ? 'yes' : 'no'} |`,
  );

  return ['## Registered Agents', '', header, divider, ...rows].join('\n');
}

export function registerListAgents(server: McpServer, state: FleetState): void {
  server.registerTool(
    'list_agents',
    {
      description: 'List all available builtin and custom agents with provider and model metadata.',
    },
    async () => {
      try {
        return textResponse(formatAgentsTable(state));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to list agents.';
        return errorResponse(message);
      }
    },
  );
}