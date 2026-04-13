import { MAX_EDGES, MAX_NODES } from './constants.js';
import type { FleetPort } from './types.js';

export type ValidationResult = { valid: boolean; errors: string[] };

const nodeTypes = new Set(['trigger', 'agent', 'llm', 'splitter', 'merger', 'condition', 'human', 'tool', 'output', 'group']);
const nodeStatuses = new Set(['idle', 'queued', 'running', 'done', 'error', 'skipped', 'cancelled']);
const providerTypes = new Set(['github-copilot', 'openai', 'anthropic', 'ollama', 'lmstudio', 'custom-api', 'vscode-local']);
const presets = new Set(['solo', 'squad', 'platoon', 'fleet']);
const locales = new Set(['en', 'ru']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const push = (errors: string[], condition: boolean, message: string): void => {
  if (!condition) {
    errors.push(message);
  }
};

const validateSessionConfigShape = (config: unknown, prefix: string): string[] => {
  const errors: string[] = [];
  if (!isRecord(config)) {
    return [`${prefix} must be an object.`];
  }

  push(errors, typeof config.repo === 'undefined' || typeof config.repo === 'string', `${prefix}.repo must be a string when provided.`);
  push(errors, typeof config.branch === 'undefined' || typeof config.branch === 'string', `${prefix}.branch must be a string when provided.`);
  push(errors, typeof config.preset === 'string' && presets.has(config.preset), `${prefix}.preset must be one of: solo, squad, platoon, fleet.`);
  push(errors, isFiniteNumber(config.maxConcurrency) && config.maxConcurrency > 0, `${prefix}.maxConcurrency must be a positive number.`);
  push(errors, isFiniteNumber(config.timeout) && config.timeout > 0, `${prefix}.timeout must be a positive number.`);
  push(errors, typeof config.dryRun === 'boolean', `${prefix}.dryRun must be a boolean.`);
  push(errors, typeof config.locale === 'string' && locales.has(config.locale), `${prefix}.locale must be one of: en, ru.`);
  return errors;
};

const validateAgentParametersShape = (parameters: unknown, prefix: string): string[] => {
  const errors: string[] = [];
  if (!isRecord(parameters)) {
    return [`${prefix} must be an object.`];
  }

  push(errors, isFiniteNumber(parameters.temperature) && parameters.temperature >= 0 && parameters.temperature <= 2, `${prefix}.temperature must be a number between 0 and 2.`);
  push(errors, isFiniteNumber(parameters.maxTokens) && parameters.maxTokens > 0, `${prefix}.maxTokens must be a positive number.`);
  push(errors, isFiniteNumber(parameters.timeout) && parameters.timeout > 0, `${prefix}.timeout must be a positive number.`);
  return errors;
};

const validatePort = (port: unknown, nodeId: string, seen: Set<string>): string[] => {
  const errors: string[] = [];
  if (!isRecord(port)) {
    return [`Node "${nodeId}" has a port that is not an object.`];
  }

  push(errors, typeof port.id === 'string' && port.id.length > 0, `Node "${nodeId}" port.id must be a non-empty string.`);
  push(errors, typeof port.name === 'string' && port.name.length > 0, `Node "${nodeId}" port.name must be a non-empty string.`);
  push(errors, port.type === 'input' || port.type === 'output', `Node "${nodeId}" port.type must be "input" or "output".`);
  push(errors, typeof port.dataType === 'undefined' || typeof port.dataType === 'string', `Node "${nodeId}" port.dataType must be a string when provided.`);

  if (typeof port.id === 'string' && port.id.length > 0) {
    if (seen.has(port.id)) {
      errors.push(`Node "${nodeId}" has duplicate port id "${port.id}".`);
    } else {
      seen.add(port.id);
    }
  }

  return errors;
};

const isFleetPort = (value: unknown): value is FleetPort => {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.type === 'input' || value.type === 'output') &&
    (typeof value.dataType === 'undefined' || typeof value.dataType === 'string')
  );
};

const buildPortIndex = (nodes: Array<{ id: string; ports: FleetPort[] }>): Map<string, Map<string, FleetPort>> => {
  return new Map(nodes.map((node) => [node.id, new Map(node.ports.map((port) => [port.id, port]))]));
};

