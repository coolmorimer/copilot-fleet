import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { FleetSession, FleetState } from '../state.js';

type SessionSummary = Pick<FleetSession, 'id' | 'task' | 'status' | 'startedAt'>;

function stringify(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function toSessionSummary(session: FleetSession): SessionSummary {
  return {
    id: session.id,
    task: session.task,
    status: session.status,
    startedAt: session.startedAt,
  };
}

export function registerSessionResources(server: McpServer, state: FleetState): void {
  server.registerResource(
    'sessions',
    'fleet://sessions',
    {
      description: 'Current and historical Fleet sessions.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const sessions = Array.from(state.sessions.values(), toSessionSummary);

      return {
        contents: [{ uri: uri.href, text: stringify(sessions) }],
      };
    },
  );

  server.registerResource(
    'session-details',
    new ResourceTemplate('fleet://sessions/{sessionId}', {
      list: async () => ({
        resources: Array.from(state.sessions.values(), (session) => ({
          uri: `fleet://sessions/${session.id}`,
          name: `Session ${session.id}`,
        })),
      }),
    }),
    {
      description: 'Full details for a Fleet session.',
      mimeType: 'application/json',
    },
    async (uri, { sessionId }) => {
      const normalizedSessionId = Array.isArray(sessionId) ? sessionId[0] : sessionId;
      const session = normalizedSessionId ? state.sessions.get(normalizedSessionId) : undefined;
      const data = session ?? {
        error: 'Session not found.',
        id: normalizedSessionId ?? '',
      };

      return {
        contents: [{ uri: uri.href, text: stringify(data) }],
      };
    },
  );
}
