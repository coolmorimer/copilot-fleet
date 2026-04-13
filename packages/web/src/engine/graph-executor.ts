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
import { analyzeRepo } from './repo-analyzer.js';

/* ── Types ────────────────────────────────────────────── */

export interface ExecutionCallbacks {
  updateNodeStatus: (id: string, status: FleetNodeData['status'], progress?: number) => void;
  updateNodeData: (id: string, data: Partial<FleetNodeData>) => void;
  addLog: (event: FleetEvent) => void;
  addResult: (nodeId: string, result: { nodeId: string; status: FleetNodeData['status']; output?: unknown; startedAt: string; completedAt?: string; duration?: number; error?: string }) => void;
  advanceWave: () => void;
  completeSession: () => void;
  failSession: (error: string) => void;
  updateEdgeAnimation: (sourceId: string, animated: boolean) => void;
}

export interface ExecutionContext {
  /** Provider configs from settings store. */
  providers: ProviderConfig[];
  /** Free-form task prompt entered by the user before run. */
  runPrompt?: string;
  /** Optional repository target entered by the user. */
  repository?: string;
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

function isReasoningModel(model: string): boolean {
  return /^o[0-9]/.test(model);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampForPrompt(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const head = Math.floor(maxChars * 0.65);
  const tail = Math.max(400, maxChars - head - 120);
  return [
    value.slice(0, head),
    '\n\n...[input trimmed to fit model limits]...\n\n',
    value.slice(Math.max(0, value.length - tail)),
  ].join('');
}

/* ── Executor ─────────────────────────────────────────── */

export class GraphExecutor {
  private controller: AbortController | null = null;
  private results = new Map<string, string>();
  private responses = new Map<string, LLMResponse>();
  private skipped = new Set<string>();
  private runPrompt = '';
  private repository = '';
  private repoContext = '';

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
    this.runPrompt = (ctx.runPrompt ?? '').trim();
    this.repository = (ctx.repository ?? '').trim();
    this.repoContext = '';
    const signal = this.controller.signal;

    // Analyze existing repository before execution starts
    if (this.repository) {
      const token = ctx.providers.find((p) => p.type === 'github-copilot')?.apiKey
        ?? ctx.providers.find((p) => p.apiKey)?.apiKey;
      if (token) {
        cb.addLog(ev('log', sessionId, { message: `Анализирую репозиторий ${this.repository}…` }));
        const analysis = await analyzeRepo(this.repository, 'main', token);
        if (analysis) {
          this.repoContext = analysis.context;
          const fileCount = analysis.tree.filter((e) => e.type === 'blob').length;
          cb.addLog(ev('log', sessionId, {
            message: `Репозиторий проанализирован: ${fileCount} файлов, ${analysis.keyFiles.size} ключевых файлов загружено`,
          }));
        } else {
          cb.addLog(ev('log', sessionId, { message: 'Репозиторий пуст или недоступен — будет создан с нуля' }));
        }
      }
    }

    const waves = computeWaves(nodes, edges);
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    let hasErrors = false;

    cb.addLog(ev('session:start', sessionId, { nodeCount: nodes.length, waves: waves.length }));
    cb.addLog(ev('log', sessionId, {
      message: 'Session input prepared',
      prompt: this.runPrompt || '(empty)',
      repository: this.repository || '(not specified)',
    }));

    for (const n of nodes) {
      cb.updateNodeStatus(n.id, n.data.nodeType === 'trigger' ? 'running' : 'queued', 0);
    }

    for (let wi = 0; wi < waves.length; wi++) {
      if (signal.aborted) break;

      const wave = waves[wi];
      cb.addLog(ev('wave:start', sessionId, { wave: wi, nodeIds: wave }));

      // Stagger agent nodes within a wave to avoid simultaneous rate-limit hits.
      // Non-agent nodes start immediately; each agent gets an extra delay.
      const agentIds = wave.filter((wid) => {
        const n = nodeMap.get(wid);
        return n && (n.data.nodeType === 'agent' || n.data.nodeType === 'llm');
      });

      await Promise.all(
        wave.map(async (id, _idx) => {
          const node = nodeMap.get(id);
          if (!node) return;

          // Stagger parallel agent starts by 1.5s each to spread rate-limit window
          if (agentIds.length > 1 && agentIds.includes(id)) {
            const staggerIdx = agentIds.indexOf(id);
            if (staggerIdx > 0) await sleep(staggerIdx * 1500);
          }

          const startedAt = new Date().toISOString();
          const startedMs = Date.now();
          try {
            await this.executeNode(node, edges, sessionId, signal, cb, ctx);
            cb.addResult(id, {
              nodeId: id,
              status: 'done',
              output: this.results.get(id),
              startedAt,
              completedAt: new Date().toISOString(),
              duration: Date.now() - startedMs,
            });
          } catch (err) {
            hasErrors = true;
            const msg = err instanceof Error ? err.message : String(err);
            const fallbackInput = this.gatherInput(id, edges);
            if (fallbackInput) {
              this.results.set(id, fallbackInput);
            } else {
              this.results.set(id, `[${node.data.label}] failed: ${msg}`);
            }
            cb.updateNodeStatus(id, 'error', 100);
            cb.updateNodeData(id, {
              error: msg,
              config: {
                ...node.data.config,
                lastError: msg,
                lastOutput: this.results.get(id) ?? '',
                lastOutputSummary: preview(this.results.get(id) ?? '', 220),
                lastUpdatedAt: new Date().toISOString(),
              },
            });
            cb.updateEdgeAnimation(id, false);
            cb.addLog(ev('node:error', sessionId, { nodeId: id, label: node.data.label, error: msg }));
            cb.addResult(id, {
              nodeId: id,
              status: 'error',
              output: this.results.get(id),
              startedAt,
              completedAt: new Date().toISOString(),
              duration: Date.now() - startedMs,
              error: msg,
            });
            cb.addLog(ev('log', sessionId, {
              nodeId: id,
              message: 'Node failed, propagated fallback output to keep downstream flow running',
            }));
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
      cb.addResult(id, {
        nodeId: id,
        status: 'skipped',
        output: '[Skipped by graph control flow]',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        duration: 0,
      });
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
        cb.addResult(id, {
          nodeId: id,
          status: 'skipped',
          output: '[Skipped: all predecessors skipped]',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          duration: 0,
        });
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

    const rawInput = this.gatherInput(id, edges);
    const input = this.prepareInputForNode(data, rawInput);

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

  private prepareInputForNode(data: FleetNodeData, input: string): string {
    if (!input) return input;

    const config = data.config ?? {};
    const model = String(config.model ?? '');
    const fromConfig = typeof config.maxInputChars === 'number' ? config.maxInputChars : undefined;

    // Reasoning models (o1/o3/...) have tighter request-body limits on some providers.
    const defaultLimit = isReasoningModel(model) ? 12000 : 24000;
    const maxChars = Math.max(2000, fromConfig ?? defaultLimit);

    return clampForPrompt(input, maxChars);
  }

  /* ── Node type executors ────────────────────────────── */

  private executeTrigger(id: string, data: FleetNodeData, sessionId: string, cb: ExecutionCallbacks): void {
    cb.updateNodeStatus(id, 'running', 50);
    const manualPrompt = String(data.config?.prompt ?? '').trim();
    const finalPrompt = this.runPrompt || manualPrompt;

    const lines = [`[Trigger: ${data.label}] Execution started.`];
    if (this.repository) {
      lines.push(`Repository: ${this.repository}`);
    }
    if (finalPrompt) {
      lines.push('', 'User task:', finalPrompt);
    }
    if (this.repoContext) {
      lines.push('', this.repoContext);
    }

    this.results.set(id, lines.join('\n'));
    cb.updateNodeStatus(id, 'done', 100);
    cb.addLog(ev('node:complete', sessionId, {
      nodeId: id,
      label: data.label,
      output: finalPrompt ? 'Trigger activated with user task' : 'Trigger activated',
    }));
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

    // Build a retry chain: primary model, then fallback models (same provider),
    // then models on other providers. Each attempt waits before retrying.
    const fallbackModels = pickFallbackModels(provider, model);
    const otherProviders = ctx.providers.filter(
      (p) => p.apiKey && p.name !== provider.name && p.type !== provider.type,
    );
    const attempts: Array<{ prov: ProviderConfig; mod: string }> = [
      { prov: provider, mod: model },
      ...fallbackModels.map((m) => ({ prov: provider, mod: m })),
      ...otherProviders.flatMap((p) => (p.models ?? []).slice(0, 2).map((m) => ({ prov: p, mod: m }))),
    ];

    let response: LLMResponse | undefined;
    let lastError: unknown;
    const rateLimitedProviders = new Set<string>();

    for (let attempt = 0; attempt < attempts.length; attempt++) {
      if (signal.aborted) break;
      const { prov, mod } = attempts[attempt];

      // Skip attempts on providers already known to be rate-limited (unless it's the only one)
      if (rateLimitedProviders.has(prov.type) && attempt > 0) {
        const hasOtherProvider = attempts.slice(attempt + 1).some((a) => !rateLimitedProviders.has(a.prov.type));
        if (hasOtherProvider) continue;
      }

      // After the first attempt, wait before retrying (increasing backoff)
      if (attempt > 0) {
        const waitSec = Math.min(4 + attempt * 3, 20);
        cb.addLog(ev('log', sessionId, {
          nodeId: id,
          message: `↻ Retry ${attempt}/${attempts.length - 1}: waiting ${waitSec}s, then trying ${prov.type}/${mod}`,
        }));
        await sleep(waitSec * 1000);
        if (signal.aborted) break;
      }

      try {
        const msgContent = attempt === 0 ? userMessage : clampForPrompt(userMessage, 5200);
        response = await complete({
          provider: prov,
          model: mod,
          messages: [{ role: 'user', content: msgContent }],
          systemPrompt,
          temperature,
          maxTokens: attempt === 0 ? maxTokens : Math.min(maxTokens, 3200),
          signal,
        });
        break; // success
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        const isRateOrLimit = msg.includes('429') || msg.includes('tokens_limit_reached') || msg.toLowerCase().includes('rate');
        // Only continue retrying for rate/limit errors; other errors bubble up immediately
        if (!isRateOrLimit) throw err;

        // Parse Retry-After header if present and schedule extra wait
        const retryMatch = msg.match(/Retry-After:\s*(\d+)/i);
        const retryAfterSec = retryMatch ? parseInt(retryMatch[1], 10) : 0;
        if (retryAfterSec > 0 && attempt < attempts.length - 1) {
          const extraWait = Math.min(retryAfterSec, 30);
          cb.addLog(ev('log', sessionId, {
            nodeId: id,
            message: `⏳ API requested ${retryAfterSec}s cooldown, waiting ${extraWait}s...`,
          }));
          await sleep(extraWait * 1000);
        }

        // Mark this provider as rate-limited; skip subsequent attempts on the same provider type
        rateLimitedProviders.add(prov.type);
      }
    }

    if (!response) {
      throw lastError ?? new Error('All retry attempts exhausted');
    }

    cb.updateNodeStatus(id, 'running', 90);

    this.results.set(id, response.content);
    this.responses.set(id, response);
    cb.updateNodeData(id, {
      config: {
        ...data.config,
        lastModel: response.model,
        lastTokens: response.usage.totalTokens,
        lastOutput: response.content,
        lastOutputSummary: preview(response.content, 240),
        lastUpdatedAt: new Date().toISOString(),
      },
    });

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

    const merged = inputs.length > 0
      ? inputs
        .map((chunk, idx) => `### Contribution ${idx + 1}\n${clampForPrompt(chunk, 2200)}`)
        .join('\n\n---\n\n')
      : '[No input received]';
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
    const instruction = String(data.config?.instruction ?? data.config?.prompt ?? 'Requires human approval');
    const message = [instruction, '', 'Input:', input || '(empty)', '', 'Введите ответ или оставьте пустым для подтверждения входа как есть:'].join('\n');

    let userReply: string | null = null;
    if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
      userReply = window.prompt(message, input || '');
    }

    const approved = userReply === null ? input || '[Human step cancelled]' : (userReply.trim() || input || '[Approved]');
    this.results.set(id, approved);
    cb.updateNodeStatus(id, 'done', 100);
    cb.addLog(ev('node:complete', sessionId, {
      nodeId: id,
      label: data.label,
      humanPrompt: instruction,
      action: userReply === null ? 'cancelled' : 'provided-input',
      message: userReply === null
        ? 'Human node cancelled, fallback value propagated'
        : 'Human input collected and propagated',
    }));
  }

  private executeTool(id: string, data: FleetNodeData, input: string, sessionId: string, cb: ExecutionCallbacks): void {
    cb.updateNodeStatus(id, 'running', 50);
    const toolName = String(data.config?.toolName ?? 'unknown');
    const message = [
      `Tool step: ${toolName}`,
      '',
      'Вставьте результат выполнения инструмента (или оставьте пустым, чтобы передать вход дальше).',
      '',
      'Input:',
      input || '(empty)',
    ].join('\n');

    let toolOutput: string | null = null;
    if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
      toolOutput = window.prompt(message, input || '');
    }

    const finalOutput = toolOutput === null ? input || `[Tool: ${toolName}] cancelled` : (toolOutput.trim() || input || `[Tool: ${toolName}] empty output`);
    this.results.set(id, finalOutput);
    cb.updateNodeStatus(id, 'done', 100);
    cb.addLog(ev('node:complete', sessionId, {
      nodeId: id,
      label: data.label,
      tool: toolName,
      message: toolOutput === null
        ? `Tool "${toolName}" cancelled by user, fallback propagated`
        : `Tool "${toolName}" output collected from user input`,
    }));
  }

  private executeOutput(id: string, data: FleetNodeData, input: string, sessionId: string, cb: ExecutionCallbacks): void {
    cb.updateNodeStatus(id, 'running', 50);
    const outputCore = input || '[No input received]';
    const mergeDraft = this.repository
      ? [
          '---',
          '## Merge Request Draft',
          `Repository: ${this.repository}`,
          `Title: feat: auto-generated delivery for ${this.runPrompt || 'task'}`,
          '',
          'Summary:',
          preview(outputCore, 1200),
          '',
          'Checklist:',
          '- [ ] Review generated artifacts',
          '- [ ] Run tests locally',
          '- [ ] Confirm acceptance criteria',
        ].join('\n')
      : '';
    const output = mergeDraft ? `${outputCore}\n\n${mergeDraft}` : outputCore;
    this.results.set(id, output);
    cb.updateNodeData(id, {
      config: {
        ...data.config,
        result: output,
        resultSummary: preview(output, 260),
        mergeRequestDraft: mergeDraft,
        lastUpdatedAt: new Date().toISOString(),
      },
    });
    cb.updateNodeStatus(id, 'done', 100);
    cb.addLog(ev('node:complete', sessionId, {
      nodeId: id,
      label: data.label,
      nodeType: 'output',
      output,
    }));
    if (mergeDraft) {
      cb.addLog(ev('log', sessionId, {
        nodeId: id,
        message: 'Merge request draft prepared from final output',
      }));
    }
  }
}

function pickFallbackModels(provider: ProviderConfig, currentModel: string, max = 3): string[] {
  const models = Array.from(new Set([...(provider.models ?? []), ...(provider.defaultModel ? [provider.defaultModel] : [])]));
  if (models.length === 0) return [];

  const priorities = ['gpt-4o', 'gpt-4.1', 'claude-sonnet-4', 'gpt-4o-mini', 'gpt-4.1-mini', 'o4-mini', 'o3', 'gpt-4.1-nano'];
  const result: string[] = [];

  for (const p of priorities) {
    if (result.length >= max) break;
    const found = models.find((m) => m.toLowerCase() === p.toLowerCase() || m.toLowerCase().includes(p.toLowerCase()));
    if (found && found !== currentModel && !result.includes(found)) result.push(found);
  }

  // Fill remaining slots with any different models
  for (const m of models) {
    if (result.length >= max) break;
    if (m !== currentModel && !result.includes(m)) result.push(m);
  }

  return result;
}

function preview(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