const detectCycle = (nodeIds: Iterable<string>, edges: Array<{ source: string; target: string }>): boolean => {
  const adjacency = new Map<string, string[]>();
  for (const nodeId of nodeIds) {
    adjacency.set(nodeId, []);
  }
  for (const edge of edges) {
    adjacency.get(edge.source)?.push(edge.target);
  }

  const visited = new Set<string>();
  const stack = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (stack.has(nodeId)) {
      return true;
    }
    if (visited.has(nodeId)) {
      return false;
    }
    visited.add(nodeId);
    stack.add(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) {
      if (visit(next)) {
        return true;
      }
    }
    stack.delete(nodeId);
    return false;
  };

  for (const nodeId of adjacency.keys()) {
    if (visit(nodeId)) {
      return true;
    }
  }
  return false;
};

export const validateGraph = (graph: unknown): ValidationResult => {
  const errors: string[] = [];
  if (!isRecord(graph)) {
    return { valid: false, errors: ['Graph must be an object.'] };
  }

  push(errors, typeof graph.id === 'string' && graph.id.length > 0, 'Graph id must be a non-empty string.');
  push(errors, typeof graph.name === 'string' && graph.name.length > 0, 'Graph name must be a non-empty string.');
  push(errors, typeof graph.description === 'undefined' || typeof graph.description === 'string', 'Graph description must be a string when provided.');
  push(errors, Array.isArray(graph.nodes), 'Graph nodes must be an array.');
  push(errors, Array.isArray(graph.edges), 'Graph edges must be an array.');

  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    return { valid: errors.length === 0, errors };
  }

  push(errors, graph.nodes.length <= MAX_NODES, `Graph cannot contain more than ${MAX_NODES} nodes.`);
  push(errors, graph.edges.length <= MAX_EDGES, `Graph cannot contain more than ${MAX_EDGES} edges.`);

  const nodeIds = new Set<string>();
  const typedNodes: Array<{ id: string; ports: FleetPort[] }> = [];
  for (const node of graph.nodes) {
    if (!isRecord(node)) {
      errors.push('Each graph node must be an object.');
      continue;
    }

    push(errors, typeof node.id === 'string' && node.id.length > 0, 'Node id must be a non-empty string.');
    push(errors, typeof node.type === 'string' && nodeTypes.has(node.type), `Node "${String(node.id ?? '<unknown>')}" has an invalid type.`);
    push(errors, typeof node.label === 'string' && node.label.length > 0, `Node "${String(node.id ?? '<unknown>')}" label must be a non-empty string.`);
    push(errors, typeof node.description === 'undefined' || typeof node.description === 'string', `Node "${String(node.id ?? '<unknown>')}" description must be a string when provided.`);
    push(errors, isRecord(node.position), `Node "${String(node.id ?? '<unknown>')}" position must be an object.`);
    if (isRecord(node.position)) {
      push(errors, isFiniteNumber(node.position.x), `Node "${String(node.id ?? '<unknown>')}" position.x must be a finite number.`);
      push(errors, isFiniteNumber(node.position.y), `Node "${String(node.id ?? '<unknown>')}" position.y must be a finite number.`);
    }
    push(errors, Array.isArray(node.ports), `Node "${String(node.id ?? '<unknown>')}" ports must be an array.`);
    push(errors, isRecord(node.config), `Node "${String(node.id ?? '<unknown>')}" config must be an object.`);
    push(errors, typeof node.status === 'string' && nodeStatuses.has(node.status), `Node "${String(node.id ?? '<unknown>')}" status is invalid.`);
    push(errors, typeof node.progress === 'undefined' || (isFiniteNumber(node.progress) && node.progress >= 0 && node.progress <= 100), `Node "${String(node.id ?? '<unknown>')}" progress must be between 0 and 100.`);
    push(errors, typeof node.error === 'undefined' || typeof node.error === 'string', `Node "${String(node.id ?? '<unknown>')}" error must be a string when provided.`);
    push(errors, typeof node.meta === 'undefined' || isRecord(node.meta), `Node "${String(node.id ?? '<unknown>')}" meta must be an object when provided.`);

    if (typeof node.id === 'string' && node.id.length > 0) {
      if (nodeIds.has(node.id)) {
        errors.push(`Graph has duplicate node id "${node.id}".`);
      } else {
        nodeIds.add(node.id);
      }
    }

    if (Array.isArray(node.ports) && typeof node.id === 'string' && node.id.length > 0) {
      const portIds = new Set<string>();
      const validPorts: FleetPort[] = [];
      for (const port of node.ports) {
        errors.push(...validatePort(port, node.id, portIds));
        if (isFleetPort(port)) {
          validPorts.push(port);
        }
      }
      typedNodes.push({ id: node.id, ports: validPorts });
    }
  }

  const portIndex = buildPortIndex(typedNodes);
  const edgeIds = new Set<string>();
  const typedEdges: Array<{ source: string; target: string }> = [];

  for (const edge of graph.edges) {
    if (!isRecord(edge)) {
      errors.push('Each graph edge must be an object.');
      continue;
    }

    push(errors, typeof edge.id === 'string' && edge.id.length > 0, 'Edge id must be a non-empty string.');
    push(errors, typeof edge.source === 'string' && nodeIds.has(edge.source), `Edge "${String(edge.id ?? '<unknown>')}" source must reference an existing node.`);
    push(errors, typeof edge.target === 'string' && nodeIds.has(edge.target), `Edge "${String(edge.id ?? '<unknown>')}" target must reference an existing node.`);
    push(errors, typeof edge.sourcePort === 'string' && edge.sourcePort.length > 0, `Edge "${String(edge.id ?? '<unknown>')}" sourcePort must be a non-empty string.`);
    push(errors, typeof edge.targetPort === 'string' && edge.targetPort.length > 0, `Edge "${String(edge.id ?? '<unknown>')}" targetPort must be a non-empty string.`);
    push(errors, typeof edge.label === 'undefined' || typeof edge.label === 'string', `Edge "${String(edge.id ?? '<unknown>')}" label must be a string when provided.`);
    push(errors, typeof edge.animated === 'undefined' || typeof edge.animated === 'boolean', `Edge "${String(edge.id ?? '<unknown>')}" animated must be a boolean when provided.`);

    if (typeof edge.id === 'string' && edge.id.length > 0) {
      if (edgeIds.has(edge.id)) {
        errors.push(`Graph has duplicate edge id "${edge.id}".`);
      } else {
        edgeIds.add(edge.id);
      }
    }

    const sourcePort = typeof edge.source === 'string' ? portIndex.get(edge.source)?.get(String(edge.sourcePort)) : undefined;
    const targetPort = typeof edge.target === 'string' ? portIndex.get(edge.target)?.get(String(edge.targetPort)) : undefined;
    if (typeof edge.source === 'string' && typeof edge.sourcePort === 'string' && !sourcePort) {
      errors.push(`Edge "${String(edge.id ?? '<unknown>')}" sourcePort "${edge.sourcePort}" does not exist on node "${edge.source}".`);
    }
    if (typeof edge.target === 'string' && typeof edge.targetPort === 'string' && !targetPort) {
      errors.push(`Edge "${String(edge.id ?? '<unknown>')}" targetPort "${edge.targetPort}" does not exist on node "${edge.target}".`);
    }
    if (sourcePort && sourcePort.type !== 'output') {
      errors.push(`Edge "${String(edge.id ?? '<unknown>')}" must originate from an output port.`);
    }
    if (targetPort && targetPort.type !== 'input') {
      errors.push(`Edge "${String(edge.id ?? '<unknown>')}" must terminate at an input port.`);
    }
    if (typeof edge.source === 'string' && typeof edge.target === 'string') {
      typedEdges.push({ source: edge.source, target: edge.target });
    }
  }

  if (errors.length === 0 && detectCycle(nodeIds, typedEdges)) {
    errors.push('Graph contains a cycle; execution graph must be a DAG.');
  }

  return { valid: errors.length === 0, errors };
};

