import type { FleetEdge, FleetGraph, FleetNode, NodeType } from '@copilot-fleet/shared';

import { clonePorts, NODE_TEMPLATES } from './graph-store.helpers.js';

export type StarterTemplateId = 'quick-fix' | 'feature-squad' | 'fullstack-team' | 'empty';

const createNode = (
  id: string,
  type: NodeType,
  position: { x: number; y: number },
  config: Record<string, unknown> = {},
  label?: string,
): FleetNode => ({
  id,
  type,
  label: label ?? NODE_TEMPLATES[type].label,
  description: NODE_TEMPLATES[type].description,
  position,
  ports: clonePorts(NODE_TEMPLATES[type].ports),
  config: { ...NODE_TEMPLATES[type].config, ...config },
  status: 'idle',
  progress: 0,
});

const connect = (id: string, source: string, sourcePort: string, target: string, targetPort: string, animated = false): FleetEdge => ({
  id,
  source,
  sourcePort,
  target,
  targetPort,
  animated,
});

export function createStarterTemplate(templateId: StarterTemplateId): FleetGraph {
  const graphId = crypto.randomUUID();

  if (templateId === 'empty') {
    return {
      id: graphId,
      name: 'Empty workspace',
      nodes: [],
      edges: [],
    };
  }

  if (templateId === 'quick-fix') {
    return {
      id: graphId,
      name: 'Quick Fix',
      description: 'Trigger an agent, review the result, and emit the output.',
      nodes: [
        createNode('trigger-1', 'trigger', { x: 80, y: 160 }, { triggerType: 'manual' }, 'Start'),
        createNode('agent-1', 'agent', { x: 320, y: 140 }, { agentId: 'coder', provider: 'github-copilot', model: 'claude-sonnet-4', systemPrompt: 'Investigate and fix the issue.' }, 'Coder'),
        createNode('output-1', 'output', { x: 580, y: 160 }, { outputType: 'markdown' }, 'Patch Summary'),
      ],
      edges: [
        connect('edge-1', 'trigger-1', 'trigger-out', 'agent-1', 'agent-in', true),
        connect('edge-2', 'agent-1', 'agent-out', 'output-1', 'output-in'),
      ],
    };
  }

  if (templateId === 'feature-squad') {
    return {
      id: graphId,
      name: 'Feature Squad',
      description: 'Plan, implement, review, and publish a feature flow.',
      nodes: [
        createNode('trigger-1', 'trigger', { x: 60, y: 180 }, { triggerType: 'manual' }, 'Kickoff'),
        createNode('agent-1', 'agent', { x: 280, y: 80 }, { agentId: 'planner', provider: 'github-copilot', model: 'claude-sonnet-4' }, 'Planner'),
        createNode('agent-2', 'agent', { x: 280, y: 280 }, { agentId: 'coder', provider: 'github-copilot', model: 'claude-sonnet-4' }, 'Coder'),
        createNode('agent-3', 'agent', { x: 520, y: 180 }, { agentId: 'reviewer', provider: 'openai', model: 'o3' }, 'Reviewer'),
        createNode('output-1', 'output', { x: 760, y: 180 }, { outputType: 'summary' }, 'Delivery'),
      ],
      edges: [
        connect('edge-1', 'trigger-1', 'trigger-out', 'agent-1', 'agent-in', true),
        connect('edge-2', 'trigger-1', 'trigger-out', 'agent-2', 'agent-in'),
        connect('edge-3', 'agent-1', 'agent-out', 'agent-3', 'agent-in'),
        connect('edge-4', 'agent-2', 'agent-out', 'agent-3', 'agent-in'),
        connect('edge-5', 'agent-3', 'agent-out', 'output-1', 'output-in', true),
      ],
    };
  }

  return {
    id: graphId,
    name: 'Fullstack Team',
    description: 'A broader multi-branch workflow for discovery, build, and delivery.',
    nodes: [
      createNode('trigger-1', 'trigger', { x: 40, y: 220 }, { triggerType: 'manual' }, 'Start'),
      createNode('agent-1', 'agent', { x: 240, y: 220 }, { agentId: 'planner', provider: 'github-copilot', model: 'claude-sonnet-4' }, 'Planner'),
      createNode('splitter-1', 'splitter', { x: 460, y: 220 }, { branchCount: 3, branchLabels: ['Frontend', 'Backend', 'QA'] }, 'Workstreams'),
      createNode('agent-2', 'agent', { x: 700, y: 80 }, { agentId: 'designer', provider: 'openai', model: 'gpt-4.1' }, 'Frontend'),
      createNode('agent-3', 'agent', { x: 700, y: 220 }, { agentId: 'coder', provider: 'github-copilot', model: 'claude-sonnet-4' }, 'Backend'),
      createNode('agent-4', 'agent', { x: 700, y: 360 }, { agentId: 'tester', provider: 'openai', model: 'o3' }, 'QA'),
      createNode('merger-1', 'merger', { x: 960, y: 220 }, { expectedInputs: 3 }, 'Assemble'),
      createNode('output-1', 'output', { x: 1200, y: 220 }, { outputType: 'handoff' }, 'Release'),
    ],
    edges: [
      connect('edge-1', 'trigger-1', 'trigger-out', 'agent-1', 'agent-in', true),
      connect('edge-2', 'agent-1', 'agent-out', 'splitter-1', 'splitter-in', true),
      connect('edge-3', 'splitter-1', 'splitter-a', 'agent-2', 'agent-in'),
      connect('edge-4', 'splitter-1', 'splitter-b', 'agent-3', 'agent-in'),
      connect('edge-5', 'splitter-1', 'splitter-c', 'agent-4', 'agent-in'),
      connect('edge-6', 'agent-2', 'agent-out', 'merger-1', 'merger-left'),
      connect('edge-7', 'agent-3', 'agent-out', 'merger-1', 'merger-right'),
      connect('edge-8', 'agent-4', 'agent-out', 'merger-1', 'merger-in-3'),
      connect('edge-9', 'merger-1', 'merger-out', 'output-1', 'output-in', true),
    ],
  };
}