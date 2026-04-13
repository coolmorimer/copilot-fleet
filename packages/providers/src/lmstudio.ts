import { OpenAIProvider } from './openai.js';

export class LMStudioProvider extends OpenAIProvider {
  readonly type: string = 'lmstudio';

  protected override getBaseUrl(): string {
    return (this.config.baseUrl ?? 'http://localhost:1234').replace(/\/+$/, '');
  }

  protected override getHeaders(): Record<string, string> {
    return { ...(this.config.headers ?? {}) };
  }
}