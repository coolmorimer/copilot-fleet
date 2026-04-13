import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  DEFAULT_AGENT_PARAMETERS,
  validateAgentDefinition,
  type AgentDefinition,
  type ProviderType,
} from '@copilot-fleet/shared';

import type { FleetState } from '../state.js';
import { errorResponse, textResponse } from './response.js';

const providerSchema = z.enum([
  'github-copilot',
  'openai',
  'anthropic',
  'ollama',
  'lmstudio',
  'custom-api',
  'vscode-local',
]);

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function uniqueAgentId(state: FleetState, name: string): string {
  const baseId = slugify(name);
  if (!state.agentRegistry.has(baseId)) {
    return baseId;
  }

  let index = 2;
  let nextId = `${baseId}-${index}`;
  while (state.agentRegistry.has(nextId)) {
    index += 1;
    nextId = `${baseId}-${index}`;
  }

  return nextId;
}

function toAgentDefinition(
  state: FleetState,
  args: {
    name: string;
    displayName: string;
    description: string;
    provider: ProviderType;
    model: string;
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
  },
): AgentDefinition {
  return {
    id: uniqueAgentId(state, args.name),
    name: args.name.trim(),
    displayName: args.displayName.trim(),
    description: args.description.trim(),
    provider: args.provider,
    model: args.model.trim(),
    systemPrompt: args.systemPrompt.trim(),
    parameters: {
      temperature: args.temperature,
      maxTokens: args.maxTokens,
      timeout: DEFAULT_AGENT_PARAMETERS.timeout,
    },
    builtin: false,
  };
}

export function registerAddAgent(server: McpServer, state: FleetState): void {
  server.registerTool(
    'add_agent',
    {
      description: 'Register a custom agent with provider, model, prompt, and generation parameters.',
      inputSchema: {
        name: z.string().describe('Short agent name used to derive the id.'),
        displayName: z.string().describe('Human-readable name shown in agent listings.'),
        description: z.string().describe('What the agent is responsible for.'),
        provider: providerSchema.describe('Provider identifier for the agent runtime.'),
        model: z.string().describe('Model name for the selected provider.'),
        systemPrompt: z.string().describe('System prompt that defines the agent behavior.'),
        temperature: z.number().min(0).max(2).describe('Sampling temperature from 0 to 2.'),
        maxTokens: z.number().int().positive().describe('Maximum output tokens for agent completions.'),
      },
    },
    async (args) => {
      try {
        const agent = toAgentDefinition(state, {
          name: args.name,
          displayName: args.displayName,
          description: args.description,
          provider: args.provider,
          model: args.model,
          systemPrompt: args.systemPrompt,
          temperature: args.temperature,
          maxTokens: args.maxTokens,
        });
        const validation = validateAgentDefinition(agent);
        if (!validation.valid) {
          return errorResponse(`Invalid agent definition: ${validation.errors.join('; ')}`);
        }

        const registered = state.addAgent(agent);
        return textResponse([
          '## Agent Registered',
          '',
          `ID: ${registered.id}`,
          `Name: ${registered.displayName}`,
          `Provider: ${registered.provider}`,
          `Model: ${registered.model}`,
          'Builtin: no',
        ].join('\n'));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to register custom agent.';
        return errorResponse(message);
      }
    },
  );
}