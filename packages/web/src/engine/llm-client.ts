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
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal,
    });
  } catch (networkErr) {
    // Distinguish CORS / network failures from other errors
    const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('CORS')) {
      throw new Error(
        `Сетевая ошибка при запросе к ${url}. ` +
        `Убедитесь, что web-приложение запущено через "pnpm dev" (Vite dev server с proxy). ` +
        `В режиме preview/production прямые API-вызовы блокируются CORS.`,
      );
    }
    throw networkErr;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Ошибка авторизации (${res.status}): проверьте API-ключ. ${text}`);
    }
    if (res.status === 404) {
      throw new Error(`Endpoint не найден (404): ${url}. Проверьте, что Vite dev proxy работает.`);
    }
    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after') ?? res.headers.get('x-ratelimit-reset-requests') ?? '';
      throw new Error(`Лимит запросов превышен (429).${retryAfter ? ` Retry-After: ${retryAfter}s.` : ''} Подождите и попробуйте снова.`);
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
    temperature: isReasoningModel(req.model) ? undefined : (req.temperature ?? 0.3),
    ...buildTokensParam(req.model, req.maxTokens),
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

/**
 * Tracks whether the internal token exchange has already failed for
 * this session, so we skip straight to the GitHub Models fallback.
 */
let copilotTokenExchangeBlocked = false;

async function getCopilotSessionToken(githubPAT: string): Promise<string | null> {
  if (copilotTokenExchangeBlocked) return null;

  // Return cached token if still valid (with 60s buffer)
  if (copilotTokenCache && copilotTokenCache.expiresAt > Date.now() / 1000 + 60) {
    return copilotTokenCache.token;
  }

  try {
    const res = await fetch('/api/proxy/github-api/copilot_internal/v2/token', {
      method: 'GET',
      headers: {
        Authorization: `token ${githubPAT}`,
        Accept: 'application/json',
      },
    });

    if (res.ok) {
      const data = (await res.json()) as { token: string; expires_at: number };
      copilotTokenCache = { token: data.token, expiresAt: data.expires_at };
      return data.token;
    }

    // 404 means no Copilot subscription or wrong token type — mark blocked
    // so subsequent calls go straight to GitHub Models fallback.
    if (res.status === 404 || res.status === 422) {
      copilotTokenExchangeBlocked = true;
      return null;
    }

    if (res.status === 401 || res.status === 403) {
      // Token is invalid for Copilot but may still work with GitHub Models
      copilotTokenExchangeBlocked = true;
      return null;
    }

    copilotTokenExchangeBlocked = true;
    return null;
  } catch {
    // Network error — fall through to GitHub Models
    copilotTokenExchangeBlocked = true;
    return null;
  }
}

async function githubCopilotComplete(req: CompletionRequest): Promise<LLMResponse> {
  const githubPAT = req.provider.apiKey;
  if (!githubPAT) throw new Error('GitHub Copilot: GitHub PAT не указан');

  // Try the internal Copilot token exchange first
  const sessionToken = await getCopilotSessionToken(githubPAT);

  const body: Record<string, unknown> = {
    model: req.model,
    messages: buildMessages(req.systemPrompt, req.messages).map((m) => ({ role: m.role, content: m.content })),
    temperature: isReasoningModel(req.model) ? undefined : (req.temperature ?? 0.3),
    ...buildTokensParam(req.model, req.maxTokens),
    stream: false,
  };

  // Path A: Classic Copilot API (requires Copilot subscription + copilot scope)
  if (sessionToken) {
    const data = (await post('/api/proxy/github-copilot/chat/completions', body, {
      Authorization: `Bearer ${sessionToken}`,
      'Editor-Version': 'vscode/1.96.0',
      'Editor-Plugin-Version': 'copilot-fleet/0.1.0',
      'Openai-Intent': 'conversation-panel',
      'Copilot-Integration-Id': 'vscode-chat',
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

  // Path B: GitHub Models API (works with any GitHub PAT that has models access)
  // GitHub Models uses different model identifiers than Copilot
  const mappedModel = mapToGitHubModelsName(req.model);
  body.model = mappedModel;
  // Reasoning models need max_completion_tokens instead of max_tokens
  if (isReasoningModel(mappedModel)) {
    body.max_completion_tokens = body.max_tokens ?? body.max_completion_tokens;
    delete body.max_tokens;
    delete body.temperature;
  }
  try {
    const data = (await post('/api/proxy/github-models/chat/completions', body, {
      Authorization: `Bearer ${githubPAT}`,
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
  } catch (modelsError) {
    throw new Error(
      `GitHub Copilot: не удалось подключиться.\n` +
      `• Copilot API: подписка не найдена или PAT без scope "copilot".\n` +
      `• GitHub Models: ${modelsError instanceof Error ? modelsError.message : String(modelsError)}\n` +
      `Убедитесь, что у вас есть подписка Copilot или доступ к GitHub Models, ` +
      `и PAT создан как Classic Token с нужными scopes.`,
    );
  }
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

/** Map Copilot model names to GitHub Models compatible identifiers. */
function mapToGitHubModelsName(model: string): string {
  const MAP: Record<string, string> = {
    'claude-sonnet-4': 'gpt-4o',
    'claude-3-7-sonnet': 'gpt-4o',
    'claude-3-5-haiku': 'gpt-4o-mini',
  };
  return MAP[model] ?? model;
}

/** Reasoning models (o1, o3, etc.) use max_completion_tokens instead of max_tokens. */
function isReasoningModel(model: string): boolean {
  return /^o[0-9]/.test(model);
}

/** Build the tokens parameter appropriate for the model. */
function buildTokensParam(model: string, maxTokens: number | undefined): Record<string, unknown> {
  const limit = maxTokens ?? 4096;
  if (isReasoningModel(model)) {
    return { max_completion_tokens: limit };
  }
  return { max_tokens: limit };
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
