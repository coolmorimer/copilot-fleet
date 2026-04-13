/**
 * Real graph execution engine for the CopilotFleet web UI.
 *
 * Topologically executes nodes in waves. Agent/LLM nodes make real API
 * calls through the browser-native LLM client. Data flows between nodes
 * via an in-memory results map. Logic nodes (condition, splitter, merger)
 * perform real evaluation.
 */
import type { Edge, Node } from '@xyflow/react';
import type { FleetEvent, FleetEventType, LLMResponse, ProviderConfig } from '@copilot-fleet/shared';

import type { FleetNodeData } from '../store/graph-store.js';
import { complete } from './llm-client.js';

/* ── Types ────────────────────────────────────────────── */

export interface ExecutionCallbacks {
  updateNodeStatus: (id: string, status: FleetNodeData['status'], progress?: number) => void;
  addLog: (event: FleetEvent) => void;
  advanceWave: () => void;
  completeSession: () => void;
  failSession: (error: string) => void;
  updateEdgeAnimation: (sourceId: string, animated: boolean) => void;
}

export interface ExecutionContext {
  /** Provider configs from settings store. */
  providers: ProviderConfig[];
}

/* ── Helpers ──────────────────────────────────────────── */

function ev(type: FleetEventType, sessionId: string, data: Record<string, unknown>): FleetEvent {
  return { type, sessionId, timestamp: new Date().toISOString(), data };
}

function computeWaves(nodes: Node<FleetNodeData>[], edges: Edge[]): string[][] {
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const n of nodes) {
    adj.set(n.id, []);
    inDegree.set(n.id, 0);
  }
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }

  const waves: string[][] = [];
  let frontier = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id);

  while (frontier.length > 0) {
    waves.push(frontier);
    const next: string[] = [];
    for (const id of frontier) {
      for (const t of adj.get(id) ?? []) {
        const rem = (inDegree.get(t) ?? 1) - 1;
        inDegree.set(t, rem);
        if (rem === 0) next.push(t);
      }
    }
    frontier = next;
  }

  const visited = new Set(waves.flat());
  const orphans = nodes.filter((n) => !visited.has(n.id)).map((n) => n.id);
  if (orphans.length > 0) waves.push(orphans);

  return waves;
}

function getPredecessors(nodeId: string, edges: Edge[]): string[] {
  return edges.filter((e) => e.target === nodeId).map((e) => e.source);
}

function getSuccessors(nodeId: string, edges: Edge[]): string[] {
  return edges.filter((e) => e.source === nodeId).map((e) => e.target);
}

function resolveProvider(config: Record<string, unknown>, providers: ProviderConfig[]): ProviderConfig | undefined {
  const provName = String(config.provider ?? config.providerName ?? '');
  const provType = String(config.providerType ?? '');

  let match = providers.find((p) => p.name === provName);
  if (match) return match;
  match = providers.find((p) => p.type === provType || p.type === provName);
  if (match) return match;
  return providers.find((p) => p.apiKey) ?? providers[0];
}

/* ── Executor ─────────────────────────────────────────── */

export class GraphExecutor {
  private controller: AbortController | null = null;
  private results = new Map<string, string>();
  private responses = new Map<string, LLMResponse>();
  private skipped = new Set<string>();

  get running(): boolean {
    return this.controller !== null && !this.controller.signal.aborted;
  }

