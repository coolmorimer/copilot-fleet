import type { ReactNode } from 'react';

import { NODE_COLORS } from '@copilot-fleet/shared';
import type { NodeStatus, NodeType } from '@copilot-fleet/shared';
import { Ban, Bot, Boxes, Brain, CheckCircle2, Circle, Clock, FileOutput, GitBranch, Merge, Play, SkipForward, Split, User, Wrench, Loader2, XCircle } from 'lucide-react';
import { createElement } from 'react';

export const THEME = {
  bg: '#1a1a2e',
  surface: '#16213e',
  panel: '#0f3460',
  border: '#2a2a4a',
  accent: '#6366f1',
  text: '#e2e8f0',
  muted: '#94a3b8',
} as const;

export const STATUS_COLORS: Record<NodeStatus, string> = {
  idle: '#94a3b8',
  queued: '#f59e0b',
  running: '#6366f1',
  done: '#22c55e',
  error: '#ef4444',
  skipped: '#64748b',
  cancelled: '#64748b',
};

export const STATUS_ICONS: Record<NodeStatus, string> = {
  idle: '○',
  queued: '◌',
  running: '⟳',
  done: '✓',
  error: '✕',
  skipped: '»',
  cancelled: '—',
};

const icon = (component: React.FC<{ size?: number }>, size = 14): ReactNode =>
  createElement(component, { size });

export const STATUS_ICON_ELEMENTS: Record<NodeStatus, ReactNode> = {
  idle: icon(Circle),
  queued: icon(Clock),
  running: icon(Loader2),
  done: icon(CheckCircle2),
  error: icon(XCircle),
  skipped: icon(SkipForward),
  cancelled: icon(Ban),
};

export const NODE_ICONS: Record<NodeType, string> = {
  trigger: '▶',
  agent: 'A',
  llm: 'M',
  splitter: '⑂',
  merger: '⊕',
  condition: '◇',
  human: 'H',
  tool: 'T',
  output: 'O',
  group: '□',
};

export const NODE_ICON_ELEMENTS: Record<NodeType, ReactNode> = {
  trigger: icon(Play),
  agent: icon(Bot),
  llm: icon(Brain),
  splitter: icon(Split),
  merger: icon(Merge),
  condition: icon(GitBranch),
  human: icon(User),
  tool: icon(Wrench),
  output: icon(FileOutput),
  group: icon(Boxes),
};

export function getNodeColor(type: NodeType): { header: string; glow: string } {
  return NODE_COLORS[type];
}

export function getStatusColor(status: NodeStatus): string {
  return STATUS_COLORS[status];
}

export function getNodeClasses(type: NodeType, status: NodeStatus, selected: boolean): string {
  const classes = ['fleet-node', `type-${type}`, `status-${status}`];
  if (selected) {
    classes.push('selected');
  }
  return classes.join(' ');
}