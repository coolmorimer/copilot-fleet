import { MAX_EDGES, MAX_NODES, NODE_COLORS } from '@copilot-fleet/shared';
import type { FleetGraph, FleetPort, GraphMetadata, NodeStatus, NodeType } from '@copilot-fleet/shared';
import { addEdge, applyEdgeChanges, applyNodeChanges } from '@xyflow/react';
import type { Connection, Edge, Node, OnConnect, OnEdgesChange, OnNodesChange } from '@xyflow/react';
import { create } from 'zustand';

import { buildMetadata, clonePorts, NODE_TEMPLATES, normalizeNodes, toFlowEdge, toFlowNode } from './graph-store.helpers.js';

export interface FleetNodeData extends Record<string, unknown> {
  label: string;
  nodeType: NodeType;
  status: NodeStatus;
  progress: number;
  config: Record<string, unknown>;
  error?: string;
  description?: string;
}

export interface GraphState {
  nodes: Node<FleetNodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;
  graphName: string;
  graphId: string;
  graphDescription: string;
  metadata?: GraphMetadata;
  nodePorts: Record<string, FleetPort[]>;
  onNodesChange: OnNodesChange<Node<FleetNodeData>>;
  onEdgesChange: OnEdgesChange<Edge>;
  onConnect: OnConnect;
  addNode: (type: NodeType, position: { x: number; y: number }) => string;
  removeNode: (id: string) => void;
  updateNodeData: (id: string, data: Partial<FleetNodeData>) => void;
  updateNodeStatus: (id: string, status: FleetNodeData['status'], progress?: number) => void;
  selectNode: (id: string | null) => void;
  duplicateNode: (id: string) => string | null;
  loadGraph: (graph: FleetGraph) => void;
  clearGraph: () => void;
  exportGraph: () => FleetGraph;
  setGraphName: (name: string) => void;
  getNode: (id: string) => Node<FleetNodeData> | undefined;
  getSelectedNode: () => Node<FleetNodeData> | undefined;
  getNodeCount: () => number;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  graphName: 'Untitled graph',
  graphId: crypto.randomUUID(),
  graphDescription: '',
  metadata: buildMetadata(),
  nodePorts: {},
  onNodesChange: (changes) => {
    set((state) => {
      const nodes = applyNodeChanges(changes, state.nodes);
      const selectedNode = nodes.find((node) => node.selected);
      return {
        nodes,
        selectedNodeId: selectedNode?.id ?? null,
      };
    });
  },
  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    }));
  },
  onConnect: (connection: Connection) => {
    if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) {
      return;
    }

    set((state) => {
      if (state.edges.length >= MAX_EDGES) {
        return state;
      }

      const sourceNode = state.nodes.find((node) => node.id === connection.source);
      const targetNode = state.nodes.find((node) => node.id === connection.target);
      const sourceColor = sourceNode ? NODE_COLORS[sourceNode.data.nodeType].glow : '#6366f1';
      const targetColor = targetNode ? NODE_COLORS[targetNode.data.nodeType].glow : '#4a4a6a';
      const shouldAnimate = sourceNode?.data.status === 'running' || targetNode?.data.status === 'running' || sourceNode?.data.nodeType === 'trigger';

      const edge: Edge = {
        id: crypto.randomUUID(),
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
        animated: shouldAnimate,
        type: shouldAnimate ? 'animated' : 'data',
        data: {
          animated: shouldAnimate,
          color: sourceColor,
          sourceColor,
          targetColor,
        },
      };

      return {
        edges: addEdge(edge, state.edges),
      };
    });
  },
  addNode: (type, position) => {
    const state = get();
    if (state.nodes.length >= MAX_NODES) {
      return '';
    }

    const id = crypto.randomUUID();
    const template = NODE_TEMPLATES[type];
    const node = toFlowNode(id, type, position, {
      label: template.label,
      description: template.description,
      config: { ...template.config },
    });

    set((current) => ({
      nodes: [...current.nodes, node],
      nodePorts: { ...current.nodePorts, [id]: clonePorts(template.ports) },
      metadata: buildMetadata(current.metadata),
    }));

    return id;
  },
  removeNode: (id) => {
    set((state) => {
      const nextPorts = { ...state.nodePorts };
      delete nextPorts[id];
      const nextNodes = state.nodes.filter((node) => node.id !== id);
      const nextEdges = state.edges.filter((edge) => edge.source !== id && edge.target !== id);
      return {
        nodes: nextNodes,
        edges: nextEdges,
        nodePorts: nextPorts,
        selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
        metadata: buildMetadata(state.metadata),
      };
    });
  },
  updateNodeData: (id, data) => {
    set((state) => ({
      nodes: normalizeNodes(
        state.nodes.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...data,
                  config: data.config ?? node.data.config,
                },
              }
            : node,
        ),
      ),
      metadata: buildMetadata(state.metadata),
    }));
  },
  updateNodeStatus: (id, status, progress) => {
    set((state) => ({
      nodes: normalizeNodes(
        state.nodes.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  status,
                  progress: progress ?? node.data.progress,
                },
              }
            : node,
        ),
      ),
      metadata: buildMetadata(state.metadata),
    }));
  },
  selectNode: (id) => {
    set({ selectedNodeId: id });
  },
  duplicateNode: (id) => {
    const state = get();
    if (state.nodes.length >= MAX_NODES) {
      return null;
    }

    const sourceNode = state.nodes.find((node) => node.id === id);
    if (!sourceNode) {
      return null;
    }

    const nextId = crypto.randomUUID();
    const duplicatedNode: Node<FleetNodeData> = {
      ...sourceNode,
      id: nextId,
      position: {
        x: sourceNode.position.x + 40,
        y: sourceNode.position.y + 40,
      },
      data: {
        ...sourceNode.data,
        config: { ...sourceNode.data.config },
      },
      selected: false,
    };

    set((current) => ({
      nodes: normalizeNodes([...current.nodes, duplicatedNode]),
      nodePorts: {
        ...current.nodePorts,
        [nextId]: clonePorts(current.nodePorts[id] ?? NODE_TEMPLATES[sourceNode.data.nodeType].ports),
      },
      metadata: buildMetadata(current.metadata),
    }));

    return nextId;
  },
  loadGraph: (graph) => {
    if (graph.nodes.length > MAX_NODES) {
      throw new Error(`Graph exceeds the maximum of ${MAX_NODES} nodes.`);
    }
    if (graph.edges.length > MAX_EDGES) {
      throw new Error(`Graph exceeds the maximum of ${MAX_EDGES} edges.`);
    }

    const nodePorts = Object.fromEntries(graph.nodes.map((node) => [node.id, clonePorts(node.ports)]));
    const nodes = normalizeNodes(
      graph.nodes.map((node) =>
        toFlowNode(node.id, node.type, node.position, {
          label: node.label,
          status: node.status,
          progress: node.progress ?? 0,
          config: node.config,
          error: node.error,
          description: node.description,
        }),
      ),
    );

    set({
      nodes,
      edges: graph.edges.map(toFlowEdge),
      selectedNodeId: null,
      graphName: graph.name,
      graphId: graph.id,
      graphDescription: graph.description ?? '',
      metadata: buildMetadata(graph.metadata),
      nodePorts,
    });
  },
  clearGraph: () => {
    set({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      graphName: 'Untitled graph',
      graphId: crypto.randomUUID(),
      graphDescription: '',
      metadata: buildMetadata(),
      nodePorts: {},
    });
  },
  exportGraph: () => {
    const state = get();
    return {
      id: state.graphId,
      name: state.graphName,
      description: state.graphDescription || undefined,
      nodes: state.nodes.map((node) => ({
        id: node.id,
        type: node.data.nodeType,
        label: node.data.label,
        description: node.data.description,
        position: node.position,
        ports: clonePorts(state.nodePorts[node.id] ?? NODE_TEMPLATES[node.data.nodeType].ports),
        config: { ...node.data.config },
        status: node.data.status,
        progress: node.data.progress,
        error: node.data.error,
      })),
      edges: state.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        sourcePort: edge.sourceHandle ?? 'output',
        target: edge.target,
        targetPort: edge.targetHandle ?? 'input',
        label: typeof edge.label === 'string' ? edge.label : undefined,
        animated: edge.animated,
      })),
      metadata: buildMetadata(state.metadata),
    };
  },
  setGraphName: (name) => {
    set((state) => ({ graphName: name, metadata: buildMetadata(state.metadata) }));
  },
  getNode: (id) => get().nodes.find((node) => node.id === id),
  getSelectedNode: () => {
    const state = get();
    return state.selectedNodeId ? state.nodes.find((node) => node.id === state.selectedNodeId) : undefined;
  },
  getNodeCount: () => get().nodes.length,
}));