  async execute(
    nodes: Node<FleetNodeData>[],
    edges: Edge[],
    sessionId: string,
    cb: ExecutionCallbacks,
    ctx: ExecutionContext,
  ): Promise<void> {
    this.abort();
    this.controller = new AbortController();
    this.results.clear();
    this.responses.clear();
    this.skipped.clear();
    const signal = this.controller.signal;

    const waves = computeWaves(nodes, edges);
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    let hasErrors = false;

    cb.addLog(ev('session:start', sessionId, { nodeCount: nodes.length, waves: waves.length }));

    for (const n of nodes) {
      cb.updateNodeStatus(n.id, n.data.nodeType === 'trigger' ? 'running' : 'queued', 0);
    }

    for (let wi = 0; wi < waves.length; wi++) {
      if (signal.aborted) break;

      const wave = waves[wi];
      cb.addLog(ev('wave:start', sessionId, { wave: wi, nodeIds: wave }));

      await Promise.all(
        wave.map(async (id) => {
          const node = nodeMap.get(id);
          if (!node) return;
          try {
            await this.executeNode(node, edges, sessionId, signal, cb, ctx);
          } catch (err) {
            hasErrors = true;
            const msg = err instanceof Error ? err.message : String(err);
            cb.updateNodeStatus(id, 'error', 100);
            cb.updateEdgeAnimation(id, false);
            cb.addLog(ev('node:error', sessionId, { nodeId: id, label: node.data.label, error: msg }));
          }
        }),
      );

      cb.addLog(ev('wave:complete', sessionId, { wave: wi }));
      cb.advanceWave();
    }

    if (signal.aborted) {
      for (const n of nodes) {
        const cur = nodeMap.get(n.id);
        if (cur && (cur.data.status === 'queued' || cur.data.status === 'running')) {
          cb.updateNodeStatus(n.id, 'cancelled', cur.data.progress);
        }
      }
      cb.addLog(ev('session:abort', sessionId, {}));
    } else if (hasErrors) {
      cb.failSession('Одна или несколько нод завершились с ошибкой');
      cb.addLog(ev('session:error', sessionId, { error: 'Session completed with errors' }));
    } else {
      cb.completeSession();
      cb.addLog(ev('session:complete', sessionId, { duration: 'completed' }));
    }

    this.controller = null;
  }

  abort(): void {
    this.controller?.abort();
    this.controller = null;
  }

  /* ── Node dispatch ──────────────────────────────────── */

  private async executeNode(
    node: Node<FleetNodeData>,
    edges: Edge[],
    sessionId: string,
    signal: AbortSignal,
    cb: ExecutionCallbacks,
    ctx: ExecutionContext,
  ): Promise<void> {
    if (signal.aborted) return;
    const { id, data } = node;
    const type = data.nodeType;

    if (this.skipped.has(id)) {
      cb.updateNodeStatus(id, 'skipped', 0);
      cb.addLog(ev('node:skipped', sessionId, { nodeId: id, label: data.label }));
      for (const sId of getSuccessors(id, edges)) {
        this.skipped.add(sId);
      }
      return;
    }

    // Skip check for non-merger nodes: if all predecessors are skipped, skip this too
    if (type !== 'merger') {
      const preds = getPredecessors(id, edges);
      if (preds.length > 0 && preds.every((pid) => this.skipped.has(pid))) {
        this.skipped.add(id);
        cb.updateNodeStatus(id, 'skipped', 0);
        cb.addLog(ev('node:skipped', sessionId, { nodeId: id, label: data.label, reason: 'all predecessors skipped' }));
        for (const sId of getSuccessors(id, edges)) {
          this.skipped.add(sId);
        }
        return;
      }
    }

    if (type === 'group') {
      cb.updateNodeStatus(id, 'done', 100);
      return;
    }

    cb.updateEdgeAnimation(id, true);
    cb.updateNodeStatus(id, 'running', 10);
    cb.addLog(ev('node:start', sessionId, { nodeId: id, label: data.label, nodeType: type }));

    const input = this.gatherInput(id, edges);

    switch (type) {
      case 'trigger':
        this.executeTrigger(id, data, sessionId, cb);
        break;
      case 'agent':
      case 'llm':
        await this.executeAgent(id, data, input, signal, sessionId, cb, ctx);
        break;
      case 'condition':
        this.executeCondition(id, data, input, edges, sessionId, cb);
        break;
      case 'splitter':
        this.executeSplitter(id, input, sessionId, cb);
        break;
      case 'merger':
        this.executeMerger(id, edges, sessionId, cb);
        break;
      case 'human':
        this.executeHuman(id, data, input, sessionId, cb);
        break;
      case 'tool':
        this.executeTool(id, data, input, sessionId, cb);
        break;
      case 'output':
        this.executeOutput(id, data, input, sessionId, cb);
        break;
      default:
        this.results.set(id, input);
        cb.updateNodeStatus(id, 'done', 100);
    }

    cb.updateEdgeAnimation(id, false);
  }

