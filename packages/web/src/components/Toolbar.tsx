import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { BookOpen, FolderOpen, Layout, Play, Save, Settings, Square, Zap } from 'lucide-react';

import { GraphExecutor } from '../engine/graph-executor.js';
import { useGraphStore } from '../store/graph-store.js';
import { getLatestSession, saveSessionRecord } from '../store/history.js';
import { useSessionStore } from '../store/session-store.js';
import { useSettingsStore } from '../store/settings-store.js';
import { createStarterTemplate } from '../store/starter-templates.js';
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

  const startRun = (): void => {
    if (nodes.length === 0) return;

    resetSession();
    startSession(graphId, Math.max(nodes.length, 1));

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
      graphId,
      {
        updateNodeStatus: (id, status, progress) => useGraphStore.getState().updateNodeStatus(id, status, progress),
        addLog: (event) => useSessionStore.getState().addLog(event),
        advanceWave: () => useSessionStore.getState().advanceWave(),
        completeSession: () => useSessionStore.getState().completeSession(),
        failSession: (error) => useSessionStore.getState().failSession(error),
        updateEdgeAnimation,
      },
      { providers: useSettingsStore.getState().providers },
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

  return (
    <header className="relative flex h-12 items-center gap-3 border-b border-fleet-border bg-fleet-surface px-3 md:px-4">
      <div className="flex min-w-0 shrink-0 items-center gap-1.5 text-sm font-semibold text-white"><Zap size={14} className="text-fleet-accent" /> CopilotFleet</div>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2 overflow-x-auto">
        <ToolbarButton label={t('toolbar.run')} icon={<Play size={16} />} active={running} tone="success" onClick={startRun} />
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
                loadGraph(createStarterTemplate(option.id));
                setTemplatesOpen(false);
              }}
              className="flex min-h-11 w-full items-center rounded-xl px-3 py-2 text-left text-sm text-fleet-text transition hover:bg-fleet-panel/70"
            >
              {t(option.tKey)}
            </button>
          ))}
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