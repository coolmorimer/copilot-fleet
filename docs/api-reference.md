---
title: API reference
version: 0.1.0
lastUpdated: 2026-04-13
status: draft
---

# API reference

Review owners: platform maintainers

AI assistance: Drafted with GitHub Copilot, then checked against the current monorepo source.

This reference summarizes the public surface currently visible in the monorepo packages. It focuses on types, classes, helpers, CLI commands, MCP tools, and the main web state containers.

Source of truth:
- [packages/shared/src/index.ts](../packages/shared/src/index.ts)
- [packages/core/src/index.ts](../packages/core/src/index.ts)
- [packages/providers/src/index.ts](../packages/providers/src/index.ts)
- [packages/agents/src/index.ts](../packages/agents/src/index.ts)
- [packages/cli/src/index.ts](../packages/cli/src/index.ts)
- [packages/mcp/src/index.ts](../packages/mcp/src/index.ts)
- [packages/web/src/store](../packages/web/src/store)

## @copilot-fleet/shared

### Types

- NodeType: trigger | agent | llm | splitter | merger | condition | human | tool | output | group
- NodeStatus: idle | queued | running | done | error | skipped | cancelled
- SessionStatus: idle | running | paused | completed | failed | aborted
- ProviderType: github-copilot | openai | anthropic | ollama | lmstudio | custom-api | vscode-local
- Preset: solo | squad | platoon | fleet

### Interfaces

- FleetGraph
- FleetNode
- FleetEdge
- FleetPort
- FleetSession
- SessionConfig
- ProviderConfig
- LLMRequest
- LLMResponse
- AgentDefinition
- AgentParameters
- FleetEvent

Selected shapes:

```ts
interface SessionConfig {
  repo?: string;
  branch?: string;
  preset: Preset;
  maxConcurrency: number;
  timeout: number;
  dryRun: boolean;
  locale: 'en' | 'ru';
}

interface FleetEvent {
  type: FleetEventType;
  sessionId: string;
  timestamp: string;
  data: Record<string, unknown>;
}
```

### Constants

- VERSION = '0.1.0'
- NODE_COLORS
- DEFAULT_SESSION_CONFIG
- PRESET_AGENTS = { solo: 1, squad: 3, platoon: 6, fleet: 10 }
- MAX_NODES = 50
- MAX_EDGES = 100
- DEFAULT_AGENT_PARAMETERS

### Validation

```ts
validateGraph(graph): ValidationResult
validateSessionConfig(config): ValidationResult
validateProviderConfig(config): ValidationResult
validateAgentDefinition(definition): ValidationResult
```

ValidationResult:

```ts
type ValidationResult = {
  valid: boolean;
  errors: string[];
};
```

### Serialization

```ts
serializeGraph(graph): string
deserializeGraph(json): FleetGraph
serializeSession(session): string
deserializeSession(json): FleetSession
```

## @copilot-fleet/core

### FleetEngine

Main orchestration runtime.

```ts
class FleetEngine {
  registerProvider(name: string, provider: ProviderAdapter): void;
  createSession(options: OrchestratorOptions): FleetSession;
  run(sessionId: string): Promise<FleetSession>;
  abort(sessionId: string): void;
  getSession(sessionId: string): FleetSession | undefined;
  on(type: FleetEventType | '*', listener: (event: FleetEvent) => void): () => void;
  dispose(): Promise<void>;
}
```

Practical note: the user-facing plan mentions pause(sessionId), but the current implementation exposes abort, not pause.

### Graph helpers

```ts
buildAdjacencyList(graph): Map<string, string[]>
topologicalSort(graph): string[]
detectCycles(graph): string[]
computeWaves(graph): string[][]
getPredecessors(graph, nodeId): string[]
```

Also available in the current code:
- getSuccessors
- isValidDAG
- getRootNodes
- getLeafNodes

### Scheduler

```ts
class Scheduler<T = unknown> {
  constructor(options: SchedulerOptions, events: FleetEventEmitter);
  addTasks(tasks: SchedulerTask<T>[]): void;
  execute(): Promise<Map<string, SchedulerResult<T>>>;
  abort(): void;
  getStatus(): { queued: number; running: number; completed: number; failed: number };
}
```

