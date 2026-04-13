import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerDecomposePrompt(server: McpServer): void {
  server.registerPrompt(
    'decompose-task',
    {
      description: 'Break a complex task into coordinated Fleet subtasks and execution waves.',
      argsSchema: {
        task: z.string().min(1).describe('Task to decompose into executable Fleet subtasks.'),
        maxSubtasks: z.string().optional().default('5').describe('Maximum number of subtasks to propose.'),
      },
    },
    (args) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Analyze the following task and prepare a Fleet execution plan.\n\nTask: ${args.task}\nMaximum subtasks: ${args.maxSubtasks ?? '5'}\n\nProvide the result in five parts:\n1. Analyze the task and identify the main objective\n2. Identify technical and sequencing dependencies\n3. Split the work into clear subtasks\n4. Assign the best Fleet agent to each subtask\n5. Define execution waves based on dependencies and parallelism\n\nKeep the plan concise, actionable, and ready for orchestration.`,
          },
        },
      ],
    }),
  );
}