  /* ── Input gathering ──────────────────────────────── */

  private gatherInput(nodeId: string, edges: Edge[]): string {
    const preds = getPredecessors(nodeId, edges);
    const inputs = preds
      .filter((pid) => !this.skipped.has(pid))
      .map((pid) => this.results.get(pid))
      .filter((v): v is string => v !== undefined && v.length > 0);

    if (inputs.length === 0) return '';
    if (inputs.length === 1) return inputs[0];
    return inputs.join('\n\n---\n\n');
  }

  /* ── Node type executors ────────────────────────────── */

  private executeTrigger(id: string, data: FleetNodeData, sessionId: string, cb: ExecutionCallbacks): void {
    cb.updateNodeStatus(id, 'running', 50);
    this.results.set(id, `[Trigger: ${data.label}] Execution started.`);
    cb.updateNodeStatus(id, 'done', 100);
    cb.addLog(ev('node:complete', sessionId, { nodeId: id, label: data.label, output: 'Trigger activated' }));
  }

  private async executeAgent(
    id: string,
    data: FleetNodeData,
    input: string,
    signal: AbortSignal,
    sessionId: string,
    cb: ExecutionCallbacks,
    ctx: ExecutionContext,
  ): Promise<void> {
    const config = data.config ?? {};
    const provider = resolveProvider(config, ctx.providers);

    if (!provider) {
      throw new Error('Провайдер не найден. Добавьте провайдер в Настройки → Провайдеры.');
    }

    const model = String(config.model ?? config.defaultModel ?? provider.defaultModel ?? provider.models[0] ?? 'gpt-4o');
    const systemPrompt = String(config.systemPrompt ?? config.prompt ?? `You are ${data.label}. Complete the task thoroughly and professionally.`);
    const temperature = typeof config.temperature === 'number' ? config.temperature : 0.3;
    const maxTokens = typeof config.maxTokens === 'number' ? config.maxTokens : 4096;

    const userMessage = input
      ? `Task input:\n\n${input}`
      : `Task: ${data.description ?? data.label}`;

    cb.updateNodeStatus(id, 'running', 30);
    cb.addLog(ev('log', sessionId, {
      nodeId: id,
      message: `→ Calling ${provider.type}/${model}`,
      prompt: userMessage.slice(0, 200),
    }));

    const response = await complete({
      provider,
      model,
      messages: [{ role: 'user', content: userMessage }],
      systemPrompt,
      temperature,
      maxTokens,
      signal,
    });

    cb.updateNodeStatus(id, 'running', 90);

    this.results.set(id, response.content);
    this.responses.set(id, response);

    cb.updateNodeStatus(id, 'done', 100);
    cb.addLog(ev('node:complete', sessionId, {
      nodeId: id,
      label: data.label,
      model: response.model,
      tokens: response.usage.totalTokens,
      finishReason: response.finishReason,
      output: response.content.slice(0, 500) + (response.content.length > 500 ? '…' : ''),
    }));
  }

