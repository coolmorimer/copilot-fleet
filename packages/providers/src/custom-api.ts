import { OpenAIProvider } from './openai.js';

export class CustomAPIProvider extends OpenAIProvider {
  readonly type: string = 'custom-api';

  protected override getBaseUrl(): string {
    const baseUrl = this.config.baseUrl?.replace(/\/+$/, '');
    if (!baseUrl) {
      throw new Error('Custom API provider requires a base URL.');
    }

    return baseUrl;
  }

  protected override getHeaders(): Record<string, string> {
    return { ...(this.config.headers ?? {}) };
  }
}