import { validateGraph, validateSessionConfig } from './validation.js';
import type { FleetGraph, FleetSession, NodeResult, SessionConfig, SessionError, SessionStatus } from './types.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const sessionStatuses = new Set(['idle', 'running', 'paused', 'completed', 'failed', 'aborted']);
const nodeStatuses = new Set(['idle', 'queued', 'running', 'done', 'error', 'skipped', 'cancelled']);

const stringify = (value: unknown, label: string): string => {
  try {
    return JSON.stringify(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown serialization error.';
    throw new Error(`Failed to serialize ${label}: ${message}`);
  }
};

const parseJson = (json: string, label: string): unknown => {
  try {
    return JSON.parse(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse error.';
    throw new Error(`Failed to parse ${label}: ${message}`);
  }
};

const validateNodeResult = (value: unknown, key: string): NodeResult => {
  if (!isRecord(value)) {
    throw new Error(`Session result "${key}" must be an object.`);
  }
  if (typeof value.nodeId !== 'string' || value.nodeId.length === 0) {
    throw new Error(`Session result "${key}" must include a non-empty nodeId.`);
  }
  if (typeof value.status !== 'string' || !nodeStatuses.has(value.status)) {
    throw new Error(`Session result "${key}" has an invalid status.`);
  }
  if (typeof value.startedAt !== 'string' || value.startedAt.length === 0) {
    throw new Error(`Session result "${key}" must include startedAt.`);
  }
  if (typeof value.completedAt !== 'undefined' && typeof value.completedAt !== 'string') {
    throw new Error(`Session result "${key}" completedAt must be a string when provided.`);
  }
  if (typeof value.duration !== 'undefined' && !isFiniteNumber(value.duration)) {
    throw new Error(`Session result "${key}" duration must be a finite number when provided.`);
  }
  if (typeof value.issueNumber !== 'undefined' && !isFiniteNumber(value.issueNumber)) {
    throw new Error(`Session result "${key}" issueNumber must be a finite number when provided.`);
  }
  if (typeof value.prNumber !== 'undefined' && !isFiniteNumber(value.prNumber)) {
    throw new Error(`Session result "${key}" prNumber must be a finite number when provided.`);
  }
  if (typeof value.error !== 'undefined' && typeof value.error !== 'string') {
    throw new Error(`Session result "${key}" error must be a string when provided.`);
  }
  return {
    nodeId: value.nodeId,
    status: value.status,
    output: value.output,
    startedAt: value.startedAt,
    completedAt: value.completedAt,
    duration: value.duration,
    issueNumber: value.issueNumber,
    prNumber: value.prNumber,
    error: value.error,
  } as NodeResult;
};

const validateSessionError = (value: unknown, index: number): SessionError => {
  if (!isRecord(value)) {
    throw new Error(`Session error at index ${index} must be an object.`);
  }
  if (typeof value.nodeId !== 'string' || value.nodeId.length === 0) {
    throw new Error(`Session error at index ${index} must include a non-empty nodeId.`);
  }
  if (typeof value.message !== 'string' || value.message.length === 0) {
    throw new Error(`Session error at index ${index} must include a non-empty message.`);
  }
  if (typeof value.code !== 'undefined' && typeof value.code !== 'string') {
    throw new Error(`Session error at index ${index} code must be a string when provided.`);
  }
  if (typeof value.timestamp !== 'string' || value.timestamp.length === 0) {
    throw new Error(`Session error at index ${index} must include timestamp.`);
  }
  if (typeof value.recoverable !== 'boolean') {
    throw new Error(`Session error at index ${index} recoverable must be a boolean.`);
  }
  return {
    nodeId: value.nodeId,
    message: value.message,
    code: value.code,
    timestamp: value.timestamp,
    recoverable: value.recoverable,
  } as SessionError;
};

const toSessionConfig = (value: Record<string, unknown>): SessionConfig => {
  return {
    repo: typeof value.repo === 'string' ? value.repo : undefined,
    branch: typeof value.branch === 'string' ? value.branch : undefined,
    preset: value.preset as SessionConfig['preset'],
    maxConcurrency: value.maxConcurrency as number,
    timeout: value.timeout as number,
    dryRun: value.dryRun as boolean,
    locale: value.locale as SessionConfig['locale'],
  };
};

const buildResultsMap = (value: unknown): Map<string, NodeResult> => {
  if (!Array.isArray(value)) {
    throw new Error('Session results must be an array of [key, value] entries.');
  }

  const entries = value.map((entry, index) => {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
      throw new Error(`Session results entry at index ${index} must be a [string, NodeResult] tuple.`);
    }
    return [entry[0], validateNodeResult(entry[1], entry[0])] as const;
  });

  return new Map(entries);
};

export const serializeGraph = (graph: FleetGraph): string => {
  const result = validateGraph(graph);
  if (!result.valid) {
    throw new Error(`Cannot serialize graph: ${result.errors.join('; ')}`);
  }
  return stringify(graph, 'graph');
};

export const deserializeGraph = (json: string): FleetGraph => {
  const parsed = parseJson(json, 'graph');
  const result = validateGraph(parsed);
  if (!result.valid) {
    throw new Error(`Invalid graph JSON: ${result.errors.join('; ')}`);
  }
  return parsed as FleetGraph;
};

export const serializeSession = (session: FleetSession): string => {
  const graphValidation = validateGraph(session.graph);
  if (!graphValidation.valid) {
    throw new Error(`Cannot serialize session: invalid graph. ${graphValidation.errors.join('; ')}`);
  }
  const configValidation = validateSessionConfig(session.config);
  if (!configValidation.valid) {
    throw new Error(`Cannot serialize session: invalid config. ${configValidation.errors.join('; ')}`);
  }

  const payload = {
    ...session,
    results: Array.from(session.results.entries()),
  };
  return stringify(payload, 'session');
};

export const deserializeSession = (json: string): FleetSession => {
  const parsed = parseJson(json, 'session');
  if (!isRecord(parsed)) {
    throw new Error('Session JSON must deserialize to an object.');
  }
  if (typeof parsed.id !== 'string' || parsed.id.length === 0) {
    throw new Error('Session id must be a non-empty string.');
  }
  if (typeof parsed.status !== 'string' || !sessionStatuses.has(parsed.status)) {
    throw new Error('Session status is invalid.');
  }
  if (typeof parsed.startedAt !== 'undefined' && typeof parsed.startedAt !== 'string') {
    throw new Error('Session startedAt must be a string when provided.');
  }
  if (typeof parsed.completedAt !== 'undefined' && typeof parsed.completedAt !== 'string') {
    throw new Error('Session completedAt must be a string when provided.');
  }
  if (!isFiniteNumber(parsed.currentWave) || parsed.currentWave < 0) {
    throw new Error('Session currentWave must be a non-negative number.');
  }
  if (!isFiniteNumber(parsed.totalWaves) || parsed.totalWaves < 0) {
    throw new Error('Session totalWaves must be a non-negative number.');
  }
  if (!Array.isArray(parsed.errors)) {
    throw new Error('Session errors must be an array.');
  }
  if (!isRecord(parsed.config)) {
    throw new Error('Session config must be an object.');
  }
  if (typeof parsed.graph === 'undefined') {
    throw new Error('Session graph is required.');
  }

  const graph = deserializeGraph(stringify(parsed.graph, 'session graph'));
  const configValidation = validateSessionConfig(parsed.config);
  if (!configValidation.valid) {
    throw new Error(`Session config is invalid: ${configValidation.errors.join('; ')}`);
  }

  const errors = parsed.errors.map((entry, index) => validateSessionError(entry, index));
  const results = buildResultsMap(parsed.results);
  const config = toSessionConfig(parsed.config);

  return {
    id: parsed.id,
    graph,
    status: parsed.status as SessionStatus,
    startedAt: parsed.startedAt,
    completedAt: parsed.completedAt,
    currentWave: parsed.currentWave,
    totalWaves: parsed.totalWaves,
    results,
    errors,
    config,
  };
};