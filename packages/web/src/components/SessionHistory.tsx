import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import { useGraphStore } from '../store/graph-store.js';
import { getSavedSession, historyEventName, listSavedSessions } from '../store/history.js';
import { useSessionStore } from '../store/session-store.js';

const formatDuration = (duration: number): string => {
  const totalSeconds = Math.floor(duration / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export function SessionHistory(): ReactElement {
  const loadGraph = useGraphStore((state) => state.loadGraph);
  const resetSession = useSessionStore((state) => state.reset);
  const [sessions, setSessions] = useState(listSavedSessions);

  useEffect(() => {
    const refresh = (): void => {
      setSessions(listSavedSessions());
    };

    window.addEventListener(historyEventName, refresh);
    window.addEventListener('storage', refresh);

    return () => {
      window.removeEventListener(historyEventName, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  if (sessions.length === 0) {
    return <div className="rounded-xl border border-dashed border-fleet-border bg-fleet-bg/20 px-3 py-4 text-xs text-fleet-muted">Saved sessions will appear here after the first snapshot.</div>;
  }

  return (
    <div className="space-y-2">
      {sessions.map((session) => (
        <button
          key={session.id}
          type="button"
          onClick={() => {
            const record = getSavedSession(session.id);
            if (!record) {
              return;
            }
            resetSession();
            loadGraph(record.graph);
          }}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-fleet-border bg-fleet-panel/40 px-3 py-3 text-left transition hover:border-fleet-accent"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-fleet-text">{session.name}</div>
            <div className="mt-1 text-xs text-fleet-muted">{new Date(session.createdAt).toLocaleString()}</div>
          </div>
          <div className="shrink-0 text-right text-xs">
            <div className="rounded-full border border-fleet-border px-2 py-0.5 uppercase tracking-[0.16em] text-fleet-muted">{session.status}</div>
            <div className="mt-1 text-fleet-muted">{formatDuration(session.duration)}</div>
          </div>
        </button>
      ))}
    </div>
  );
}