export const validateAgentDefinition = (definition: unknown): ValidationResult => {
  const errors: string[] = [];
  if (!isRecord(definition)) {
    return { valid: false, errors: ['Agent definition must be an object.'] };
  }

  push(errors, typeof definition.id === 'string' && definition.id.length > 0, 'Agent definition id must be a non-empty string.');
  push(errors, typeof definition.name === 'string' && definition.name.length > 0, 'Agent definition name must be a non-empty string.');
  push(errors, typeof definition.displayName === 'string' && definition.displayName.length > 0, 'Agent definition displayName must be a non-empty string.');
  push(errors, typeof definition.description === 'string' && definition.description.length > 0, 'Agent definition description must be a non-empty string.');
  push(errors, typeof definition.icon === 'undefined' || typeof definition.icon === 'string', 'Agent definition icon must be a string when provided.');
  push(errors, typeof definition.color === 'undefined' || typeof definition.color === 'string', 'Agent definition color must be a string when provided.');
  push(errors, typeof definition.provider === 'string' && providerTypes.has(definition.provider), 'Agent definition provider is invalid.');
  push(errors, typeof definition.model === 'string' && definition.model.length > 0, 'Agent definition model must be a non-empty string.');
  push(errors, typeof definition.fallbackModel === 'undefined' || typeof definition.fallbackModel === 'string', 'Agent definition fallbackModel must be a string when provided.');
  push(errors, typeof definition.systemPrompt === 'string', 'Agent definition systemPrompt must be a string.');
  push(errors, typeof definition.builtin === 'boolean', 'Agent definition builtin must be a boolean.');
  push(errors, typeof definition.labels === 'undefined' || isStringArray(definition.labels), 'Agent definition labels must be a string array when provided.');
  errors.push(...validateAgentParametersShape(definition.parameters, 'Agent definition.parameters'));

  if (typeof definition.files !== 'undefined') {
    if (!isRecord(definition.files)) {
      errors.push('Agent definition files must be an object when provided.');
    } else {
      push(errors, typeof definition.files.include === 'undefined' || isStringArray(definition.files.include), 'Agent definition files.include must be a string array when provided.');
      push(errors, typeof definition.files.exclude === 'undefined' || isStringArray(definition.files.exclude), 'Agent definition files.exclude must be a string array when provided.');
    }
  }

  if (typeof definition.hooks !== 'undefined') {
    if (!isRecord(definition.hooks)) {
      errors.push('Agent definition hooks must be an object when provided.');
    } else {
      push(errors, typeof definition.hooks.before === 'undefined' || typeof definition.hooks.before === 'string', 'Agent definition hooks.before must be a string when provided.');
      push(errors, typeof definition.hooks.after === 'undefined' || typeof definition.hooks.after === 'string', 'Agent definition hooks.after must be a string when provided.');
    }
  }

  return { valid: errors.length === 0, errors };
};

