import type { AgentDefinition, AgentParameters } from '@copilot-fleet/shared';

export type { AgentDefinition };

export interface AgentInstance {
  definition: AgentDefinition;
  getSystemPrompt(): string;
  getParameters(): AgentParameters;
  toJSON(): Record<string, unknown>;
}

const cloneDefinition = (definition: AgentDefinition): AgentDefinition => ({
  ...definition,
  parameters: { ...definition.parameters },
  files: definition.files
    ? {
        include: definition.files.include ? [...definition.files.include] : undefined,
        exclude: definition.files.exclude ? [...definition.files.exclude] : undefined,
      }
    : undefined,
  hooks: definition.hooks ? { ...definition.hooks } : undefined,
  labels: definition.labels ? [...definition.labels] : undefined,
});

export function createAgentInstance(definition: AgentDefinition): AgentInstance {
  const snapshot = cloneDefinition(definition);

  return {
    definition: snapshot,
    getSystemPrompt(): string {
      return snapshot.systemPrompt;
    },
    getParameters(): AgentParameters {
      return { ...snapshot.parameters };
    },
    toJSON(): Record<string, unknown> {
      return {
        ...snapshot,
        parameters: { ...snapshot.parameters },
        files: snapshot.files
          ? {
              include: snapshot.files.include ? [...snapshot.files.include] : undefined,
              exclude: snapshot.files.exclude ? [...snapshot.files.exclude] : undefined,
            }
          : undefined,
        hooks: snapshot.hooks ? { ...snapshot.hooks } : undefined,
        labels: snapshot.labels ? [...snapshot.labels] : undefined,
      };
    },
  };
}