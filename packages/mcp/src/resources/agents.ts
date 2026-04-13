import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { FleetState } from '../state.js';

function stringify(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function registerAgentResources(server: McpServer, state: FleetState): void {
  server.registerResource(
    'agents',
    'fleet://agents',
    {
      description: 'Available Fleet agents and their configuration.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [{ uri: uri.href, text: stringify(state.agentRegistry.getAll()) }],
    }),
  );
}
