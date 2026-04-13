import type { LLMMessage, LLMRequest, LLMResponse, LLMTool, LLMToolCall } from '@copilot-fleet/shared';

import { BaseProvider } from './base-provider.js';

type AnthropicContentBlock = {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
};

type AnthropicResponse = {
  id?: string;
  model?: string;
  stop_reason?: string;
  content?: AnthropicContentBlock[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

const ANTHROPIC_MODELS = ['claude-sonnet-4-20250514', 'claude-haiku-3-5-20241022', 'claude-opus-4-20250514'];

export class AnthropicProvider extends BaseProvider {
  readonly type = 'anthropic';

  async complete(request: LLMRequest): Promise<LLMResponse> {
    this.ensureInitialized();

    const response = await this.httpPost<AnthropicResponse>(
      'https://api.anthropic.com/v1/messages',
      {
        model: request.model,
        system: request.systemPrompt,
        messages: request.messages.map((message: LLMMessage) => ({ role: message.role, content: message.content })),
        max_tokens: request.maxTokens ?? this.config.maxTokens ?? 1024,
        temperature: request.temperature,
        tools: request.tools?.map((tool: LLMTool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters,
        })),
      },
      {
        'x-api-key': this.config.apiKey ?? '',
        'anthropic-version': '2023-06-01',
      },
    );

    const text = (response.content ?? [])
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text ?? '')
      .join('\n');
    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;

    return {
      content: text,
      model: response.model ?? request.model,
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      finishReason: this.mapFinishReason(response.stop_reason),
      toolCalls: this.toToolCalls(response.content),
    };
  }

  async listModels(): Promise<string[]> {
    this.ensureInitialized();
    return [...ANTHROPIC_MODELS];
  }

  private mapFinishReason(reason: string | undefined): LLMResponse['finishReason'] {
    if (reason === 'max_tokens') {
      return 'length';
    }

    if (reason === 'tool_use') {
      return 'tool_calls';
    }

    if (reason === 'end_turn' || reason === 'stop_sequence') {
      return 'stop';
    }

    return 'error';
  }

  private toToolCalls(blocks: AnthropicContentBlock[] | undefined): LLMToolCall[] | undefined {
    const parsed = (blocks ?? [])
      .filter((block) => block.type === 'tool_use' && typeof block.name === 'string')
      .map((block, index) => ({
        id: block.id ?? `tool-call-${index + 1}`,
        name: block.name ?? 'tool',
        arguments: block.input ?? {},
      }));

    return parsed.length > 0 ? parsed : undefined;
  }
}