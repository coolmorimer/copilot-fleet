import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { VERSION } from '@copilot-fleet/shared';
import type { Locale, Preset, ProviderConfig, ProviderStatus, ProviderType } from '@copilot-fleet/shared';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import { Globe, Plus, Settings2, ShieldAlert, Sparkles, X } from 'lucide-react';

import { testConnection } from '../engine/llm-client.js';
import { ProviderPanel } from '../panels/ProviderPanel.js';
import { PROVIDER_LABELS, PROVIDER_MODELS, PROVIDERS_WITH_BASE_URL, PROVIDER_OPTIONS } from '../panels/data.js';
import { FIELD_CLASS, SelectField, SliderField, ToggleField, cx, maskSecret } from '../panels/shared.js';
import { useSettingsStore } from '../store/settings-store.js';
import { useT } from '../i18n/useT.js';
import { GitHubAuth } from './GitHubAuth.js';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const LOCALES: Array<{ value: Locale; label: string }> = [
  { value: 'en', label: 'EN' },
  { value: 'ru', label: 'RU' },
];

const PRESETS: Array<{ value: Preset; label: string }> = [
  { value: 'solo', label: 'Solo' },
  { value: 'squad', label: 'Squad' },
  { value: 'platoon', label: 'Platoon' },
  { value: 'fleet', label: 'Fleet' },
];

const createProvider = (type: ProviderType): ProviderConfig => ({
  type,
  name: `${PROVIDER_LABELS[type]} ${Math.floor(Math.random() * 90 + 10)}`,
  baseUrl: PROVIDERS_WITH_BASE_URL.has(type) ? 'http://localhost:11434' : undefined,
  models: [...PROVIDER_MODELS[type]],
  defaultModel: PROVIDER_MODELS[type][0],
});

const createStatus = (config: ProviderConfig, connected: boolean, error?: string): ProviderStatus => ({
  type: config.type,
  connected,
  models: config.models,
  error,
});

