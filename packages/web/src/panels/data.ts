import type { ProviderType } from '@copilot-fleet/shared';

export const PROVIDER_OPTIONS: Array<{ value: ProviderType; label: string }> = [
  { value: 'github-copilot', label: 'GitHub Copilot' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'lmstudio', label: 'LM Studio' },
  { value: 'custom-api', label: 'Custom API' },
  { value: 'vscode-local', label: 'VS Code Local' },
];

export const PROVIDER_LABELS = Object.fromEntries(PROVIDER_OPTIONS.map((option) => [option.value, option.label])) as Record<ProviderType, string>;

export const PROVIDER_MODELS: Record<ProviderType, string[]> = {
  'github-copilot': ['claude-sonnet-4', 'gpt-4o', 'o3-mini'],
  openai: ['gpt-4o', 'gpt-4.1', 'o3-mini'],
  anthropic: ['claude-sonnet-4', 'claude-3-7-sonnet', 'claude-3-5-haiku'],
  ollama: ['llama3.2', 'qwen2.5-coder', 'mistral-small'],
  lmstudio: ['local-model', 'qwen2.5-coder', 'llama3.1'],
  'custom-api': ['custom-model'],
  'vscode-local': ['copilot-local'],
};

export const PROVIDERS_WITH_BASE_URL = new Set<ProviderType>(['ollama', 'lmstudio', 'custom-api']);

export type TemplateIconId = 'zap' | 'users' | 'building' | 'refresh' | 'shield';

export const TEMPLATE_CARDS: ReadonlyArray<{
  id: string;
  icon: TemplateIconId;
  name: string;
  description: string;
  agentCount: number;
  tags: readonly string[];
}> = [
  {
    id: 'quick-fix',
    icon: 'zap',
    name: 'Quick Fix',
    description: 'Single-agent sprint for a fast targeted patch.',
    agentCount: 1,
    tags: ['quick', 'single-agent', 'patch'],
  },
  {
    id: 'feature-squad',
    icon: 'users',
    name: 'Feature Squad',
    description: 'Plan → code → review with a compact delivery lane.',
    agentCount: 3,
    tags: ['feature', 'pipeline', 'review'],
  },
  {
    id: 'fullstack-team',
    icon: 'building',
    name: 'Fullstack Team',
    description: 'Planner, implementation, design, test, merge, and review.',
    agentCount: 6,
    tags: ['parallel', 'full-pipeline', 'delivery'],
  },
  {
    id: 'refactor-platoon',
    icon: 'refresh',
    name: 'Refactor Platoon',
    description: 'Structural cleanup with security and validation tracks.',
    agentCount: 5,
    tags: ['refactor', 'security', 'validation'],
  },
  {
    id: 'security-audit',
    icon: 'shield',
    name: 'Security Audit',
    description: 'Audit-first flow with conditional remediation and review.',
    agentCount: 3,
    tags: ['security', 'audit', 'conditional'],
  },
];