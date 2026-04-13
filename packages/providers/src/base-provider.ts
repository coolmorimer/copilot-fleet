import type { ProviderAdapter } from '@copilot-fleet/core';
import type { LLMMessage, LLMRequest, LLMResponse, ProviderConfig } from '@copilot-fleet/shared';

const DEFAULT_TIMEOUT_MS = 30_000;

type ErrorPayload = {
  error?: {
    message?: string;
  };
  message?: string;
};

export abstract class BaseProvider implements ProviderAdapter {
  abstract readonly type: string;

  protected config: ProviderConfig;
  protected initialized: boolean;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.initialized = false;
  }

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  abstract complete(request: LLMRequest): Promise<LLMResponse>;

  abstract listModels(): Promise<string[]>;

  async testConnection(): Promise<boolean> {
    try {
      await this.listModels();
      return true;
    } catch {
      return false;
    }
  }

  async dispose(): Promise<void> {
    this.initialized = false;
  }

  protected buildMessages(request: LLMRequest): LLMMessage[] {
    const messages = [...request.messages];
    if (!request.systemPrompt) {
      return messages;
    }

    return [{ role: 'system', content: request.systemPrompt }, ...messages];
  }

  protected async httpPost<T>(url: string, body: unknown, headers?: Record<string, string>): Promise<T> {
    return this.httpRequest<T>('POST', url, body, headers);
  }

  protected async httpGet<T>(url: string, headers?: Record<string, string>): Promise<T> {
    return this.httpRequest<T>('GET', url, undefined, headers);
  }

  protected ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(`${this.type} provider is not initialized.`);
    }
  }

  private async httpRequest<T>(
    method: 'GET' | 'POST',
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = this.config.timeout ?? DEFAULT_TIMEOUT_MS;
    const timer = globalThis.setTimeout(() => controller.abort(), timeout);
    const mergedHeaders = this.buildHeaders(headers, body !== undefined);

    try {
      const response = await fetch(url, {
        method,
        headers: mergedHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(await this.toFriendlyHttpError(response));
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('application/json')) {
        throw new Error('Provider returned an unexpected response format.');
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('The provider request timed out. Check the provider endpoint and timeout settings.');
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error('Unable to reach the provider. Check the network connection and provider configuration.');
    } finally {
      globalThis.clearTimeout(timer);
    }
  }

  private buildHeaders(headers: Record<string, string> | undefined, includeContentType: boolean): Record<string, string> {
    const mergedHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...(includeContentType ? { 'Content-Type': 'application/json' } : {}),
      ...(headers ?? {}),
    };

    const lowerCaseHeaders = new Set(Object.keys(mergedHeaders).map((key) => key.toLowerCase()));
    if (this.config.apiKey && !lowerCaseHeaders.has('authorization') && !lowerCaseHeaders.has('x-api-key')) {
      mergedHeaders.Authorization = `Bearer ${this.config.apiKey}`;
    }

    return mergedHeaders;
  }

  private async toFriendlyHttpError(response: Response): Promise<string> {
    if (response.status === 401 || response.status === 403) {
      return 'Authentication failed. Check the provider credentials.';
    }

    if (response.status === 404) {
      return 'Provider endpoint was not found. Check the base URL configuration.';
    }

    const payload = await this.readErrorPayload(response);
    const message = payload?.error?.message ?? payload?.message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return this.sanitizeErrorMessage(message);
    }

    return `Provider request failed with status ${response.status}.`;
  }

  private async readErrorPayload(response: Response): Promise<ErrorPayload | null> {
    try {
      return (await response.json()) as ErrorPayload;
    } catch {
      return null;
    }
  }

  private sanitizeErrorMessage(message: string): string {
    const normalized = message.trim();
    if (!this.config.apiKey) {
      return normalized;
    }

    return normalized.replaceAll(this.config.apiKey, '[REDACTED]');
  }
}