import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const presetSchema = z.enum(['solo', 'squad', 'platoon', 'fleet']);

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'launch_fleet_prompt',
    {
      description: 'Generate a user message that requests a launch_fleet tool call.',
      argsSchema: {
        task: z.string().describe('Task to execute.'),
        repo: z.string().optional().describe('Optional repository in owner/repo format.'),
        preset: presetSchema.optional().describe('Optional preset to prefer.'),
      },
    },
    (args) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              'Call launch_fleet with the following request:',
              `task: ${args.task}`,
              args.repo ? `repo: ${args.repo}` : '',
              args.preset ? `preset: ${args.preset}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
          },
        },
      ],
    }),
  );
}
