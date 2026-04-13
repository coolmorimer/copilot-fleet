import type { LLMRequest, LLMResponse, LLMTool, LLMToolCall } from '@copilot-fleet/shared';

import { BaseProvider } from './base-provider.js';

type OpenAIToolCall = {
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

type OpenAIChatResponse = {
  id?: string;
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
      tool_calls?: OpenAIToolCall[];
    };
  }>;
};

type OpenAIModelsResponse = {
  data?: Array<{
    id?: string;
  }>;
};

export class OpenAIProvider extends BaseProvider {
  readonly type: string = 'openai';

  async complete(request: LLMRequest): Promise<LLMResponse> {
    this.ensureInitialized();

    const body = {
      model: request.model,
      messages: this.buildMessages(request),
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      tools: this.toOpenAITools(request.tools),
      stream: false,
    };

    const response = await this.httpPost<OpenAIChatResponse>(`${this.getBaseUrl()}/v1/chat/completions`, body, this.getHeaders());
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

    const response = await this.httpGet<OpenAIModelsResponse>(`${this.getBaseUrl()}/v1/models`, this.getHeaders());
    const available = (response.data ?? [])
      .map((model) => model.id)
      .filter((modelId): modelId is string => typeof modelId === 'string' && modelId.length > 0);
    const preferred = ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o3-mini'];
    const popular = preferred.filter((modelId) => available.includes(modelId));
    return popular.length > 0 ? popular : available;
  }

  protected getBaseUrl(): string {
    return (this.config.baseUrl ?? 'https://api.openai.com').replace(/\/+$/, '');
  }

  protected getHeaders(): Record<string, string> {
    return {};
  }

  protected mapFinishReason(reason: string | undefined): LLMResponse['finishReason'] {
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

  protected toToolCalls(toolCalls: OpenAIToolCall[] | undefined): LLMToolCall[] | undefined {
    const parsed = (toolCalls ?? [])
      .map((toolCall, index) => this.toToolCall(toolCall, index))
      .filter((toolCall): toolCall is LLMToolCall => toolCall !== null);

    return parsed.length > 0 ? parsed : undefined;
  }

  protected toToolCall(toolCall: OpenAIToolCall, index: number): LLMToolCall | null {
    const name = toolCall.function?.name;
    if (!name) {
      return null;
    }

    return {
      id: toolCall.id ?? `tool-call-${index + 1}`,
      name,
      arguments: this.parseToolArguments(toolCall.function?.arguments),
    };
  }

  private toOpenAITools(tools: LLMTool[] | undefined): Array<{ type: 'function'; function: LLMTool }> | undefined {
    if (!tools || tools.length === 0) {
      return undefined;
    }

    return tools.map((tool) => ({
      type: 'function',
      function: tool,
    }));
  }

  private parseToolArguments(value: string | undefined): Record<string, unknown> {
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