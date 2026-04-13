---
title: CopilotFleet architecture overview
version: 0.1.0
lastUpdated: 2026-04-13
status: draft
aiAssisted: true
reviewOwners:
  - maintainers
---

# CopilotFleet architecture overview

CopilotFleet is an eight-package TypeScript monorepo. The shared graph contract sits at the center, while execution, providers, agents, CLI, MCP, web, and VS Code integrations stay in separate packages.

## Monorepo structure

| Package | Purpose | Depends on |
| --- | --- | --- |
| `@copilot-fleet/shared` | Types, constants, validation, and serialization. | Standalone |
| `@copilot-fleet/core` | Engine, scheduler, dispatcher, graph traversal, events, monitor, and session state. | `@copilot-fleet/shared` |
| `@copilot-fleet/providers` | Seven provider adapters and a registry/factory layer. | `@copilot-fleet/shared`, `@copilot-fleet/core` |
| `@copilot-fleet/agents` | Agent registry, ten builtin agents, and custom YAML/JSON loading. | `@copilot-fleet/shared` |
| `@copilot-fleet/web` | React 19 UI with React Flow 12, Zustand 5, Radix UI, and Tailwind CSS. | `@copilot-fleet/shared` |
| `copilot-fleet` VS Code extension | Chat participant, sidebar/webview, and command surface built with esbuild. | `@copilot-fleet/shared`, `@copilot-fleet/core`, `@copilot-fleet/agents` |
| `@copilot-fleet/cli` | Commander-based CLI with run, serve, status, abort, agents, providers, templates, interactive, and history commands. | `@copilot-fleet/shared`, `@copilot-fleet/core`, `@copilot-fleet/agents`, `@copilot-fleet/providers` |
| `@copilot-fleet/mcp-server` | MCP server over stdio using `@modelcontextprotocol/sdk`. | `@copilot-fleet/shared`, `@copilot-fleet/core`, `@copilot-fleet/agents`, `@copilot-fleet/providers` |

## Dependency graph

```text
@copilot-fleet/shared
    ├── @copilot-fleet/core
    │   ├── @copilot-fleet/cli
    │   ├── copilot-fleet (VS Code extension)
    │   └── @copilot-fleet/mcp-server
    ├── @copilot-fleet/agents
    │   ├── @copilot-fleet/cli
    │   ├── copilot-fleet (VS Code extension)
    │   └── @copilot-fleet/mcp-server
    ├── @copilot-fleet/providers
    │   ├── @copilot-fleet/cli
    │   └── @copilot-fleet/mcp-server
    └── @copilot-fleet/web
```

## DAG execution model

Execution is graph-first.

1. A client supplies a `FleetGraph`.
2. `FleetEngine.createSession()` creates a `SessionState` wrapper around the graph and runtime config.
3. `computeWaves()` performs a DAG traversal and groups nodes into topological waves.
4. `Scheduler` runs nodes in parallel within each wave, bounded by `maxConcurrency`.
5. `Dispatcher` routes each node request to the selected `ProviderAdapter`.
6. Results and failures are written back into session state and emitted as events.

This model gives deterministic dependency ordering and bounded parallelism without requiring a central workflow DSL beyond the graph schema.

## Data flow

```text
User graph (Web/CLI/MCP)
      ↓
FleetEngine.createSession() → SessionState
      ↓
computeWaves() → [[wave1 nodes], [wave2 nodes], ...]
      ↓
Scheduler → parallel execution within wave (maxConcurrency)
      ↓
Dispatcher → ProviderAdapter.complete(LLMRequest) → LLMResponse
      ↓
SessionState tracks progress → FleetEventEmitter broadcasts
      ↓
UI/CLI updates in real time
```

## Event system

The event bus is `FleetEventEmitter`. Core lifecycle events include:

- `session:start`
- `session:complete`
- `session:error`
- `session:abort`
- `wave:start`
- `wave:complete`
- `node:queued`
- `node:start`
- `node:progress`
- `node:complete`
- `node:error`
- `node:skipped`
- `log`

Consumers can subscribe from the engine and update a terminal UI, web panel, status bar, or MCP client in real time.

## Provider abstraction

Providers implement the `ProviderAdapter` interface from core:

- `initialize()`
- `complete(request)`
- `stream?(request)`
- `listModels()`
- `testConnection()`
- `dispose()`

`BaseProvider` supplies common HTTP handling, timeout management, response parsing, and friendly error normalization. `ProviderRegistry` acts as a factory and instance cache.

Current adapter set:

- GitHub Copilot
- OpenAI
- Anthropic
- Ollama
- LM Studio
- Custom API
- VS Code Local

## Agent system

Agents are plain `AgentDefinition` objects.

`AgentRegistry` provides:

- builtin registration via `loadBuiltins()`
- lookup by id
- search over names, descriptions, and labels
- separation of builtin and custom agents

Builtin set: coder, reviewer, tester, refactorer, documenter, security, designer, devops, researcher, planner.

Custom agents are loaded from YAML or JSON files and are typically stored under `.fleet/agents/` for CLI-driven workflows.

## Graph schema

A `FleetGraph` contains nodes, edges, and optional metadata.

- Nodes: 10 supported node types
- Edges: directed connections with source and target ports
- Ports: explicit input/output endpoints with optional `dataType`

Validation rules enforced in shared:

- no duplicate node ids
- no duplicate edge ids
- no duplicate port ids within a node
- edge source and target must reference existing nodes
- edge ports must exist and match output → input direction
- no cycles
- maximum 50 nodes
- maximum 100 edges

## Integration surfaces

- CLI exposes operational workflows for local runs, templates, agents, providers, and history.
- MCP exposes the orchestration surface to any MCP-capable host.
- Web provides graph editing, onboarding, status, and node inspection.
- VS Code adds a chat participant, graph panel, sidebar, and editor commands.

## Validation

Use the workspace scripts to verify package boundaries and type contracts:

```bash
pnpm build
pnpm typecheck
```
