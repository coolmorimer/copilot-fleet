import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { BookOpen, FolderOpen, Layout, Play, Save, Settings, Square, Zap } from 'lucide-react';

import { GraphExecutor } from '../engine/graph-executor.js';
import { useGraphStore } from '../store/graph-store.js';
import { getLatestSession, saveSessionRecord } from '../store/history.js';
import { useSessionStore } from '../store/session-store.js';
import { useSettingsStore } from '../store/settings-store.js';
import { createAutoTaskTemplate, createStarterTemplate } from '../store/starter-templates.js';
import { useT } from '../i18n/useT.js';

interface ToolbarProps {
  onOpenSettings: () => void;
  onOpenGuide: () => void;
}

const TEMPLATE_OPTIONS = [
  { id: 'quick-fix', tKey: 'toolbar.quickFix' as const },
  { id: 'feature-squad', tKey: 'toolbar.featureSquad' as const },
  { id: 'fullstack-team', tKey: 'toolbar.fullstackTeam' as const },
  { id: 'empty', tKey: 'toolbar.empty' as const },
] as const;

const formatElapsed = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export function Toolbar({ onOpenSettings, onOpenGuide }: ToolbarProps): ReactElement {
  const t = useT();
  const nodes = useGraphStore((state) => state.nodes);
  const graphId = useGraphStore((state) => state.graphId);
  const graphName = useGraphStore((state) => state.graphName);
  const exportGraph = useGraphStore((state) => state.exportGraph);
  const loadGraph = useGraphStore((state) => state.loadGraph);
  const updateNodeStatus = useGraphStore((state) => state.updateNodeStatus);
  const sessionId = useSessionStore((state) => state.sessionId);
  const status = useSessionStore((state) => state.status);
  const startedAt = useSessionStore((state) => state.startedAt);
  const elapsed = useSessionStore((state) => state.elapsed);
  const startSession = useSessionStore((state) => state.startSession);
  const abortSession = useSessionStore((state) => state.abortSession);
  const addLog = useSessionStore((state) => state.addLog);
  const resetSession = useSessionStore((state) => state.reset);
  const updateElapsed = useSessionStore((state) => state.updateElapsed);
  const executorRef = useRef<GraphExecutor>(new GraphExecutor());
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [runPrompt, setRunPrompt] = useState('');
  const [repository, setRepository] = useState('');
  const [repoApiOpen, setRepoApiOpen] = useState(false);
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoError, setRepoError] = useState('');
  const [repoItems, setRepoItems] = useState<Array<{ id: number; full_name: string; private: boolean }>>([]);
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(false);
  const completedCount = nodes.filter((node) => node.data.status === 'done').length;
  const totalCount = nodes.length;
  const running = status === 'running';

  useEffect(() => {
    if (!running || !startedAt) {
      return undefined;
    }

    updateElapsed(Date.now() - Date.parse(startedAt));
    const timer = window.setInterval(() => {
      updateElapsed(Date.now() - Date.parse(startedAt));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [running, startedAt, updateElapsed]);

  const startRun = async (): Promise<void> => {
    const graphStore = useGraphStore.getState();
    let finalPrompt = runPrompt.trim();
    const currentRepo = repository.trim();
    const providers = useSettingsStore.getState().providers;

    if (!finalPrompt) {
      const asked = window.prompt('Опишите задачу одним сообщением. Граф выполнится автоматически.', 'Исправь баг, добавь тесты и подготовь краткий отчёт');
      if (!asked || !asked.trim()) {
        return;
      }
      finalPrompt = asked.trim();
      setRunPrompt(finalPrompt);
    }

    const isDefaultQuickFix = graphStore.graphName === 'Quick Fix' && graphStore.nodes.length <= 3;
    if (graphStore.nodes.length === 0 || isDefaultQuickFix) {
      addLog({
        type: 'log',
        sessionId: graphStore.graphId,
        timestamp: new Date().toISOString(),
        data: { message: 'Формирую команду агентов под задачу…' },
      });
      const graph = await createAutoTaskTemplate(finalPrompt, providers, currentRepo || undefined);
      graphStore.loadGraph(graph);
      addLog({
        type: 'log',
        sessionId: graphStore.graphId,
        timestamp: new Date().toISOString(),
        data: {
          message: `Команда сформирована: ${graph.nodes.filter((n) => n.type === 'agent').map((n) => n.label).join(', ')}`,
        },
      });
    }

    const nodesSnapshot = useGraphStore.getState().nodes;
    if (nodesSnapshot.length === 0) return;

    const activeGraphId = useGraphStore.getState().graphId;
    resetSession();
    startSession(activeGraphId, Math.max(nodesSnapshot.length, 1));

    const currentEdges = useGraphStore.getState().edges;
    const updateEdgeAnimation = (sourceId: string, animated: boolean): void => {
      const { edges: storeEdges } = useGraphStore.getState();
      useGraphStore.setState({
        edges: storeEdges.map((e) =>
          e.source === sourceId ? { ...e, animated, data: { ...e.data, animated } } : e,
        ),
      });
    };

    void executorRef.current.execute(
      useGraphStore.getState().nodes,
      currentEdges,
      activeGraphId,
      {
        updateNodeStatus: (id, status, progress) => useGraphStore.getState().updateNodeStatus(id, status, progress),
        updateNodeData: (id, data) => useGraphStore.getState().updateNodeData(id, data),
        addLog: (event) => useSessionStore.getState().addLog(event),
        addResult: (nodeId, result) => useSessionStore.getState().addResult(nodeId, result),
        advanceWave: () => useSessionStore.getState().advanceWave(),
        completeSession: () => useSessionStore.getState().completeSession(),
        failSession: (error) => useSessionStore.getState().failSession(error),
        updateEdgeAnimation,
      },
      {
        providers,
        runPrompt: finalPrompt,
        repository: currentRepo,
      },
    );
  };

  const stopRun = (): void => {
    executorRef.current.abort();
    abortSession();
    for (const node of nodes.filter((item) => item.data.status === 'running' || item.data.status === 'queued')) {
      updateNodeStatus(node.id, 'cancelled', node.data.progress);
    }
    addLog({ type: 'session:abort', sessionId: sessionId ?? graphId, timestamp: new Date().toISOString(), data: { graphName } });
  };

  const saveGraph = (): void => {
    saveSessionRecord({
      id: crypto.randomUUID(),
      name: graphName,
      createdAt: new Date().toISOString(),
      status: status === 'idle' ? 'saved' : status,
      duration: elapsed,
      graph: exportGraph(),
    });
    addLog({ type: 'log', sessionId: sessionId ?? graphId, timestamp: new Date().toISOString(), data: { action: 'save', graphName } });
  };

  const loadLatest = (): void => {
    const latest = getLatestSession();
    if (!latest) {
      return;
    }
    resetSession();
    loadGraph(latest.graph);
  };

  const fetchRepos = async (): Promise<void> => {
    const token = useSettingsStore.getState().providers.find((p) => p.type === 'github-copilot')?.apiKey;
    if (!token) {
      setRepoError('Добавьте GitHub токен в Настройки → Providers → GitHub Copilot.');
      return;
    }

    setRepoLoading(true);
    setRepoError('');
    try {
      const res = await fetch('/api/proxy/github-api/user/repos?per_page=100&sort=updated', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`GitHub API ${res.status}: ${text || res.statusText}`);
      }
      const data = (await res.json()) as Array<{ id: number; full_name: string; private: boolean }>;
      setRepoItems(data);
    } catch (err) {
      setRepoError(err instanceof Error ? err.message : String(err));
    } finally {
      setRepoLoading(false);
    }
  };

  const createRepo = async (): Promise<void> => {
    const token = useSettingsStore.getState().providers.find((p) => p.type === 'github-copilot')?.apiKey;
    const name = newRepoName.trim();
    if (!token) {
      setRepoError('Добавьте GitHub токен в Настройки → Providers → GitHub Copilot.');
      return;
    }
    if (!name) {
      setRepoError('Введите имя нового репозитория.');
      return;
    }

    setRepoLoading(true);
    setRepoError('');
    try {
      const res = await fetch('/api/proxy/github-api/user/repos', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          private: newRepoPrivate,
          auto_init: true,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`GitHub API ${res.status}: ${text || res.statusText}`);
      }
      const created = (await res.json()) as { full_name?: string };
      if (created.full_name) {
        setRepository(created.full_name);
      }
      setNewRepoName('');
      await fetchRepos();
    } catch (err) {
      setRepoError(err instanceof Error ? err.message : String(err));
    } finally {
      setRepoLoading(false);
    }
  };

  return (
    <header className="relative flex h-12 items-center gap-3 border-b border-fleet-border bg-fleet-surface px-3 md:px-4">
      <div className="flex min-w-0 shrink-0 items-center gap-1.5 text-sm font-semibold text-white"><Zap size={14} className="text-fleet-accent" /> CopilotFleet</div>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2 overflow-x-auto">
        <input
          value={runPrompt}
          onChange={(event) => setRunPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void startRun();
            }
          }}
          placeholder={t('toolbar.promptPlaceholder')}
          className="min-h-11 w-64 min-w-40 rounded-xl border border-fleet-border bg-fleet-panel px-3 text-sm text-fleet-text outline-none placeholder:text-fleet-muted focus:border-fleet-accent"
        />
        <input
          value={repository}
          onChange={(event) => setRepository(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void startRun();
            }
          }}
          placeholder={t('toolbar.repoPlaceholder')}
          className="min-h-11 w-56 min-w-36 rounded-xl border border-fleet-border bg-fleet-panel px-3 text-sm text-fleet-text outline-none placeholder:text-fleet-muted focus:border-fleet-accent"
        />
        <button
          type="button"
          onClick={() => {
            setRepoApiOpen((prev) => !prev);
            if (!repoApiOpen) {
              void fetchRepos();
            }
          }}
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-fleet-border bg-fleet-panel px-3 text-sm text-fleet-text transition hover:border-fleet-accent hover:text-white"
        >
          {t('toolbar.repoApi')}
        </button>
        <ToolbarButton label={t('toolbar.run')} icon={<Play size={16} />} active={running} tone="success" onClick={() => void startRun()} />
        <ToolbarButton label={t('toolbar.stop')} icon={<Square size={16} />} onClick={stopRun} />
        <ToolbarButton label={t('toolbar.save')} icon={<Save size={16} />} onClick={saveGraph} />
        <ToolbarButton label={t('toolbar.load')} icon={<FolderOpen size={16} />} onClick={loadLatest} />
        <ToolbarButton label={t('toolbar.templates')} icon={<Layout size={16} />} onClick={() => setTemplatesOpen((value) => !value)} />
      </div>
      <div className="shrink-0">
        <div className="hidden items-center gap-3 text-xs text-fleet-muted md:flex">
          <div className="truncate rounded-full border border-fleet-border bg-fleet-panel/60 px-3 py-1.5 text-fleet-text">{graphName}</div>
          <div>{formatElapsed(elapsed)}</div>
          <div>{completedCount}/{totalCount || 0}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenGuide}
        className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-fleet-border bg-fleet-panel px-3 text-fleet-text transition hover:border-fleet-accent hover:text-white"
      >
        <BookOpen size={16} />
        <span className="hidden md:inline">{t('toolbar.guide')}</span>
      </button>
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-fleet-border bg-fleet-panel px-3 text-fleet-text transition hover:border-fleet-accent hover:text-white"
      >
        <Settings size={16} />
        <span className="hidden md:inline">{t('toolbar.settings')}</span>
      </button>
      {templatesOpen ? (
        <div className="absolute left-1/2 top-12 z-20 mt-2 w-56 -translate-x-1/2 rounded-2xl border border-fleet-border bg-fleet-surface p-2 shadow-2xl">
          {TEMPLATE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                resetSession();
                loadGraph(createStarterTemplate(option.id, { providers: useSettingsStore.getState().providers }));
                setTemplatesOpen(false);
              }}
              className="flex min-h-11 w-full items-center rounded-xl px-3 py-2 text-left text-sm text-fleet-text transition hover:bg-fleet-panel/70"
            >
              {t(option.tKey)}
            </button>
          ))}
        </div>
      ) : null}
      {repoApiOpen ? (
        <div className="absolute left-1/2 top-12 z-20 mt-2 w-[32rem] -translate-x-1/2 rounded-2xl border border-fleet-border bg-fleet-surface p-3 shadow-2xl">
          <div className="mb-2 text-sm font-semibold text-fleet-text">GitHub API: выбор или создание репозитория</div>
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => void fetchRepos()}
              disabled={repoLoading}
              className="rounded-lg border border-fleet-border bg-fleet-panel px-3 py-2 text-xs text-fleet-text transition hover:border-fleet-accent disabled:opacity-60"
            >
              Обновить список
            </button>
            <button
              type="button"
              onClick={() => setRepoApiOpen(false)}
              className="rounded-lg border border-fleet-border bg-fleet-panel px-3 py-2 text-xs text-fleet-text transition hover:border-fleet-accent"
            >
              Закрыть
            </button>
          </div>

          <div className="mb-3 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-fleet-border bg-fleet-bg/40 p-2">
            {repoLoading ? <div className="text-xs text-fleet-muted">Загрузка репозиториев…</div> : null}
            {!repoLoading && repoItems.length === 0 ? <div className="text-xs text-fleet-muted">Репозитории не найдены.</div> : null}
            {!repoLoading ? repoItems.map((repo) => (
              <button
                key={repo.id}
                type="button"
                onClick={() => {
                  setRepository(repo.full_name);
                  setRepoApiOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-lg border border-fleet-border bg-fleet-panel px-3 py-2 text-left text-xs text-fleet-text transition hover:border-fleet-accent"
              >
                <span>{repo.full_name}</span>
                <span className="text-fleet-muted">{repo.private ? 'private' : 'public'}</span>
              </button>
            )) : null}
          </div>

          <div className="rounded-xl border border-fleet-border bg-fleet-bg/40 p-2">
            <div className="mb-2 text-xs uppercase tracking-[0.14em] text-fleet-muted">Создать новый репозиторий</div>
            <div className="flex items-center gap-2">
              <input
                value={newRepoName}
                onChange={(event) => setNewRepoName(event.target.value)}
                placeholder="new-repository-name"
                className="min-h-10 flex-1 rounded-lg border border-fleet-border bg-fleet-panel px-3 text-xs text-fleet-text outline-none placeholder:text-fleet-muted focus:border-fleet-accent"
              />
              <label className="flex items-center gap-2 rounded-lg border border-fleet-border bg-fleet-panel px-3 py-2 text-xs text-fleet-text">
                <input
                  type="checkbox"
                  checked={newRepoPrivate}
                  onChange={(event) => setNewRepoPrivate(event.target.checked)}
                />
                private
              </label>
              <button
                type="button"
                onClick={() => void createRepo()}
                disabled={repoLoading}
                className="rounded-lg bg-fleet-accent px-3 py-2 text-xs text-white transition hover:brightness-110 disabled:opacity-60"
              >
                Создать
              </button>
            </div>
          </div>

          {repoError ? <div className="mt-2 text-xs text-red-300">{repoError}</div> : null}
        </div>
      ) : null}
    </header>
  );
}

interface ToolbarButtonProps {
  label: string;
  icon: ReactElement;
  onClick: () => void;
  active?: boolean;
  tone?: 'default' | 'success';
}

function ToolbarButton({ label, icon, onClick, active = false, tone = 'default' }: ToolbarButtonProps): ReactElement {
  const toneClass = tone === 'success' ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-fleet-border bg-fleet-panel text-fleet-text';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm transition hover:border-fleet-accent hover:text-white ${toneClass} ${active ? 'animate-pulse' : ''}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}