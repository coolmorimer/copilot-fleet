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

const COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token';
const COPILOT_COMPLETIONS_URL = 'https://api.githubcopilot.com/chat/completions';
const GITHUB_MODELS_URL = 'https://models.inference.ai.azure.com/chat/completions';

/** Map Copilot model names to GitHub Models compatible identifiers. */
function mapToGitHubModelsName(model: string): string {
  const MAP: Record<string, string> = {
    'claude-sonnet-4': 'gpt-4o',
    'claude-3-7-sonnet': 'gpt-4o',
    'claude-3-5-haiku': 'gpt-4o-mini',
  };
  return MAP[model] ?? model;
}

/** Reasoning models (o1, o3, etc.) require max_completion_tokens instead of max_tokens. */
function isReasoningModel(model: string): boolean {
  return /^o[0-9]/.test(model);
}

export class GitHubCopilotProvider extends BaseProvider {
  readonly type = 'github-copilot';

  private sessionToken: string | null = null;
  private sessionTokenExpiresAt = 0;
  private useGitHubModels = false;

  async initialize(): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error('GitHub Copilot provider requires a GitHub PAT.');
    }

    // Try Copilot internal token exchange first
    const token = await this.tryGetSessionToken();

    if (token) {
      // Verify with a minimal request
      try {
        await this.httpPost<CopilotResponse>(
          COPILOT_COMPLETIONS_URL,
          {
            model: this.config.defaultModel ?? COPILOT_MODELS[0],
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1,
            stream: false,
          },
          {
            Authorization: `Bearer ${token}`,
            'Editor-Version': 'vscode/1.96.0',
            'Editor-Plugin-Version': 'copilot-fleet/0.1.0',
            'Copilot-Integration-Id': 'vscode-chat',
          },
        );
        this.initialized = true;
        return;
      } catch {
        // Session token didn't work — fall through to GitHub Models
      }
    }

    // Fallback: GitHub Models API (works with PATs that have models access)
    try {
      await this.httpPost<CopilotResponse>(
        GITHUB_MODELS_URL,
        {
          model: mapToGitHubModelsName(this.config.defaultModel ?? COPILOT_MODELS[0]),
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          stream: false,
        },
        { Authorization: `Bearer ${this.config.apiKey}` },
      );
      this.useGitHubModels = true;
      this.initialized = true;
    } catch (err) {
      throw new Error(
        `GitHub Copilot: initialization failed.\n` +
        `• Copilot API: ${token ? 'session token invalid' : 'subscription not found or PAT lacks "copilot" scope'}.\n` +
        `• GitHub Models: ${err instanceof Error ? err.message : String(err)}\n` +
        `Create a Classic PAT with "copilot" scope, or ensure your account has GitHub Models access.`,
      );
    }
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    this.ensureInitialized();

    const effectiveModel = this.useGitHubModels ? mapToGitHubModelsName(request.model) : request.model;
    const reasoning = isReasoningModel(effectiveModel);

    const body: Record<string, unknown> = {
      model: effectiveModel,
      messages: this.buildMessages(request),
      temperature: reasoning ? undefined : request.temperature,
      ...(reasoning
        ? { max_completion_tokens: request.maxTokens }
        : { max_tokens: request.maxTokens }),
      tools: request.tools?.map((tool: LLMTool) => ({ type: 'function', function: tool })),
      stream: false,
    };

    let response: CopilotResponse;

    if (this.useGitHubModels) {
      response = await this.httpPost<CopilotResponse>(
        GITHUB_MODELS_URL,
        body,
        { Authorization: `Bearer ${this.config.apiKey}` },
      );
    } else {
      const token = await this.getSessionToken();
      response = await this.httpPost<CopilotResponse>(
        COPILOT_COMPLETIONS_URL,
        body,
        {
          Authorization: `Bearer ${token}`,
          'Editor-Version': 'vscode/1.96.0',
          'Editor-Plugin-Version': 'copilot-fleet/0.1.0',
          'Copilot-Integration-Id': 'vscode-chat',
        },
      );
    }

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

  private async tryGetSessionToken(): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timer = globalThis.setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await fetch(COPILOT_TOKEN_URL, {
          method: 'GET',
          headers: {
            Authorization: `token ${this.config.apiKey}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { token: string; expires_at: number };
        this.sessionToken = data.token;
        this.sessionTokenExpiresAt = data.expires_at;
        return data.token;
      } finally {
        globalThis.clearTimeout(timer);
      }
    } catch {
      return null;
    }
  }

  private async getSessionToken(): Promise<string> {
    if (this.sessionToken && this.sessionTokenExpiresAt > Date.now() / 1000 + 60) {
      return this.sessionToken;
    }
    const token = await this.tryGetSessionToken();
    if (!token) {
      throw new Error('Failed to refresh Copilot session token.');
    }
    return token;
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