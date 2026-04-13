import { VERSION } from '@copilot-fleet/shared';
import type { FleetEdge, FleetPort, GraphMetadata, NodeType } from '@copilot-fleet/shared';
import type { Edge, Node } from '@xyflow/react';

import { getNodeClasses } from '../styles/theme.js';
import type { FleetNodeData } from './graph-store.js';

interface NodeTemplate {
  label: string;
  description: string;
  config: Record<string, unknown>;
  ports: FleetPort[];
}

const createPort = (id: string, name: string, type: FleetPort['type'], dataType?: string): FleetPort => ({
  id,
  name,
  type,
  dataType,
});

export const NODE_TEMPLATES: Record<NodeType, NodeTemplate> = {
  trigger: {
    label: 'Trigger',
    description: 'Starts the execution graph.',
    config: { triggerMode: 'manual' },
    ports: [createPort('trigger-out', 'Trigger', 'output', 'signal')],
  },
  agent: {
    label: 'Agent',
    description: 'Runs a named agent against the current task.',
    config: { agentId: '', parameters: {} },
    ports: [createPort('agent-in', 'Input', 'input'), createPort('agent-out', 'Result', 'output')],
  },
  llm: {
    label: 'LLM',
    description: 'Calls a configured language model provider.',
    config: { provider: '', model: '' },
    ports: [createPort('llm-in', 'Prompt', 'input'), createPort('llm-out', 'Completion', 'output')],
  },
  splitter: {
    label: 'Splitter',
    description: 'Branches execution into multiple paths.',
    config: { strategy: 'parallel' },
    ports: [
      createPort('splitter-in', 'Input', 'input'),
      createPort('splitter-a', 'Branch A', 'output'),
      createPort('splitter-b', 'Branch B', 'output'),
      createPort('splitter-c', 'Branch C', 'output'),
      createPort('splitter-d', 'Branch D', 'output'),
      createPort('splitter-e', 'Branch E', 'output'),
    ],
  },
  merger: {
    label: 'Merger',
    description: 'Waits for multiple upstream results and combines them.',
    config: { strategy: 'all' },
    ports: [
      createPort('merger-left', 'Left', 'input'),
      createPort('merger-right', 'Right', 'input'),
      createPort('merger-in-3', 'Input 3', 'input'),
      createPort('merger-in-4', 'Input 4', 'input'),
      createPort('merger-in-5', 'Input 5', 'input'),
      createPort('merger-out', 'Merged', 'output'),
    ],
  },
  condition: {
    label: 'Condition',
    description: 'Routes execution based on a boolean expression.',
    config: { expression: '' },
    ports: [
      createPort('condition-in', 'Input', 'input'),
      createPort('condition-true', 'True', 'output'),
      createPort('condition-false', 'False', 'output'),
    ],
  },
  human: {
    label: 'Human',
    description: 'Pauses for human input or approval.',
    config: { prompt: '' },
    ports: [createPort('human-in', 'Request', 'input'), createPort('human-out', 'Response', 'output')],
  },
  tool: {
    label: 'Tool',
    description: 'Invokes an external tool or command.',
    config: { toolName: '', arguments: [] },
    ports: [createPort('tool-in', 'Input', 'input'), createPort('tool-out', 'Result', 'output')],
  },
  output: {
    label: 'Output',
    description: 'Emits the final result of the workflow.',
    config: { format: 'markdown' },
    ports: [createPort('output-in', 'Input', 'input')],
  },
  group: {
    label: 'Group',
    description: 'Visually groups related nodes.',
    config: { collapsed: false },
    ports: [],
  },
};

export const clonePorts = (ports: FleetPort[]): FleetPort[] => ports.map((port) => ({ ...port }));

export const buildMetadata = (metadata?: GraphMetadata): GraphMetadata => {
  const now = new Date().toISOString();
  return {
    version: metadata?.version ?? VERSION,
    createdAt: metadata?.createdAt ?? now,
    updatedAt: now,
    author: metadata?.author,
    tags: metadata?.tags,
    locale: metadata?.locale,
  };
};

export const toFlowNode = (
  id: string,
  type: NodeType,
  position: { x: number; y: number },
  data: Partial<FleetNodeData> = {},
  selected = false,
): Node<FleetNodeData> => {
  const template = NODE_TEMPLATES[type];
  const nodeData: FleetNodeData = {
    label: data.label ?? template.label,
    nodeType: type,
    status: data.status ?? 'idle',
    progress: data.progress ?? 0,
    config: data.config ?? { ...template.config },
    error: data.error,
    description: data.description ?? template.description,
  };

  return {
    id,
    type,
    position,
    data: nodeData,
    selected,
    className: getNodeClasses(type, nodeData.status, selected),
  };
};

export const normalizeNodes = (nodes: Node<FleetNodeData>[]): Node<FleetNodeData>[] =>
  nodes.map((node) => ({
    ...node,
    className: getNodeClasses(node.data.nodeType, node.data.status, Boolean(node.selected)),
  }));

export const toFlowEdge = (edge: FleetEdge): Edge => ({
  id: edge.id,
  source: edge.source,
  target: edge.target,
  sourceHandle: edge.sourcePort,
  targetHandle: edge.targetPort,
  label: edge.label,
  animated: edge.animated,
  type: edge.animated ? 'animated' : 'data',
  data: {
    animated: Boolean(edge.animated),
    color: '#6366f1',
    sourceColor: '#6366f1',
    targetColor: '#4a4a6a',
  },
});