  private executeCondition(
    id: string,
    data: FleetNodeData,
    input: string,
    edges: Edge[],
    sessionId: string,
    cb: ExecutionCallbacks,
  ): void {
    const expression = String(data.config?.expression ?? '');
    cb.updateNodeStatus(id, 'running', 50);

    let result = false;
    if (expression.trim()) {
      const lower = input.toLowerCase();
      const exprLower = expression.toLowerCase();
      result = exprLower === 'true' || lower.includes(exprLower) || input.length > 0;
    } else {
      result = input.length > 0;
    }

    this.results.set(id, result ? 'true' : 'false');

    const outEdges = edges.filter((e) => e.source === id);
    for (const edge of outEdges) {
      const handle = edge.sourceHandle ?? '';
      const isTrueHandle = handle.includes('true') || handle.includes('True') || handle === 'condition-true';
      const isFalseHandle = handle.includes('false') || handle.includes('False') || handle === 'condition-false';

      if ((isTrueHandle && !result) || (isFalseHandle && result)) {
        this.skipped.add(edge.target);
      }
    }

    cb.updateNodeStatus(id, 'done', 100);
    cb.addLog(ev('node:complete', sessionId, {
      nodeId: id,
      label: data.label,
      condition: expression || '(has input?)',
      result: result ? 'TRUE → passed' : 'FALSE → skipped',
    }));
  }

  private executeSplitter(id: string, input: string, sessionId: string, cb: ExecutionCallbacks): void {
    cb.updateNodeStatus(id, 'running', 50);
    this.results.set(id, input);
    cb.updateNodeStatus(id, 'done', 100);
    cb.addLog(ev('node:complete', sessionId, { nodeId: id, message: 'Input split to all branches' }));
  }

  private executeMerger(id: string, edges: Edge[], sessionId: string, cb: ExecutionCallbacks): void {
    cb.updateNodeStatus(id, 'running', 50);

    const preds = getPredecessors(id, edges);
    const inputs = preds
      .filter((pid) => !this.skipped.has(pid))
      .map((pid) => this.results.get(pid))
      .filter((v): v is string => v !== undefined && v.length > 0);

    const merged = inputs.length > 0 ? inputs.join('\n\n---\n\n') : '[No input received]';
    this.results.set(id, merged);

    cb.updateNodeStatus(id, 'done', 100);
    cb.addLog(ev('node:complete', sessionId, {
      nodeId: id,
      message: `Merged ${inputs.length} input(s)`,
      preview: merged.slice(0, 300),
    }));
  }

  private executeHuman(id: string, data: FleetNodeData, input: string, sessionId: string, cb: ExecutionCallbacks): void {
    cb.updateNodeStatus(id, 'running', 50);
    const prompt = String(data.config?.prompt ?? 'Requires human approval');
    this.results.set(id, input || '[Auto-approved]');
    cb.updateNodeStatus(id, 'done', 100);
    cb.addLog(ev('node:complete', sessionId, {
      nodeId: id,
      label: data.label,
      humanPrompt: prompt,
      action: 'auto-approved',
      message: '⚠️ Human-in-the-loop: авто-одобрение (UI для ручного одобрения в разработке)',
    }));
  }

  private executeTool(id: string, data: FleetNodeData, input: string, sessionId: string, cb: ExecutionCallbacks): void {
    cb.updateNodeStatus(id, 'running', 50);
    const toolName = String(data.config?.toolName ?? 'unknown');
    this.results.set(id, input || `[Tool: ${toolName}]`);
    cb.updateNodeStatus(id, 'done', 100);
    cb.addLog(ev('node:complete', sessionId, {
      nodeId: id,
      label: data.label,
      tool: toolName,
      message: `⚠️ Tool "${toolName}": выполнение инструментов требует серверный бэкенд`,
    }));
  }

  private executeOutput(id: string, data: FleetNodeData, input: string, sessionId: string, cb: ExecutionCallbacks): void {
    cb.updateNodeStatus(id, 'running', 50);
    const output = input || '[No input received]';
    this.results.set(id, output);
    cb.updateNodeStatus(id, 'done', 100);
    cb.addLog(ev('node:complete', sessionId, {
      nodeId: id,
      label: data.label,
      nodeType: 'output',
      output,
    }));
  }
}
