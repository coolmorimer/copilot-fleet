import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { FleetSession, FleetState } from '../state.js';
import { errorResponse, textResponse } from './response.js';

function formatStatus(session: FleetSession): string {
  const completed = session.results.filter((result) => result.status === 'done').length;
  const failed = session.results.filter((result) => result.status === 'error').length;
  const lines = [
    '## Fleet Session Status',
    '',
    `Session ID: ${session.id}`,
    `Task: ${session.task}`,
    session.repo ? `Repository: ${session.repo}` : '',
    session.template ? `Template: ${session.template}` : '',
    `Preset: ${session.preset}`,
    `Agents: ${session.agentCount}`,
    `Status: ${session.status}`,
    `Wave: ${session.currentWave}/${session.waves}`,
    `Started: ${session.startedAt}`,
    session.completedAt ? `Completed: ${session.completedAt}` : '',
    `Results: ${completed} done, ${failed} error`,
  ].filter(Boolean);

  return lines.join('\n');
}

export function registerFleetStatus(server: McpServer, state: FleetState): void {
  server.registerTool(
    'fleet_status',
    {
      description: 'Show the status of the current fleet session or a specific session by ID.',
      inputSchema: {
        sessionId: z.string().optional().describe('Optional session identifier to inspect.'),
      },
    },
    async (args) => {
      try {
        const session = args.sessionId ? state.getSession(args.sessionId) : state.getActiveSession();
        if (!session) {
          return args.sessionId
            ? errorResponse(`Session "${args.sessionId}" was not found.`)
            : textResponse('No active fleet session.');
        }

        return textResponse(formatStatus(session));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch fleet status.';
        return errorResponse(message);
      }
    },
  );
}