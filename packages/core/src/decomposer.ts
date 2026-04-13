import type { Subtask, TaskDecomposition } from '@copilot-fleet/shared';

import type { ProviderAdapter } from './types.js';

type JsonDecomposition = {
  subtasks?: Array<{ title?: string; description?: string; agent?: string; dependencies?: string[] }>;
};

export class Decomposer {
  private provider: ProviderAdapter;

  constructor(provider: ProviderAdapter) {
    this.provider = provider;
  }

  async decompose(task: string, availableAgents: string[]): Promise<TaskDecomposition> {
    const prompt = this.buildPrompt(task, availableAgents);
    const models = await this.provider.listModels();
    const response = await this.provider.complete({
      model: models[0] ?? 'default-model',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    });
    const decomposition = this.parseResponse(response.content);
    return {
      ...decomposition,
      originalTask: task,
    };
  }

  buildPrompt(task: string, agents: string[]): string {
    return [
      'Decompose the user task into executable subtasks.',
      'Return JSON with the shape: {"subtasks":[{"title":"...","description":"...","agent":"...","dependencies":[]}]}',
      `Available agents: ${agents.join(', ') || 'none provided'}`,
      `Task: ${task}`,
    ].join('\n');
  }

  parseResponse(response: string): TaskDecomposition {
    const normalized = response.trim();
    const jsonBlock = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? normalized;

    try {
      const parsed = JSON.parse(jsonBlock) as JsonDecomposition;
      const subtasks = (parsed.subtasks ?? []).map((subtask, index) => this.toSubtask(subtask, index));
      return {
        originalTask: '',
        subtasks,
        dependencies: [],
        waves: subtasks.length > 0 ? [subtasks] : [],
      };
    } catch {
      const subtasks = normalized
        .split('\n')
        .map((line) => line.replace(/^[-*\d.\s]+/, '').trim())
        .filter(Boolean)
        .map((title, index) => this.toSubtask({ title, description: title }, index));
      return {
        originalTask: '',
        subtasks,
        dependencies: [],
        waves: subtasks.length > 0 ? [subtasks] : [],
      };
    }
  }

  private toSubtask(
    subtask: { title?: string; description?: string; agent?: string; dependencies?: string[] },
    index: number,
  ): Subtask {
    return {
      id: `subtask-${index + 1}`,
      title: subtask.title ?? `Subtask ${index + 1}`,
      description: subtask.description ?? subtask.title ?? `Subtask ${index + 1}`,
      agentType: subtask.agent ?? 'general',
      priority: Math.max(1, 100 - index),
      estimatedDuration: undefined,
    };
  }
}