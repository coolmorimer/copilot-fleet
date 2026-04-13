import type { AgentParameters, NodeType, Preset, SessionConfig } from './types.js';

export const NODE_COLORS: Record<NodeType, { header: string; glow: string }> = {
  trigger: { header: '#10b981', glow: '#34d399' },
  agent: { header: '#6366f1', glow: '#818cf8' },
  llm: { header: '#f59e0b', glow: '#fbbf24' },
  splitter: { header: '#06b6d4', glow: '#22d3ee' },
  merger: { header: '#8b5cf6', glow: '#a78bfa' },
  condition: { header: '#ef4444', glow: '#f87171' },
  human: { header: '#ec4899', glow: '#f472b6' },
  tool: { header: '#14b8a6', glow: '#2dd4bf' },
  output: { header: '#22c55e', glow: '#4ade80' },
  group: { header: '#64748b', glow: '#94a3b8' },
};

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  preset: 'squad',
  maxConcurrency: 3,
  timeout: 30 * 60 * 1000,
  dryRun: false,
  locale: 'en',
};

export const PRESET_AGENTS: Record<Preset, number> = {
  solo: 1,
  squad: 3,
  platoon: 6,
  fleet: 10,
};

export const MAX_NODES = 50;
export const MAX_EDGES = 100;

export const DEFAULT_AGENT_PARAMETERS: AgentParameters = {
  temperature: 0.3,
  maxTokens: 4096,
  timeout: 30 * 60 * 1000,
};

export const VERSION = '0.1.0';