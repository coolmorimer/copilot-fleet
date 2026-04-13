---
title: Connecting AI providers
version: 0.1.0
lastUpdated: 2026-04-13
status: draft
---

# Connecting AI providers

Review owners: platform maintainers

AI assistance: Drafted with GitHub Copilot, then checked against the current monorepo source.

This guide explains the provider layer in CopilotFleet, how to configure supported backends, and how to add a custom provider adapter.

Source of truth:
- [packages/shared/src/types.ts](../packages/shared/src/types.ts)
- [packages/shared/src/validation.ts](../packages/shared/src/validation.ts)
- [packages/providers/src/provider.interface.ts](../packages/providers/src/provider.interface.ts)
- [packages/providers/src/base-provider.ts](../packages/providers/src/base-provider.ts)
- [packages/providers/src/index.ts](../packages/providers/src/index.ts)
- [packages/cli/src/commands/providers.ts](../packages/cli/src/commands/providers.ts)
- [packages/web/src/components/SettingsModal.tsx](../packages/web/src/components/SettingsModal.tsx)
- [packages/web/src/panels/ProviderPanel.tsx](../packages/web/src/panels/ProviderPanel.tsx)

## Supported providers

| Type | Description | Requirements |
| --- | --- | --- |
| github-copilot | GitHub Copilot Cloud API | API token, active subscription |
| openai | OpenAI API (GPT models) | API key |
| anthropic | Anthropic API (Claude models) | API key |
| ollama | Local Ollama models | Ollama running at localhost:11434 |
| lmstudio | LM Studio local models | LM Studio running at localhost:1234 |
| custom-api | Any OpenAI-compatible API | Base URL + optional API key |
| vscode-local | VS Code local model inference | VS Code with extension |

## ProviderConfig interface

```ts
interface ProviderConfig {
  type: ProviderType;
  name: string;
  apiKey?: string;
  baseUrl?: string;
  models: string[];
  defaultModel?: string;
  maxTokens?: number;
  timeout?: number;
  headers?: Record<string, string>;
}
```

Practical notes:
- name is the runtime instance key inside ProviderRegistry.
- models must be a non-empty list.
- defaultModel, if set, must exist in models.
- timeout is in milliseconds.

## ProviderAdapter interface

Provider adapters implement the runtime contract used by the engine.

```ts
interface ProviderAdapter {
  readonly type: string;
  initialize(): Promise<void>;
  complete(request: LLMRequest): Promise<LLMResponse>;
  stream?(request: LLMRequest): AsyncIterable<string>;
  listModels(): Promise<string[]>;
  testConnection(): Promise<boolean>;
  dispose(): Promise<void>;
}
```

## Request and response shapes

### LLMRequest

```ts
interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  tools?: LLMTool[];
  stream?: boolean;
}
```

### LLMResponse

```ts
interface LLMResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: 'stop' | 'length' | 'tool_calls' | 'error';
  toolCalls?: LLMToolCall[];
}
```

## Configuration methods

CopilotFleet exposes four common configuration paths.

### 1. Config file

Example fleet.config.json entry:

```json
{
  "providers": {
    "my-openai": {
      "type": "openai",
      "apiKey": "${OPENAI_API_KEY}",
      "models": ["gpt-5", "gpt-5-mini"]
    }
  }
}
```

The core package loads and merges config files through createDefaultConfig, mergeConfig, loadConfigFromFile, and saveConfigToFile.

### 2. CLI

```bash
fleet providers add openai --key sk-...
fleet providers test ollama
```

Practical note: the current CLI command set supports:
- fleet providers list
- fleet providers add <type>
- fleet providers test <type>

The add command currently prompts for the API key interactively and stores provider data in .fleet/providers.json.

### 3. Web UI

The web UI exposes provider settings through Settings -> Providers. The ProviderPanel supports save, remove, and test flows, and the settings dialog keeps provider entries in a Zustand store.

The practical flow is Settings Modal -> Provider panel -> Connect or Test.

### 4. Environment variables

Common environment variables:
- GITHUB_COPILOT_API_KEY
- OPENAI_API_KEY
- ANTHROPIC_API_KEY
- OLLAMA_BASE_URL
- LMSTUDIO_BASE_URL
- CUSTOM_API_BASE_URL
- CUSTOM_API_KEY

CopilotFleet does not automatically resolve every environment variable in every package today. Use your host app or config loader to substitute them before creating ProviderConfig objects.

## ProviderRegistry API

ProviderRegistry manages provider factories and initialized instances.

| Method | What it does |
| --- | --- |
| register(type, factory) | Register a provider factory for a type |
| create(config) | Create and initialize a provider instance |
| get(name) | Return an initialized provider by instance name |
| getAll() | Return a map of initialized providers |
| dispose() | Dispose all initialized providers |

## Creating a custom provider

The simplest path is to extend BaseProvider.

BaseProvider already provides:
- initialize and dispose lifecycle defaults
- ensureInitialized guard
- httpPost and httpGet helpers
- buildMessages to prepend systemPrompt
- request timeout handling
- auth header injection for bearer tokens
- friendly error normalization and API key redaction

At minimum, implement:
- complete(request): Promise<LLMResponse>
- listModels(): Promise<string[]>

Example skeleton:

```ts
import type { LLMRequest, LLMResponse, ProviderConfig } from '@copilot-fleet/shared';
import { BaseProvider } from '@copilot-fleet/providers';

export class MyProvider extends BaseProvider {
  readonly type = 'custom-api';

  constructor(config: ProviderConfig) {
    super(config);
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    this.ensureInitialized();

    const response = await this.httpPost<{ content: string }>(
      `${this.config.baseUrl}/chat/completions`,
      {
        model: request.model,
        messages: this.buildMessages(request)
      }
    );

    return {
      content: response.content,
      model: request.model,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: 'stop'
    };
  }

  async listModels(): Promise<string[]> {
    this.ensureInitialized();
    return ['my-model'];
  }
}
```

Then register it:

```ts
import { ProviderRegistry } from '@copilot-fleet/providers';

const registry = new ProviderRegistry();
registry.register('my-provider', (config) => new MyProvider(config));
```

## Validation rules

validateProviderConfig checks:
- type is one of the supported provider types
- name is non-empty
- apiKey and baseUrl are strings when provided
- models is a non-empty string array
- maxTokens and timeout are positive numbers when provided
- headers is a string-to-string record when provided
- defaultModel exists in models when provided

## Security note

API keys should be stored via VS Code SecretStorage or encrypted config. Never commit keys to source control.

Also keep these practical constraints in mind:
- browser localStorage is convenient but not hardened secret storage
- provider error messages should not echo raw credentials
- custom providers should redact secrets in logs and HTTP errors
- local providers such as Ollama and LM Studio still need trust boundaries and host-level access controls

## Related docs

- [creating-agents.md](./creating-agents.md)
- [api-reference.md](./api-reference.md)
