import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { FleetState } from '../state.js';

function normalizeTemplateVariable(value: string | string[]): string {
  return Array.isArray(value) ? (value[0] ?? '') : value;
}

export function registerResources(server: McpServer, state: FleetState): void {
  server.registerResource(
    'agents',
    'fleet://agents',
    {
      description: 'JSON snapshot of all registered agents.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify({ agents: state.agentRegistry.getAll() }, null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    'session',
    new ResourceTemplate('fleet://sessions/{sessionId}', {
      list: async () => ({
        resources: state.getSessions().map((session) => ({
          name: `session-${session.id}`,
          uri: `fleet://sessions/${session.id}`,
        })),
      }),
    }),
    {
      description: 'JSON snapshot of a fleet session by id.',
      mimeType: 'application/json',
    },
    async (uri, { sessionId }) => {
      const normalizedSessionId = normalizeTemplateVariable(sessionId);

      return {
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(
            state.getSession(normalizedSessionId) ?? { error: `Session "${normalizedSessionId}" was not found.` },
            null,
            2,
          ),
        },
      ],
      };
    },
  );
}