export function SettingsModal({ open, onClose }: SettingsModalProps): ReactElement | null {
  const t = useT();
  const locale = useSettingsStore((state) => state.locale);
  const theme = useSettingsStore((state) => state.theme);
  const preset = useSettingsStore((state) => state.preset);
  const showMinimap = useSettingsStore((state) => state.showMinimap);
  const showGrid = useSettingsStore((state) => state.showGrid);
  const snapToGrid = useSettingsStore((state) => state.snapToGrid);
  const gridSize = useSettingsStore((state) => state.gridSize);
  const autoSave = useSettingsStore((state) => state.autoSave);
  const setLocale = useSettingsStore((state) => state.setLocale);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setPreset = useSettingsStore((state) => state.setPreset);
  const setShowMinimap = useSettingsStore((state) => state.setShowMinimap);
  const setShowGrid = useSettingsStore((state) => state.setShowGrid);
  const setSnapToGrid = useSettingsStore((state) => state.setSnapToGrid);
  const setGridSize = useSettingsStore((state) => state.setGridSize);
  const setAutoSave = useSettingsStore((state) => state.setAutoSave);
  const providers = useSettingsStore((state) => state.providers);
  const addProvider = useSettingsStore((state) => state.addProvider);
  const removeProvider = useSettingsStore((state) => state.removeProvider);
  const githubUser = useSettingsStore((state) => state.githubUser);
  const setGitHubUser = useSettingsStore((state) => state.setGitHubUser);

  const [providerStatuses, setProviderStatuses] = useState<Record<string, ProviderStatus>>({});
  const [selectedProviderName, setSelectedProviderName] = useState<string | null>(providers[0]?.name ?? null);
  const [newProviderType, setNewProviderType] = useState<ProviderType>('github-copilot');
  const selectedProvider = providers.find((provider) => provider.name === selectedProviderName);

  const aboutLinks = useMemo(
    () => [
      { label: 'Repository', href: 'https://github.com/github/copilot' },
      { label: 'Radix UI', href: 'https://www.radix-ui.com/' },
      { label: 'React Flow', href: 'https://reactflow.dev/' },
    ],
    [],
  );

  const saveProvider = (nextConfig: ProviderConfig): void => {
    if (selectedProvider && selectedProvider.name !== nextConfig.name) {
      removeProvider(selectedProvider.name);
    }
    addProvider(nextConfig);
    setProviderStatuses((current) => ({ ...current, [nextConfig.name]: current[selectedProvider?.name ?? nextConfig.name] ?? createStatus(nextConfig, false) }));
    setSelectedProviderName(nextConfig.name);
  };

  const testProvider = async (config: ProviderConfig): Promise<void> => {
    const hasApiKey = Boolean(config.apiKey?.trim());
    const hasBaseUrl = !PROVIDERS_WITH_BASE_URL.has(config.type) || Boolean(config.baseUrl?.trim());
    const basicOk = hasBaseUrl && (hasApiKey || config.type === 'ollama' || config.type === 'lmstudio' || config.type === 'vscode-local');
    const models = config.models.length > 0 ? config.models : PROVIDER_MODELS[config.type];

    if (!basicOk) {
      setProviderStatuses((current) => ({
        ...current,
        [config.name]: { type: config.type, connected: false, models, error: 'Не заполнены обязательные поля.' },
      }));
      return;
    }

    // Show "testing..." state
    setProviderStatuses((current) => ({
      ...current,
      [config.name]: { type: config.type, connected: false, models, error: 'Тестирование...' },
    }));

    const providerToTest = { ...config, models, defaultModel: config.defaultModel ?? models[0] };

    // Real API test
    const result = await testConnection(providerToTest);

    setProviderStatuses((current) => ({
      ...current,
      [config.name]: {
        type: config.type,
        connected: result.ok,
        models,
        error: result.ok ? undefined : result.error,
      },
    }));

    if (result.ok) {
      addProvider(providerToTest);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] flex max-h-[90vh] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[28px] border border-fleet-border bg-fleet-deep shadow-2xl outline-none">
          <div className="flex items-start justify-between border-b border-fleet-border px-5 py-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-fleet-text">{t('settings.title')}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-fleet-muted">{t('settings.subtitle')}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="rounded-lg border border-fleet-border bg-fleet-surface p-2 text-fleet-muted transition hover:border-fleet-accent hover:text-white" aria-label={t('settings.closeAria')}>
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <Tabs.Root defaultValue="general" className="flex min-h-0 flex-1 flex-col">
            <Tabs.List className="grid grid-cols-3 border-b border-fleet-border px-4">
              {[
                { value: 'general', label: t('settings.general'), icon: Settings2 },
                { value: 'providers', label: t('settings.providers'), icon: ShieldAlert },
                { value: 'about', label: t('settings.about'), icon: Sparkles },
              ].map((tab) => (
                <Tabs.Trigger
                  key={tab.value}
                  value={tab.value}
                  className="relative inline-flex items-center justify-center gap-2 border-b-2 border-transparent px-3 py-3 text-sm text-fleet-muted transition data-[state=active]:border-fleet-accent data-[state=active]:text-white"
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Tabs.Content value="general" className="space-y-4 p-4 outline-none">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-[0.22em] text-fleet-muted">{t('settings.locale')}</div>
                    <div className="grid grid-cols-2 gap-2 rounded-xl border border-fleet-border bg-fleet-surface/70 p-1">
                      {LOCALES.map((option) => (
                        <button key={option.value} type="button" onClick={() => setLocale(option.value)} className={cx('rounded-lg px-3 py-2 text-sm transition', locale === option.value ? 'bg-fleet-accent text-white' : 'text-fleet-muted hover:text-fleet-text')}>
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-[0.22em] text-fleet-muted">{t('settings.theme')}</div>
                    <div className="grid grid-cols-2 gap-2 rounded-xl border border-fleet-border bg-fleet-surface/70 p-1">
                      {(['dark', 'light'] as const).map((option) => (
                        <button key={option} type="button" onClick={() => setTheme(option)} className={cx('rounded-lg px-3 py-2 text-sm capitalize transition', theme === option ? 'bg-fleet-accent text-white' : 'text-fleet-muted hover:text-fleet-text')}>
                          {t(`settings.${option}` as const)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <SelectField label={t('settings.preset')} value={preset} options={PRESETS} onChange={(value) => setPreset(value as Preset)} />
                <div className="rounded-2xl border border-fleet-border bg-fleet-surface/70 p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-fleet-text">{t('settings.grid')}</div>
                      <div className="text-sm text-fleet-muted">{t('settings.gridDesc')}</div>
                    </div>
                    <Globe className="h-4 w-4 text-fleet-muted" />
                  </div>
                  <div className="space-y-4">
                    <ToggleField label={t('settings.snapToGrid')} checked={snapToGrid} onCheckedChange={setSnapToGrid} />
                    <ToggleField label={t('settings.showGrid')} checked={showGrid} onCheckedChange={setShowGrid} />
                    <SliderField label={t('settings.gridSize')} value={gridSize} min={8} max={64} step={4} formatValue={(value) => `${value}px`} onChange={setGridSize} />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <ToggleField label={t('settings.minimap')} checked={showMinimap} onCheckedChange={setShowMinimap} />
                  <ToggleField label={t('settings.autoSave')} checked={autoSave} onCheckedChange={setAutoSave} description={t('settings.autoSaveDesc')} />
                </div>
              </Tabs.Content>
              <Tabs.Content value="providers" className="space-y-4 p-4 outline-none">
                <GitHubAuth
                  token={providers.find((p) => p.type === 'github-copilot')?.apiKey}
                  connectedUser={githubUser}
                  onConnect={(token, user) => {
                    const existing = providers.find((p) => p.type === 'github-copilot');
                    addProvider({
                      type: 'github-copilot',
                      name: existing?.name ?? 'GitHub Copilot',
                      apiKey: token,
                      models: existing?.models ?? PROVIDER_MODELS['github-copilot'],
                      defaultModel: existing?.defaultModel ?? PROVIDER_MODELS['github-copilot'][0],
                    });
                    setGitHubUser(user);
                  }}
                  onDisconnect={() => {
                    const existing = providers.find((p) => p.type === 'github-copilot');
                    if (existing) removeProvider(existing.name);
                    setGitHubUser(null);
                  }}
                />
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                  {t('settings.apiKeyWarning')}
                </div>
                <div className="space-y-3">
                  {providers.map((provider) => {
                    const status = providerStatuses[provider.name] ?? createStatus(provider, false, 'Not tested');
                    return (
                      <div key={provider.name} className={cx('rounded-2xl border p-4 transition', selectedProviderName === provider.name ? 'border-fleet-accent bg-fleet-accent/5' : 'border-fleet-border bg-fleet-surface/70')}>
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <button type="button" onClick={() => setSelectedProviderName(provider.name)} className="text-left">
                            <div className="flex items-center gap-2 text-sm font-semibold text-fleet-text">
                              <span className={cx('h-2.5 w-2.5 rounded-full', status.connected ? 'bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.7)]' : 'bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.7)]')} />
                              {provider.name}
                            </div>
                            <div className="mt-1 text-sm text-fleet-muted">{PROVIDER_LABELS[provider.type]} · {status.connected ? t('settings.connected') : status.error ?? t('settings.disconnected')}</div>
                          </button>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => void testProvider(provider)} className="rounded-lg bg-fleet-accent px-3 py-2 text-sm text-white transition hover:brightness-110">{t('settings.test')}</button>
                            <button
                              type="button"
                              onClick={() => {
                                removeProvider(provider.name);
                                setProviderStatuses((current) => {
                                  const next = { ...current };
                                  delete next[provider.name];
                                  return next;
                                });
                                setSelectedProviderName((current) => (current === provider.name ? null : current));
                              }}
                              className="rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-400 transition hover:bg-red-500/30"
                            >
                              {t('settings.remove')}
                            </button>
                          </div>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="space-y-2">
                            <span className="text-xs uppercase tracking-[0.22em] text-fleet-muted">{t('settings.apiKey')}</span>
                            <div className="flex gap-2">
                              <button type="button" onClick={() => setSelectedProviderName(provider.name)} className={cx(FIELD_CLASS, 'cursor-pointer text-left text-fleet-muted hover:border-fleet-accent')}>
                                {provider.apiKey?.trim() ? maskSecret(provider.apiKey) : t('settings.pasteApiKey')}
                              </button>
                              <button type="button" onClick={() => setSelectedProviderName(provider.name)} className="rounded-lg border border-fleet-border bg-fleet-surface px-3 text-sm text-fleet-text transition hover:border-fleet-accent">
                                {t('common.edit')}
                              </button>
                            </div>
                          </label>
                          <label className="space-y-2">
                            <span className="text-xs uppercase tracking-[0.22em] text-fleet-muted">{t('settings.baseUrl')}</span>
                            <input value={provider.baseUrl ?? ''} readOnly className={FIELD_CLASS} placeholder={t('settings.notRequired')} />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex items-end gap-3 rounded-2xl border border-dashed border-fleet-border bg-fleet-surface/40 p-4">
                    <div className="flex-1">
                      <SelectField label={t('settings.addProvider')} value={newProviderType} options={PROVIDER_OPTIONS} onChange={(value) => setNewProviderType(value as ProviderType)} />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const draft = createProvider(newProviderType);
                        setSelectedProviderName(draft.name);
                        addProvider(draft);
                      }}
                      className="inline-flex items-center gap-2 rounded-lg bg-fleet-accent px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
                    >
                      <Plus className="h-4 w-4" />
                      {t('settings.addProvider')}
                    </button>
                  </div>
                </div>
                <ProviderPanel
                  config={selectedProvider ?? (selectedProviderName ? createProvider(newProviderType) : undefined)}
                  onSave={saveProvider}
                  onTest={selectedProvider ? () => testProvider(selectedProvider) : undefined}
                  onRemove={selectedProvider ? () => removeProvider(selectedProvider.name) : undefined}
                />
              </Tabs.Content>
              <Tabs.Content value="about" className="space-y-4 p-4 outline-none">
                <div className="rounded-2xl border border-fleet-border bg-fleet-surface/70 p-4">
                  <div className="text-xs uppercase tracking-[0.22em] text-fleet-muted">{t('settings.version')}</div>
                  <div className="mt-2 text-2xl font-semibold text-fleet-text">v{VERSION}</div>
                  <p className="mt-2 text-sm text-fleet-muted">{t('settings.aboutDesc')}</p>
                </div>
                <div className="rounded-2xl border border-fleet-border bg-fleet-surface/70 p-4">
                  <div className="mb-3 text-xs uppercase tracking-[0.22em] text-fleet-muted">{t('settings.links')}</div>
                  <div className="space-y-2 text-sm">
                    {aboutLinks.map((link) => (
                      <a key={link.label} href={link.href} target="_blank" rel="noreferrer" className="block rounded-lg border border-fleet-border bg-fleet-bg px-3 py-2 text-fleet-text transition hover:border-fleet-accent">
                        {link.label}
                      </a>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-fleet-border bg-fleet-surface/70 p-4">
                  <div className="mb-3 text-xs uppercase tracking-[0.22em] text-fleet-muted">{t('settings.credits')}</div>
                  <p className="text-sm leading-6 text-fleet-muted">{t('settings.creditsText')}</p>
                </div>
              </Tabs.Content>
            </div>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}