export const validateProviderConfig = (config: unknown): ValidationResult => {
  const errors: string[] = [];
  if (!isRecord(config)) {
    return { valid: false, errors: ['Provider config must be an object.'] };
  }

  push(errors, typeof config.type === 'string' && providerTypes.has(config.type), 'Provider config type is invalid.');
  push(errors, typeof config.name === 'string' && config.name.length > 0, 'Provider config name must be a non-empty string.');
  push(errors, typeof config.apiKey === 'undefined' || typeof config.apiKey === 'string', 'Provider config apiKey must be a string when provided.');
  push(errors, typeof config.baseUrl === 'undefined' || typeof config.baseUrl === 'string', 'Provider config baseUrl must be a string when provided.');
  push(errors, isStringArray(config.models) && config.models.length > 0, 'Provider config models must be a non-empty string array.');
  push(errors, typeof config.defaultModel === 'undefined' || typeof config.defaultModel === 'string', 'Provider config defaultModel must be a string when provided.');
  push(errors, typeof config.maxTokens === 'undefined' || (isFiniteNumber(config.maxTokens) && config.maxTokens > 0), 'Provider config maxTokens must be a positive number when provided.');
  push(errors, typeof config.timeout === 'undefined' || (isFiniteNumber(config.timeout) && config.timeout > 0), 'Provider config timeout must be a positive number when provided.');
  push(errors, typeof config.headers === 'undefined' || (isRecord(config.headers) && Object.values(config.headers).every((value) => typeof value === 'string')), 'Provider config headers must be a record of string values when provided.');

  if (isStringArray(config.models) && typeof config.defaultModel === 'string' && !config.models.includes(config.defaultModel)) {
    errors.push('Provider config defaultModel must exist in models.');
  }

  return { valid: errors.length === 0, errors };
};

export const validateSessionConfig = (config: unknown): ValidationResult => {
  const errors = validateSessionConfigShape(config, 'Session config');
  return { valid: errors.length === 0, errors };
};