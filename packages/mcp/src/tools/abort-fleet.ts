import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { FleetState } from '../state.js';
import { errorResponse, textResponse } from './response.js';

export function registerAbortFleet(server: McpServer, state: FleetState): void {
  server.registerTool(
    'abort_fleet',
    {
      description: 'Abort the current fleet session or a specific session by ID.',
      inputSchema: {
        sessionId: z.string().optional().describe('Optional session identifier to abort.'),
      },
    },
    async (args) => {
      try {
        const session = args.sessionId ? state.getSession(args.sessionId) : state.getActiveSession();
        if (!session) {
          return args.sessionId
            ? errorResponse(`Session "${args.sessionId}" was not found.`)
            : textResponse('No active fleet session to abort.');
        }

        if (!state.abortSession(session.id)) {
          return errorResponse(`Session "${session.id}" cannot be aborted because it is already terminal.`);
        }

        return textResponse([
          '## Fleet Session Aborted',
          '',
          `Session ID: ${session.id}`,
          `Task: ${session.task}`,
          `Status: aborted`,
        ].join('\n'));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to abort fleet session.';
        return errorResponse(message);
      }
    },
  );
}