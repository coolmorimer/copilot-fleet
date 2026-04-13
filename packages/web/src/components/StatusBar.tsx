import type { ReactElement } from 'react';
import { VERSION } from '@copilot-fleet/shared';
import { Activity } from 'lucide-react';

import { useGraphStore } from '../store/graph-store.js';
import { useSessionStore } from '../store/session-store.js';
import { useSettingsStore } from '../store/settings-store.js';
import { useT } from '../i18n/useT.js';

const formatElapsed = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export function StatusBar(): ReactElement {
  const t = useT();
  const nodes = useGraphStore((state) => state.nodes);
  const sessionStatus = useSessionStore((state) => state.status);
  const elapsed = useSessionStore((state) => state.elapsed);
  const logs = useSessionStore((state) => state.logs.length);
  const locale = useSettingsStore((state) => state.locale);
  const providers = useSettingsStore((state) => state.providers.length);
  const setLocale = useSettingsStore((state) => state.setLocale);
  const completed = nodes.filter((node) => node.data.status === 'done').length;
  const progress = nodes.length > 0 ? (completed / nodes.length) * 100 : 0;

  return (
    <footer className="flex h-7 items-center justify-between gap-3 border-t border-fleet-border bg-fleet-deep px-4 text-[11px] text-fleet-muted">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${providers > 0 ? 'bg-emerald-400' : 'bg-slate-500'}`} /> {providers > 0 ? t('common.connected') : t('common.offline')}</span>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-3 overflow-hidden">
        <span>{completed}/{nodes.length || 0} {t('statusbar.tasksCompleted')}</span>
        <div className="h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-fleet-border/60">
          <div className="h-full rounded-full bg-fleet-accent" style={{ width: `${progress}%` }} />
        </div>
        <span className="capitalize">{sessionStatus}</span>
      </div>
      <div className="flex items-center gap-4">
        <span>{formatElapsed(elapsed)}</span>
        <span className="flex items-center gap-1"><Activity size={12} /> {logs} req</span>
        <button type="button" onClick={() => setLocale(locale === 'en' ? 'ru' : 'en')} className="rounded-full border border-fleet-border px-2 py-0.5 text-fleet-text">
          {locale === 'en' ? 'EN' : 'RU'}
        </button>
        <span>v{VERSION}</span>
      </div>
    </footer>
  );
}