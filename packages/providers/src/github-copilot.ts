import type { LLMRequest, LLMResponse, LLMTool, LLMToolCall } from '@copilot-fleet/shared';

import { BaseProvider } from './base-provider.js';

type CopilotToolCall = {
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

type CopilotResponse = {
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | null;
      tool_calls?: CopilotToolCall[];
    };
  }>;
};

const COPILOT_MODELS = ['claude-sonnet-4', 'gpt-4o', 'gpt-4o-mini', 'o3-mini'];

export class GitHubCopilotProvider extends BaseProvider {
  readonly type = 'github-copilot';

  async initialize(): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error('GitHub Copilot provider requires an API token.');
    }

    await this.httpPost<CopilotResponse>(
      'https://api.githubcopilot.com/chat/completions',
      {
        model: this.config.defaultModel ?? COPILOT_MODELS[0],
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      },
      {},
    );

    this.initialized = true;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    this.ensureInitialized();

    const response = await this.httpPost<CopilotResponse>('https://api.githubcopilot.com/chat/completions', {
      model: request.model,
      messages: this.buildMessages(request),
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      tools: request.tools?.map((tool: LLMTool) => ({ type: 'function', function: tool })),
      stream: false,
    });

    const choice = response.choices?.[0];
    const usage = response.usage;

    return {
      content: typeof choice?.message?.content === 'string' ? choice.message.content : '',
      model: response.model ?? request.model,
      usage: {
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      },
      finishReason: this.mapFinishReason(choice?.finish_reason),
      toolCalls: this.toToolCalls(choice?.message?.tool_calls),
    };
  }

  async listModels(): Promise<string[]> {
    this.ensureInitialized();
    return [...COPILOT_MODELS];
  }

  private mapFinishReason(reason: string | undefined): LLMResponse['finishReason'] {
    if (reason === 'length') {
      return 'length';
    }

    if (reason === 'tool_calls' || reason === 'function_call') {
      return 'tool_calls';
    }

    if (reason === 'stop') {
      return 'stop';
    }

    return 'error';
  }

  private toToolCalls(toolCalls: CopilotToolCall[] | undefined): LLMToolCall[] | undefined {
    const parsed = (toolCalls ?? [])
      .map((toolCall, index) => {
        if (!toolCall.function?.name) {
          return null;
        }

        return {
          id: toolCall.id ?? `tool-call-${index + 1}`,
          name: toolCall.function.name,
          arguments: this.parseArguments(toolCall.function.arguments),
        };
      })
      .filter((toolCall): toolCall is LLMToolCall => toolCall !== null);

    return parsed.length > 0 ? parsed : undefined;
  }

  private parseArguments(value: string | undefined): Record<string, unknown> {
    if (!value) {
      return {};
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
}