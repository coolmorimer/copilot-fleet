import type { FleetEdge, FleetGraph, FleetNode } from '@copilot-fleet/shared';

type EdgeLike = FleetEdge & { source?: string; target?: string; from?: string; to?: string };
type NodeLike = FleetNode & { id: string };

function getNodes(graph: FleetGraph): NodeLike[] {
  return ((graph as FleetGraph & { nodes?: NodeLike[] }).nodes ?? []).filter(
    (node): node is NodeLike => typeof node?.id === 'string',
  );
}

function getEdges(graph: FleetGraph): EdgeLike[] {
  return ((graph as FleetGraph & { edges?: EdgeLike[] }).edges ?? []).filter(Boolean);
}

function getEdgeEndpoints(edge: EdgeLike): [string, string] | null {
  const from = edge.source ?? edge.from;
  const to = edge.target ?? edge.to;
  return typeof from === 'string' && typeof to === 'string' ? [from, to] : null;
}

export function buildAdjacencyList(graph: FleetGraph): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const node of getNodes(graph)) {
    adjacency.set(node.id, []);
  }

  for (const edge of getEdges(graph)) {
    const endpoints = getEdgeEndpoints(edge);
    if (!endpoints) {
      continue;
    }

    const [from, to] = endpoints;
    const next = adjacency.get(from) ?? [];
    adjacency.set(from, [...next, to]);
    if (!adjacency.has(to)) {
      adjacency.set(to, []);
    }
  }

  return adjacency;
}

export function topologicalSort(graph: FleetGraph): string[] {
  const adjacency = buildAdjacencyList(graph);
  const inDegree = new Map<string, number>();
  for (const nodeId of adjacency.keys()) {
    inDegree.set(nodeId, 0);
  }

  for (const targets of adjacency.values()) {
    for (const target of targets) {
      inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
    }
  }

  const queue = [...inDegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([nodeId]) => nodeId);
  const sorted: string[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId) {
      continue;
    }

    sorted.push(nodeId);
    for (const target of adjacency.get(nodeId) ?? []) {
      const nextDegree = (inDegree.get(target) ?? 0) - 1;
      inDegree.set(target, nextDegree);
      if (nextDegree === 0) {
        queue.push(target);
      }
    }
  }

  if (sorted.length !== adjacency.size) {
    throw new Error('Graph contains a cycle');
  }

  return sorted;
}

export function detectCycles(graph: FleetGraph): string[] {
  const adjacency = buildAdjacencyList(graph);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];

  const visit = (nodeId: string): string[] => {
    if (visiting.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId);
      return cycleStart >= 0 ? [...path.slice(cycleStart), nodeId] : [nodeId];
    }

    if (visited.has(nodeId)) {
      return [];
    }

    visiting.add(nodeId);
    path.push(nodeId);
    for (const target of adjacency.get(nodeId) ?? []) {
      const cycle = visit(target);
      if (cycle.length > 0) {
        return cycle;
      }
    }

    path.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
    return [];
  };

  for (const nodeId of adjacency.keys()) {
    const cycle = visit(nodeId);
    if (cycle.length > 0) {
      return cycle;
    }
  }

  return [];
}

export function computeWaves(graph: FleetGraph): string[][] {
  const adjacency = buildAdjacencyList(graph);
  const inDegree = new Map<string, number>();
  for (const nodeId of adjacency.keys()) {
    inDegree.set(nodeId, 0);
  }

  for (const targets of adjacency.values()) {
    for (const target of targets) {
      inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
    }
  }

  let currentWave = [...inDegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([nodeId]) => nodeId);
  const waves: string[][] = [];
  let processed = 0;

  while (currentWave.length > 0) {
    waves.push(currentWave);
    processed += currentWave.length;
    const nextWave: string[] = [];

    for (const nodeId of currentWave) {
      for (const target of adjacency.get(nodeId) ?? []) {
        const nextDegree = (inDegree.get(target) ?? 0) - 1;
        inDegree.set(target, nextDegree);
        if (nextDegree === 0) {
          nextWave.push(target);
        }
      }
    }

    currentWave = nextWave;
  }

  if (processed !== adjacency.size) {
    throw new Error('Graph contains a cycle');
  }

  return waves;
}

export function getPredecessors(graph: FleetGraph, nodeId: string): string[] {
  const predecessors: string[] = [];
  for (const edge of getEdges(graph)) {
    const endpoints = getEdgeEndpoints(edge);
    if (endpoints && endpoints[1] === nodeId) {
      predecessors.push(endpoints[0]);
    }
  }

  return predecessors;
}

export function getSuccessors(graph: FleetGraph, nodeId: string): string[] {
  return buildAdjacencyList(graph).get(nodeId) ?? [];
}

export function isValidDAG(graph: FleetGraph): boolean {
  return detectCycles(graph).length === 0;
}

export function getRootNodes(graph: FleetGraph): FleetNode[] {
  const roots = new Set(topologicalSort(graph).filter((nodeId) => getPredecessors(graph, nodeId).length === 0));
  return getNodes(graph).filter((node) => roots.has(node.id));
}

export function getLeafNodes(graph: FleetGraph): FleetNode[] {
  const leaves = new Set(
    getNodes(graph)
      .map((node) => node.id)
      .filter((nodeId) => getSuccessors(graph, nodeId).length === 0),
  );
  return getNodes(graph).filter((node) => leaves.has(node.id));
}