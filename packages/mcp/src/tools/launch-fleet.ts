import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { FleetState } from '../state.js';
import { errorResponse, textResponse } from './response.js';

const presetSchema = z.enum(['solo', 'squad', 'platoon', 'fleet']);

export function registerLaunchFleet(server: McpServer, state: FleetState): void {
  server.registerTool(
    'launch_fleet',
    {
      description: 'Launch parallel AI agents to execute a task and return the created session plan.',
      inputSchema: {
        task: z.string().describe('Task description for the fleet to execute.'),
        repo: z.string().optional().describe('Target repository in owner/repo format.'),
        agents: z.number().int().min(1).max(10).optional().describe('Optional agent count override from 1 to 10.'),
        preset: presetSchema.optional().describe('Orchestration preset: solo, squad, platoon, or fleet.'),
        template: z.string().optional().describe('Optional graph template name to associate with the session.'),
      },
    },
    async (args) => {
      try {
        const preset = args.preset ?? 'squad';
        const session = state.createSession(args.task, args.repo, preset, args.template, args.agents);
        const lines = [
          '## Fleet Session Started',
          '',
          `Session ID: ${session.id}`,
          `Task: ${session.task}`,
          session.repo ? `Repository: ${session.repo}` : '',
          session.template ? `Template: ${session.template}` : '',
          `Preset: ${session.preset}`,
          `Agents: ${session.agentCount}`,
          `Waves: ${session.waves}`,
          `Status: ${session.status}`,
          '',
          'Use fleet_status to inspect the active session.',
          'Use abort_fleet to stop it early.',
        ].filter(Boolean);

        return textResponse(lines.join('\n'));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to launch fleet session.';
        return errorResponse(message);
      }
    },
  );
}