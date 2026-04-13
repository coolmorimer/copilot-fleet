import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

function formatOptional(label: string, value: string | undefined): string {
  return `${label}: ${value && value.trim().length > 0 ? value : 'Not specified'}`;
}

export function registerOrchestratePrompt(server: McpServer): void {
  server.registerPrompt(
    'orchestrate-task',
    {
      description: 'Create an orchestration plan for executing a task with CopilotFleet.',
      argsSchema: {
        task: z.string().min(1).describe('Task to coordinate across Fleet agents.'),
        repo: z.string().optional().describe('Repository or workspace context for the task.'),
        preset: z.string().optional().describe('Preferred Fleet preset for the orchestration.'),
      },
    },
    (args) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `You are CopilotFleet orchestrator. Your task is to coordinate AI agents to accomplish the following:\n\nTask: ${args.task}\n${formatOptional('Repository', args.repo)}\n${formatOptional('Preset', args.preset)}\n\nInstructions:\n1. Analyze the task and break it into subtasks\n2. Assign each subtask to the most appropriate agent\n3. Define the execution order (waves) based on dependencies\n4. Monitor progress and handle errors\n5. Aggregate results and provide a summary\n\nAvailable agents: Coder, Reviewer, Tester, Refactorer, Documenter, Security, Designer, DevOps, Researcher, Planner\n\nUse the launch_fleet tool to start execution when ready.`,
          },
        },
      ],
    }),
  );
}
