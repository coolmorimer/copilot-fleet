import { useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Download, ExternalLink, Info, Monitor, XCircle } from 'lucide-react';

import { useSessionStore } from '../store/session-store.js';
import { useSettingsStore } from '../store/settings-store.js';
import { useT } from '../i18n/useT.js';
import { publishRunToRepo } from '../engine/repo-publisher.js';

interface ConsoleProps {
  height: number;
  onResize: (height: number) => void;
}

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 420;
const FILTERS = ['all', 'info', 'success', 'error'] as const;

type ConsoleFilter = (typeof FILTERS)[number];

const clamp = (value: number): number => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, value));

const getLogTone = (type: string): { icon: ReactNode; className: string; filter: Exclude<ConsoleFilter, 'all'> } => {
  if (type.includes('error') || type.includes('abort')) {
    return { icon: <AlertCircle size={14} />, className: 'border-red-500/40 bg-red-500/10 text-red-100', filter: 'error' };
  }
  if (type.includes('complete')) {
    return { icon: <CheckCircle2 size={14} />, className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100', filter: 'success' };
  }
  return { icon: <Info size={14} />, className: 'border-fleet-border bg-fleet-bg/40 text-fleet-text', filter: 'info' };
};

export function Console({ height, onResize }: ConsoleProps): ReactElement {
  const t = useT();
  const logs = useSessionStore((state) => state.logs);
  const errors = useSessionStore((state) => state.errors);
  const results = useSessionStore((state) => state.results);
  const clearConsole = useSessionStore((state) => state.clearConsole);
  const providers = useSettingsStore((state) => state.providers);
  const [isDragging, setIsDragging] = useState(false);
  const [filter, setFilter] = useState<ConsoleFilter>('all');
  const [publishing, setPublishing] = useState(false);
  const [publishInfo, setPublishInfo] = useState<string>('');
  const startY = useRef(0);
  const startHeight = useRef(height);
  const logRef = useRef<HTMLDivElement | null>(null);

  const renderedLogs = [
    ...logs.map((event) => ({
      key: `${event.timestamp}-${event.type}`,
      timestamp: event.timestamp,
      title: event.type,
      body: JSON.stringify(event.data, null, 2),
      ...getLogTone(event.type),
    })),
    ...errors.map((error) => ({
      key: `${error.timestamp}-${error.nodeId}`,
      timestamp: error.timestamp,
      title: `node:error:${error.nodeId}`,
      body: error.message,
      icon: <XCircle size={14} />,
      className: 'border-red-500/40 bg-red-500/10 text-red-100',
      filter: 'error' as const,
    })),
  ].filter((entry) => filter === 'all' || entry.filter === filter);

  useEffect(() => {
    if (!isDragging) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent): void => {
      const nextHeight = clamp(startHeight.current - (event.clientY - startY.current));
      onResize(nextHeight);
    };

    const handlePointerUp = (): void => {
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, onResize]);

  useEffect(() => {
    if (!logRef.current) {
      return;
    }

    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [renderedLogs.length]);

  const resultEntries = Array.from(results.entries()).map(([nodeId, value]) => ({ ...value, nodeId }));

  const latestSessionInput = [...logs].reverse().find((event) => {
    if (event.type !== 'log') return false;
    return event.data.message === 'Session input prepared';
  });

  const repository = typeof latestSessionInput?.data.repository === 'string' ? latestSessionInput.data.repository : '';

  const openInVSCode = (): void => {
    if (!repository) return;
    window.open(`vscode://vscode.git/clone?url=${encodeURIComponent(`https://github.com/${repository}.git`)}`, '_self');
  };

  const downloadZip = (): void => {
    if (!repository) return;
    window.open(`https://github.com/${repository}/archive/refs/heads/main.zip`, '_blank');
  };

  const openCodespaces = (): void => {
    if (!repository) return;
    const [owner, repo] = repository.split('/');
    window.open(`https://github.com/codespaces/new?repo=${encodeURIComponent(`${owner}/${repo}`)}&ref=main`, '_blank');
  };

  const publishToRepo = async (): Promise<void> => {
    const taskPrompt = typeof latestSessionInput?.data.prompt === 'string' ? latestSessionInput.data.prompt : '';
    const token = providers.find((p) => p.type === 'github-copilot')?.apiKey;

    if (!repository || repository === '(not specified)') {
      setPublishInfo('Не указан repository в запуске.');
      return;
    }
    if (!token) {
      setPublishInfo('Нет GitHub токена в настройках провайдера github-copilot.');
      return;
    }
    if (results.size === 0) {
      setPublishInfo('Нет результатов для публикации.');
      return;
    }

    setPublishing(true);
    setPublishInfo('');
    try {
      const result = await publishRunToRepo(
        results,
        repository,
        'main',
        taskPrompt,
        token,
        (msg) => setPublishInfo(msg),
      );

      if (result.ok) {
        setPublishInfo(
          result.commitUrl
            ? `✅ ${result.filesCount} файлов закоммичено: ${result.commitUrl}`
            : `✅ ${result.filesCount} файлов закоммичено в ${repository}`,
        );
      } else {
        setPublishInfo(`❌ ${result.error ?? 'Неизвестная ошибка'}`);
      }
    } catch (err) {
      setPublishInfo(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <section className="border-t border-fleet-border bg-fleet-surface" style={{ height: `${height}px` }}>
      <div
        role="separator"
        tabIndex={0}
        onPointerDown={(event) => {
          startY.current = event.clientY;
          startHeight.current = height;
          setIsDragging(true);
        }}
        className="h-2 cursor-row-resize bg-fleet-panel/70"
      />
      <div className="flex h-[calc(100%-8px)] flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-fleet-border px-4 py-2 text-xs uppercase tracking-[0.2em] text-fleet-muted">
          <span>{t('console.title')}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void publishToRepo()}
              disabled={publishing}
              className="min-h-9 rounded-lg border border-fleet-border bg-fleet-panel px-3 text-[11px] text-fleet-text transition hover:border-fleet-accent disabled:opacity-60"
            >
              {publishing ? 'Публикация…' : 'В репозиторий'}
            </button>
            {repository && repository !== '(not specified)' ? (
              <>
                <button
                  type="button"
                  onClick={openInVSCode}
                  title="Открыть в VS Code"
                  className="flex min-h-9 items-center gap-1.5 rounded-lg border border-fleet-border bg-fleet-panel px-3 text-[11px] text-fleet-text transition hover:border-fleet-accent"
                >
                  <Monitor size={13} /> VS Code
                </button>
                <button
                  type="button"
                  onClick={downloadZip}
                  title="Скачать архивом"
                  className="flex min-h-9 items-center gap-1.5 rounded-lg border border-fleet-border bg-fleet-panel px-3 text-[11px] text-fleet-text transition hover:border-fleet-accent"
                >
                  <Download size={13} /> ZIP
                </button>
                <button
                  type="button"
                  onClick={openCodespaces}
                  title="Открыть в GitHub Codespaces"
                  className="flex min-h-9 items-center gap-1.5 rounded-lg border border-fleet-border bg-fleet-panel px-3 text-[11px] text-fleet-text transition hover:border-fleet-accent"
                >
                  <ExternalLink size={13} /> Codespaces
                </button>
              </>
            ) : null}
            <select value={filter} onChange={(event) => setFilter(event.target.value as ConsoleFilter)} className="min-h-9 rounded-lg border border-fleet-border bg-fleet-panel px-2 text-[11px] text-fleet-text outline-none">
              {FILTERS.map((option) => (
                <option key={option} value={option}>
                  {t(`console.${option}` as 'console.all' | 'console.info' | 'console.success' | 'console.error')}
                </option>
              ))}
            </select>
            <button type="button" onClick={clearConsole} className="min-h-9 rounded-lg border border-fleet-border bg-fleet-panel px-3 text-[11px] text-fleet-text transition hover:border-fleet-accent">
              {t('console.clear')}
            </button>
          </div>
        </div>
        <div ref={logRef} className="flex-1 overflow-y-auto px-4 py-3 font-mono text-xs text-fleet-text">
          {publishInfo ? (
            <div className="mb-3 rounded-lg border border-fleet-border bg-fleet-bg/40 p-3 text-fleet-muted">{publishInfo}</div>
          ) : null}

          {resultEntries.length > 0 ? (
            <div className="mb-3 rounded-lg border border-fleet-border bg-fleet-bg/30 p-3">
              <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-fleet-muted">Промежуточные результаты</div>
              <div className="space-y-2">
                {resultEntries.map((result) => (
                  <details key={`result-${result.nodeId}`} className="rounded-md border border-fleet-border bg-fleet-panel/50 px-2 py-1">
                    <summary className="cursor-pointer text-fleet-text">{result.nodeId} · {result.status}</summary>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-fleet-muted">{typeof result.output === 'string' ? result.output : JSON.stringify(result.output ?? '', null, 2)}</pre>
                  </details>
                ))}
              </div>
            </div>
          ) : null}

          {renderedLogs.length === 0 ? (
            <div className="text-fleet-muted">{t('console.emptyHint')}</div>
          ) : (
            <div className="space-y-3">
              {renderedLogs.map((entry) => (
                <div key={entry.key} className={`rounded-lg border p-3 ${entry.className}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5">{entry.icon} {entry.title}</span>
                    <span className="text-fleet-muted">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-fleet-muted">{entry.body}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}