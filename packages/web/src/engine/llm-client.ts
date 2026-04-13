/**
 * Browser-native LLM client.
 *
 * Makes real HTTP calls to LLM provider APIs directly from the browser
 * using the Fetch API. Supports OpenAI, Anthropic, GitHub Copilot,
 * Ollama, LM Studio, and Custom API endpoints.
 */
import type { LLMMessage, LLMResponse, ProviderConfig, ProviderType } from '@copilot-fleet/shared';

/* ── Public API ───────────────────────────────────────── */

export interface CompletionRequest {
  provider: ProviderConfig;
  model: string;
  messages: LLMMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

/**
 * Send a real LLM completion request through the given provider.
 * Returns the parsed LLMResponse.
 */
export async function complete(req: CompletionRequest): Promise<LLMResponse> {
  const handler = HANDLERS[req.provider.type];
  if (!handler) {
    throw new Error(`Unsupported provider type: ${req.provider.type}`);
  }
  return handler(req);
}

/**
 * Test whether a provider configuration is valid by sending a minimal request.
 */
export async function testConnection(provider: ProviderConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const model = provider.defaultModel ?? provider.models[0] ?? 'gpt-4o-mini';
    await complete({
      provider,
      model,
      messages: [{ role: 'user', content: 'Reply with the single word "ok".' }],
      maxTokens: 5,
      temperature: 0,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/* ── Helpers ──────────────────────────────────────────── */

function buildMessages(systemPrompt: string | undefined, messages: LLMMessage[]): LLMMessage[] {
  if (!systemPrompt) return messages;
  return [{ role: 'system', content: systemPrompt }, ...messages.filter((m) => m.role !== 'system')];
}

async function post(url: string, body: unknown, headers: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Ошибка авторизации (${res.status}): проверьте API-ключ. ${text}`);
    }
    if (res.status === 404) {
      throw new Error(`Endpoint не найден (404): ${url}`);
    }
    if (res.status === 429) {
      throw new Error(`Лимит запросов превышен (429). Подождите и попробуйте снова.`);
    }
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }

  return res.json();
}

function fallbackResponse(content: string, model: string): LLMResponse {
  return {
    content,
    model,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    finishReason: 'stop',
  };
}

/* ── Provider handlers ────────────────────────────────── */

type Handler = (req: CompletionRequest) => Promise<LLMResponse>;

const HANDLERS: Record<ProviderType, Handler> = {
  'openai': openaiComplete,
  'github-copilot': githubCopilotComplete,
  'anthropic': anthropicComplete,
  'ollama': ollamaComplete,
  'lmstudio': lmstudioComplete,
  'custom-api': customApiComplete,
  'vscode-local': vsCodeLocalComplete,
};

/* ── OpenAI ───────────────────────────────────────────── */

async function openaiComplete(req: CompletionRequest): Promise<LLMResponse> {
  const apiKey = req.provider.apiKey;
  if (!apiKey) throw new Error('OpenAI: API-ключ не указан');

  // Use Vite proxy for standard OpenAI; custom baseUrl goes through custom-api handler
  const url = (req.provider as { _proxyUrl?: string })._proxyUrl
    ?? '/api/proxy/openai/v1/chat/completions';

  const body = {
    model: req.model,
    messages: buildMessages(req.systemPrompt, req.messages).map((m) => ({ role: m.role, content: m.content })),
    temperature: req.temperature ?? 0.3,
    max_tokens: req.maxTokens ?? 4096,
    stream: false,
  };

  const data = (await post(url, body, {
    Authorization: `Bearer ${apiKey}`,
    ...req.provider.headers,
  }, req.signal)) as OpenAIChatResponse;

  const choice = data.choices?.[0];
  return {
    content: choice?.message?.content ?? '',
    model: data.model ?? req.model,
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
    },
    finishReason: mapOpenAIFinishReason(choice?.finish_reason),
    toolCalls: choice?.message?.tool_calls?.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: safeParse(tc.function.arguments),
    })),
  };
}

/* ── GitHub Copilot ───────────────────────────────────── */

/**
 * Cached Copilot session token. The token is obtained by exchanging
 * the user's GitHub PAT through the internal Copilot token endpoint.
 */
let copilotTokenCache: { token: string; expiresAt: number } | null = null;

async function getCopilotSessionToken(githubPAT: string): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (copilotTokenCache && copilotTokenCache.expiresAt > Date.now() / 1000 + 60) {
    return copilotTokenCache.token;
  }

  const res = await fetch('/api/proxy/github-api/copilot_internal/v2/token', {
    method: 'GET',
    headers: {
      Authorization: `token ${githubPAT}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `GitHub Copilot: токен не имеет доступа к Copilot. ` +
        `Убедитесь, что PAT имеет scope "copilot" и подписка Copilot активна. (${res.status}) ${text}`,
      );
    }
    throw new Error(`GitHub Copilot: ошибка получения сессионного токена (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { token: string; expires_at: number };
  copilotTokenCache = { token: data.token, expiresAt: data.expires_at };
  return data.token;
}

async function githubCopilotComplete(req: CompletionRequest): Promise<LLMResponse> {
  const githubPAT = req.provider.apiKey;
  if (!githubPAT) throw new Error('GitHub Copilot: GitHub PAT не указан');

  // Exchange PAT for Copilot session token
  const sessionToken = await getCopilotSessionToken(githubPAT);

  const body = {
    model: req.model,
    messages: buildMessages(req.systemPrompt, req.messages).map((m) => ({ role: m.role, content: m.content })),
    temperature: req.temperature ?? 0.3,
    max_tokens: req.maxTokens ?? 4096,
    stream: false,
  };

  const data = (await post('/api/proxy/github-copilot/chat/completions', body, {
    Authorization: `Bearer ${sessionToken}`,
    'Editor-Version': 'copilot-fleet/0.1.0',
    'Openai-Intent': 'conversation-panel',
    'Copilot-Integration-Id': 'copilot-fleet',
  }, req.signal)) as OpenAIChatResponse;

  const choice = data.choices?.[0];
  return {
    content: choice?.message?.content ?? '',
    model: data.model ?? req.model,
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
    },
    finishReason: mapOpenAIFinishReason(choice?.finish_reason),
  };
}

/* ── Anthropic ────────────────────────────────────────── */

async function anthropicComplete(req: CompletionRequest): Promise<LLMResponse> {
  const apiKey = req.provider.apiKey;
  if (!apiKey) throw new Error('Anthropic: API-ключ не указан');

  const messages = req.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' as const : 'user' as const, content: m.content }));

  const body: Record<string, unknown> = {
    model: req.model,
    messages,
    max_tokens: req.maxTokens ?? 4096,
    temperature: req.temperature ?? 0.3,
  };
  if (req.systemPrompt) {
    body.system = req.systemPrompt;
  }

  const data = (await post('/api/proxy/anthropic/v1/messages', body, {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    ...req.provider.headers,
  }, req.signal)) as AnthropicResponse;

  const textBlocks = (data.content ?? []).filter((b) => b.type === 'text');
  const content = textBlocks.map((b) => b.text).join('');

  return {
    content,
    model: data.model ?? req.model,
    usage: {
      promptTokens: data.usage?.input_tokens ?? 0,
      completionTokens: data.usage?.output_tokens ?? 0,
      totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
    },
    finishReason: data.stop_reason === 'max_tokens' ? 'length' : 'stop',
  };
}

/* ── Ollama ────────────────────────────────────────────── */

async function ollamaComplete(req: CompletionRequest): Promise<LLMResponse> {
  // Route through Vite proxy; custom baseUrl bypasses proxy
  const isCustomBase = req.provider.baseUrl && !req.provider.baseUrl.includes('localhost:11434');
  const url = isCustomBase
    ? `${req.provider.baseUrl!.replace(/\/+$/, '')}/api/chat`
    : '/api/proxy/ollama/api/chat';

  const messages = buildMessages(req.systemPrompt, req.messages).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const body = {
    model: req.model,
    messages,
    stream: false,
    options: {
      temperature: req.temperature ?? 0.3,
      num_predict: req.maxTokens ?? 4096,
    },
  };

  const data = (await post(url, body, req.provider.headers ?? {}, req.signal)) as OllamaResponse;

  return {
    content: data.message?.content ?? '',
    model: data.model ?? req.model,
    usage: {
      promptTokens: data.prompt_eval_count ?? 0,
      completionTokens: data.eval_count ?? 0,
      totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
    },
    finishReason: data.done_reason === 'length' ? 'length' : 'stop',
  };
}

/* ── LM Studio (OpenAI-compatible) ────────────────────── */

async function lmstudioComplete(req: CompletionRequest): Promise<LLMResponse> {
  const isCustomBase = req.provider.baseUrl && !req.provider.baseUrl.includes('localhost:1234');
  const proxyUrl = isCustomBase
    ? `${req.provider.baseUrl!.replace(/\/+$/, '')}/v1/chat/completions`
    : '/api/proxy/lmstudio/v1/chat/completions';

  const modified: CompletionRequest = {
    ...req,
    provider: {
      ...req.provider,
      type: 'openai',
      apiKey: req.provider.apiKey ?? 'lm-studio',
      _proxyUrl: proxyUrl,
    } as ProviderConfig & { _proxyUrl: string },
  };
  return openaiComplete(modified);
}

/* ── Custom API (OpenAI-compatible) ───────────────────── */

async function customApiComplete(req: CompletionRequest): Promise<LLMResponse> {
  if (!req.provider.baseUrl) throw new Error('Custom API: base URL не указан');
  const baseUrl = req.provider.baseUrl.replace(/\/+$/, '');
  const modified: CompletionRequest = {
    ...req,
    provider: {
      ...req.provider,
      type: 'openai',
      _proxyUrl: `${baseUrl}/v1/chat/completions`,
    } as ProviderConfig & { _proxyUrl: string },
  };
  return openaiComplete(modified);
}

/* ── VS Code Local (placeholder) ──────────────────────── */

async function vsCodeLocalComplete(req: CompletionRequest): Promise<LLMResponse> {
  return fallbackResponse(
    'VS Code Local provider доступен только из расширения VS Code.',
    req.model,
  );
}

/* ── OpenAI response types ────────────────────────────── */

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: Array<{
        id: string;
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason?: string;
  }>;
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

interface AnthropicResponse {
  content?: Array<{ type: string; text: string }>;
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason?: string;
}

interface OllamaResponse {
  message?: { content: string };
  model?: string;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

function mapOpenAIFinishReason(reason?: string): LLMResponse['finishReason'] {
  if (reason === 'tool_calls' || reason === 'function_call') return 'tool_calls';
  if (reason === 'length') return 'length';
  return 'stop';
}

function safeParse(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return { raw: json };
  }
}