### Dispatcher

```ts
class Dispatcher {
  dispatch(target: DispatcherTarget): Promise<LLMResponse>;
  dispatchBatch(targets: DispatcherTarget[]): Promise<Map<string, LLMResponse>>;
}
```

### SessionState

```ts
class SessionState {
  constructor(session: FleetSession, events: FleetEventEmitter);
  getSession(): Readonly<FleetSession>;
  getStatus(): SessionStatus;
  updateSessionStatus(status: SessionStatus): void;
  updateNodeStatus(nodeId: string, status: NodeStatus, progress?: number): void;
  setNodeResult(nodeId: string, result: NodeResult): void;
  addError(error: SessionError): void;
  advanceWave(): void;
}
```

Practical note: the code exposes setNodeResult, not updateNodeResult.

### FleetEventEmitter

```ts
class FleetEventEmitter {
  on(type: FleetEventType | '*', listener: (event: FleetEvent) => void): () => void;
  off(type: FleetEventType | '*', listener: (event: FleetEvent) => void): void;
  emit(event: FleetEvent): void;
  removeAllListeners(): void;
}
```

Event types in active use:
- session:start
- session:complete
- session:error
- session:abort
- wave:start
- wave:complete
- node:queued
- node:start
- node:progress
- node:complete
- node:error
- node:skipped
- log

### Config helpers

```ts
createDefaultConfig(): FleetConfig
mergeConfig(base, overrides): FleetConfig
loadConfigFromFile(path): Promise<FleetConfig>
saveConfigToFile(config, path): Promise<void>
```

## @copilot-fleet/providers

### ProviderAdapter

The providers package re-exports the ProviderAdapter contract from core.

Methods:
- initialize()
- complete(request)
- stream?(request)
- listModels()
- testConnection()
- dispose()

### BaseProvider

Abstract base class for HTTP-backed adapters.

Key responsibilities:
- lifecycle defaults
- ensureInitialized
- buildMessages
- httpPost and httpGet
- timeout handling
- auth header injection
- API key redaction in friendly HTTP errors

### ProviderRegistry

```ts
class ProviderRegistry {
  register(type: string, factory: ProviderFactory): void;
  create(config: ProviderConfig): Promise<ProviderAdapter>;
  get(name: string): ProviderAdapter | undefined;
  getAll(): Map<string, ProviderAdapter>;
  dispose(): Promise<void>;
}
```

### Concrete providers

- GitHubCopilotProvider
- OpenAIProvider
- AnthropicProvider
- OllamaProvider
- LMStudioProvider
- CustomAPIProvider
- VSCodeLocalProvider

## @copilot-fleet/agents

### AgentRegistry

```ts
class AgentRegistry {
  register(agent: AgentDefinition): void;
  unregister(id: string): boolean;
  get(id: string): AgentDefinition | undefined;
  getAll(): AgentDefinition[];
  getBuiltins(): AgentDefinition[];
  getCustom(): AgentDefinition[];
  has(id: string): boolean;
  count(): number;
  loadBuiltins(): void;
  search(query: string): AgentDefinition[];
}
```

### Agent instance helpers

```ts
createAgentInstance(definition): AgentInstance
```

AgentInstance methods:
- getSystemPrompt()
- getParameters()
- toJSON()

### Custom loader

Current exports for YAML and JSON loading:

```ts
parseAgentYAML(content): Partial<AgentDefinition>
validateAgentDefinition(def): { valid: boolean; errors: string[] }
loadAgentFromString(content, format): AgentDefinition
discoverAgentFiles(directory): Promise<string[]>
```

Practical note: the repository currently exports discoverAgentFiles and loadAgentFromString. The higher-level name loadCustomAgents(directory) is a reasonable conceptual alias, but it is not the current exported function.

## @copilot-fleet/cli

The CLI entrypoint registers these top-level commands.

### fleet run [task...]

Description: Run orchestration for a repository task.

