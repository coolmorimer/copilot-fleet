import type { LLMRequest, LLMResponse } from '@copilot-fleet/shared';

import { BaseProvider } from './base-provider.js';

export class VSCodeLocalProvider extends BaseProvider {
  readonly type = 'vscode-local';

  async complete(request: LLMRequest): Promise<LLMResponse> {
    this.ensureInitialized();

    return {
      content: 'VSCode local provider requires VS Code extension.',
      model: request.model,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      finishReason: 'error',
    };
  }

  async listModels(): Promise<string[]> {
    this.ensureInitialized();
    return ['vscode-default'];
  }

  async testConnection(): Promise<boolean> {
    return false;
  }
}