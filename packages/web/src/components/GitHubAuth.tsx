import { useState } from 'react';
import type { ReactElement } from 'react';
import { ExternalLink, Github, Loader2, CheckCircle2, XCircle } from 'lucide-react';

import { useT } from '../i18n/useT.js';

interface GitHubUser {
  login: string;
  avatar_url: string;
  name: string | null;
}

interface GitHubAuthProps {
  /** Currently stored token (if any). */
  token?: string;
  /** Called when a valid token is confirmed. */
  onConnect: (token: string, user: GitHubUser) => void;
  /** Called to disconnect. */
  onDisconnect: () => void;
  /** Pre-verified user info, if already connected. */
  connectedUser?: GitHubUser | null;
}

const GITHUB_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

export function GitHubAuth({ onConnect, onDisconnect, connectedUser }: GitHubAuthProps): ReactElement {
  const t = useT();
  const [input, setInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = async (): Promise<void> => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setVerifying(true);
    setError(null);
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${trimmed}`, Accept: 'application/json' },
      });
      if (!response.ok) {
        setError(t('github.invalidToken'));
        return;
      }
      const user = (await response.json()) as GitHubUser;
      onConnect(trimmed, user);
      setInput('');
    } catch {
      setError(t('github.invalidToken'));
    } finally {
      setVerifying(false);
    }
  };

  if (connectedUser) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <div className="flex items-center gap-3">
          <img src={connectedUser.avatar_url} alt="" className="h-10 w-10 rounded-full border border-fleet-border" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-fleet-text">{t('github.connectedAs')}</div>
            <div className="text-sm text-emerald-300">{connectedUser.name ?? connectedUser.login}</div>
          </div>
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
        </div>
        <button
          type="button"
          onClick={onDisconnect}
          className="mt-3 w-full rounded-lg border border-fleet-border bg-fleet-surface px-4 py-2 text-sm text-fleet-text transition hover:border-red-400 hover:text-red-400"
        >
          {t('github.disconnect')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-fleet-border bg-fleet-surface/70 p-4">
      <div className="flex items-center gap-3">
        <Github className="h-6 w-6 text-fleet-text" />
        <div>
          <div className="text-sm font-semibold text-fleet-text">{t('github.connectTitle')}</div>
          <p className="text-sm text-fleet-muted">{t('github.connectDesc')}</p>
        </div>
      </div>

      <ol className="space-y-2 text-sm text-fleet-muted">
        <li className="flex items-start gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-fleet-accent/20 text-[11px] font-semibold text-fleet-accent">1</span>
          {t('github.step1')}
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-fleet-accent/20 text-[11px] font-semibold text-fleet-accent">2</span>
          {t('github.step2')}
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-fleet-accent/20 text-[11px] font-semibold text-fleet-accent">3</span>
          {t('github.step3')}
        </li>
      </ol>

      <p className="text-xs text-fleet-muted">{t('github.scopes')}</p>

      <a
        href={GITHUB_TOKEN_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#24292f] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#32383f]"
      >
        <Github className="h-4 w-4" />
        {t('github.openGitHub')}
        <ExternalLink className="h-3.5 w-3.5 opacity-60" />
      </a>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(event) => { setInput(event.target.value); setError(null); }}
          type="password"
          autoComplete="new-password"
          className="flex-1 rounded-lg border border-fleet-border bg-fleet-bg px-3 py-2 text-sm text-fleet-text outline-none transition placeholder:text-fleet-muted/50 focus:border-fleet-accent"
          placeholder={t('github.pasteToken')}
        />
        <button
          type="button"
          onClick={() => void verify()}
          disabled={verifying || !input.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-fleet-accent px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {verifying ? t('github.verifying') : t('github.verify')}
        </button>
      </div>

      {error ? (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <XCircle className="h-4 w-4" />
          {error}
        </div>
      ) : null}
    </div>
  );
}