Options:
- --repo <owner/repo>
- --task <description>
- --preset <preset>
- --agents <count>
- --template <name>
- --dry-run
- --timeout <minutes>
- --concurrency <n>

### fleet serve

Description: Start the placeholder web panel server.

Options:
- --port <port>
- --open
- --host <host>

### fleet status

Description: Show current session status.

### fleet abort

Description: Abort the current or specified session.

Options:
- --session <id>

### fleet agents list

Description: List all agents.

### fleet agents add <path>

Description: Add a custom agent from YAML or JSON.

### fleet agents remove <id>

Description: Remove a custom agent.

### fleet agents info <id>

Description: Show agent details.

### fleet providers list

Description: List configured providers.

### fleet providers add <type>

Description: Add a provider and prompt for API key.

### fleet providers test <type>

Description: Test provider connection.

### fleet templates list

Description: List available templates.

### fleet templates use <name>

Description: Save a template as .fleet/selected-template.json.

### fleet templates info <name>

Description: Show template details.

### fleet interactive

Description: Enter interactive TUI mode.

### fleet history

Description: Show session history.

## @copilot-fleet/mcp-server

### Tools

#### launch_fleet

Input schema:

```json
{
  "task": "string",
  "repo": "string?",
  "agents": "number? (1-10)",
  "preset": "solo | squad | platoon | fleet",
  "template": "string?"
}
```

#### fleet_status

Input schema:

```json
{
  "sessionId": "string?"
}
```

#### list_agents

Input schema: no arguments.

#### abort_fleet

Input schema:

```json
{
  "sessionId": "string?"
}
```

#### add_agent

Input schema:

```json
{
  "name": "string",
  "displayName": "string",
  "description": "string",
  "provider": "github-copilot | openai | anthropic | ollama | lmstudio | custom-api | vscode-local",
  "model": "string",
  "systemPrompt": "string",
  "temperature": "number 0..2",
  "maxTokens": "positive integer"
}
```

### Resources

- fleet://agents
- fleet://sessions/{id}

Practical note: the current resource template name is fleet://sessions/{sessionId}, but it resolves session details by id as expected.

### Prompts

- launch_fleet_prompt

Practical note: the package also contains prompt modules for decompose-task and orchestrate-task, but the current registerPrompts implementation wires only launch_fleet_prompt.

## @copilot-fleet/web

### Zustand stores

#### GraphState

Main canvas store for nodes, edges, selection, graph metadata, and graph CRUD actions.

Key actions:
- addNode
- removeNode
- updateNodeData
- updateNodeStatus
- selectNode
- duplicateNode
- loadGraph
- clearGraph
- exportGraph
- setGraphName
- getNode
- getSelectedNode
- getNodeCount

#### SettingsState

Workspace preferences and provider entries.

Key fields:
- locale
- theme
- preset
- providers
- showMinimap
- showGrid
- snapToGrid
- gridSize
- autoSave
- onboardingComplete

Key actions:
- setLocale
- setTheme
- setPreset
- addProvider
- removeProvider
- updateProvider
- completeOnboarding

#### SessionState

Execution status, results, errors, logs, and elapsed time.

Key actions:
- startSession
- completeSession
- failSession
- abortSession
- advanceWave
- addResult
- addError
- addLog
- updateElapsed
- clearConsole
- reset
- isRunning

### Node components

The web package registers these node types in the graph UI:
- AgentNode
- TriggerNode
- SplitterNode
- MergerNode
- ConditionNode
- OutputNode
- LLMNode
- ToolNode
- HumanNode
- GroupNode

Practical note: these are exposed through the node type registry under packages/web/src/nodes.

## Compatibility notes

A few names in product language differ from the current implementation. Use the source files if you need exact runtime behavior:
- pause(sessionId) is not currently implemented on FleetEngine
- updateNodeResult is currently named setNodeResult
- loadCustomAgents(directory) is currently represented by discoverAgentFiles plus loadAgentFromString
- only launch_fleet_prompt is currently registered in MCP prompt wiring

## Related docs

- [creating-agents.md](./creating-agents.md)
- [creating-providers.md](./creating-providers.md)
