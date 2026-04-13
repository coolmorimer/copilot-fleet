export type NodeType =
  | 'trigger'
  | 'agent'
  | 'llm'
  | 'splitter'
  | 'merger'
  | 'condition'
  | 'human'
  | 'tool'
  | 'output'
  | 'group';

export type NodeStatus = 'idle' | 'queued' | 'running' | 'done' | 'error' | 'skipped' | 'cancelled';

export type SessionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'aborted';

export type ProviderType =
  | 'github-copilot'
  | 'openai'
  | 'anthropic'
  | 'ollama'
  | 'lmstudio'
  | 'custom-api'
  | 'vscode-local';

export type Preset = 'solo' | 'squad' | 'platoon' | 'fleet';

export type Locale = 'en' | 'ru';

export interface FleetPort {
  id: string;
  name: string;
  type: 'input' | 'output';
  dataType?: string;
}

export interface FleetNode {
  id: string;
  type: NodeType;
  label: string;
  description?: string;
  position: { x: number; y: number };
  ports: FleetPort[];
  config: Record<string, unknown>;
  status: NodeStatus;
  progress?: number;
  error?: string;
  result?: unknown;
  meta?: Record<string, unknown>;
}

export interface FleetEdge {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
  label?: string;
  animated?: boolean;
}

export interface FleetGraph {
  id: string;
  name: string;
  description?: string;
  nodes: FleetNode[];
  edges: FleetEdge[];
  metadata?: GraphMetadata;
}

export interface GraphMetadata {
  version: string;
  createdAt: string;
  updatedAt: string;
  author?: string;
  tags?: string[];
  locale?: Locale;
}

export interface FleetSession {
  id: string;
  graph: FleetGraph;
  status: SessionStatus;
  startedAt?: string;
  completedAt?: string;
  currentWave: number;
  totalWaves: number;
  results: Map<string, NodeResult>;
  errors: SessionError[];
  config: SessionConfig;
}

export interface SessionConfig {
  repo?: string;
  branch?: string;
  preset: Preset;
  maxConcurrency: number;
  timeout: number;
  dryRun: boolean;
  locale: Locale;
}

export interface NodeResult {
  nodeId: string;
  status: NodeStatus;
  output?: unknown;
  startedAt: string;
  completedAt?: string;
  duration?: number;
  issueNumber?: number;
  prNumber?: number;
  error?: string;
}

export interface SessionError {
  nodeId: string;
  message: string;
  code?: string;
  timestamp: string;
  recoverable: boolean;
}

export interface ProviderConfig {
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

export interface ProviderStatus {
  type: ProviderType;
  connected: boolean;
  models: string[];
  usage?: ProviderUsage;
  error?: string;
}

export interface ProviderUsage {
  used: number;
  limit: number;
  resetAt?: string;
}

export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  tools?: LLMTool[];
  stream?: boolean;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  name?: string;
}

export interface LLMTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  finishReason: 'stop' | 'length' | 'tool_calls' | 'error';
  toolCalls?: LLMToolCall[];
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AgentDefinition {
  id: string;
  name: string;
  displayName: string;
  description: string;
  icon?: string;
  color?: string;
  provider: ProviderType;
  model: string;
  fallbackModel?: string;
  systemPrompt: string;
  parameters: AgentParameters;
  files?: FileFilter;
  hooks?: AgentHooks;
  labels?: string[];
  builtin: boolean;
}

export interface AgentParameters {
  temperature: number;
  maxTokens: number;
  timeout: number;
}

export interface FileFilter {
  include?: string[];
  exclude?: string[];
}

export interface AgentHooks {
  before?: string;
  after?: string;
}

export type FleetEventType =
  | 'session:start'
  | 'session:complete'
  | 'session:error'
  | 'session:abort'
  | 'wave:start'
  | 'wave:complete'
  | 'node:queued'
  | 'node:start'
  | 'node:progress'
  | 'node:complete'
  | 'node:error'
  | 'node:skipped'
  | 'log';

export interface FleetEvent {
  type: FleetEventType;
  sessionId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface GraphTemplate {
  id: string;
  name: string;
  description: string;
  icon?: string;
  tags: string[];
  graph: FleetGraph;
}

export interface TaskDecomposition {
  originalTask: string;
  subtasks: Subtask[];
  dependencies: TaskDependency[];
  waves: Subtask[][];
}

export interface Subtask {
  id: string;
  title: string;
  description: string;
  agentType: string;
  priority: number;
  estimatedDuration?: number;
}

export interface TaskDependency {
  from: string;
  to: string;
  type: 'blocks' | 'informs';
}