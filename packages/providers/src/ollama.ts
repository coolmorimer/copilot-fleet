import type { LLMRequest, LLMResponse } from '@copilot-fleet/shared';

import { BaseProvider } from './base-provider.js';

type OllamaChatResponse = {
  model?: string;
  done_reason?: string;
  message?: {
    content?: string;
  };
  prompt_eval_count?: number;
  eval_count?: number;
};

type OllamaTagsResponse = {
  models?: Array<{
    name?: string;
  }>;
};

export class OllamaProvider extends BaseProvider {
  readonly type = 'ollama';

  async complete(request: LLMRequest): Promise<LLMResponse> {
    this.ensureInitialized();

    const response = await this.httpPost<OllamaChatResponse>(`${this.getBaseUrl()}/api/chat`, {
      model: request.model,
      messages: this.buildMessages(request).map((message) => ({
        role: message.role,
        content: message.content,
      })),
      stream: false,
      options: {
        temperature: request.temperature,
        num_predict: request.maxTokens ?? this.config.maxTokens,
      },
    }, this.getHeaders());

    const promptTokens = response.prompt_eval_count ?? 0;
    const completionTokens = response.eval_count ?? 0;

    return {
      content: response.message?.content ?? '',
      model: response.model ?? request.model,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      finishReason: response.done_reason === 'length' ? 'length' : 'stop',
    };
  }

  async listModels(): Promise<string[]> {
    this.ensureInitialized();

    const response = await this.httpGet<OllamaTagsResponse>(`${this.getBaseUrl()}/api/tags`, this.getHeaders());
    return (response.models ?? [])
      .map((model) => model.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0);
  }

  private getBaseUrl(): string {
    return (this.config.baseUrl ?? 'http://localhost:11434').replace(/\/+$/, '');
  }

  private getHeaders(): Record<string, string> {
    return { ...(this.config.headers ?? {}) };
  }
}