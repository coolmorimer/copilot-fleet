import type {
  FleetEvent,
  FleetGraph,
  FleetNode,
  FleetSession,
  LLMRequest,
  LLMResponse,
  SessionConfig,
} from '@copilot-fleet/shared';

export type { FleetEvent, FleetGraph, FleetNode, FleetSession, SessionConfig };

export interface OrchestratorOptions {
  config: SessionConfig;
  graph: FleetGraph;
  onEvent?: (event: FleetEvent) => void;
}

export interface ProviderAdapter {
  readonly type: string;
  initialize(): Promise<void>;
  complete(request: LLMRequest): Promise<LLMResponse>;
  stream?(request: LLMRequest): AsyncIterable<string>;
  listModels(): Promise<string[]>;
  testConnection(): Promise<boolean>;
  dispose(): Promise<void>;
}

export interface DispatcherTarget {
  nodeId: string;
  agentId: string;
  provider: ProviderAdapter;
  request: LLMRequest;
}

export interface SchedulerOptions {
  maxConcurrency: number;
  timeout: number;
}