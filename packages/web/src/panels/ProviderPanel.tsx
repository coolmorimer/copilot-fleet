import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { ProviderConfig, ProviderType } from '@copilot-fleet/shared';
import { Loader2, ShieldAlert } from 'lucide-react';

import { PROVIDER_LABELS, PROVIDER_MODELS, PROVIDERS_WITH_BASE_URL, PROVIDER_OPTIONS } from './data.js';
import { FIELD_CLASS, FieldShell, HintTooltip, ScrollPanel, SectionTitle, SelectField, maskSecret } from './shared.js';
import { useT } from '../i18n/useT.js';

export interface ProviderPanelProps {
  config?: ProviderConfig;
  onSave: (config: ProviderConfig) => void;
  onTest?: () => void;
  onRemove?: () => void;
}

const createDraft = (config?: ProviderConfig): ProviderConfig => ({
  type: config?.type ?? 'github-copilot',
  name: config?.name ?? '',
  apiKey: config?.apiKey,
  baseUrl: config?.baseUrl ?? '',
  models: config?.models.length ? [...config.models] : [...PROVIDER_MODELS[config?.type ?? 'github-copilot']],
  defaultModel: config?.defaultModel ?? config?.models[0] ?? PROVIDER_MODELS[config?.type ?? 'github-copilot'][0],
});

export function ProviderPanel({ config, onSave, onTest, onRemove }: ProviderPanelProps): ReactElement {
  const t = useT();
  const [draft, setDraft] = useState<ProviderConfig>(() => createDraft(config));
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showMaskedPreview, setShowMaskedPreview] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testPassed, setTestPassed] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>(() => createDraft(config).models);

  useEffect(() => {
    const next = createDraft(config);
    setDraft(next);
    setAvailableModels(next.models);
    setApiKeyInput('');
    setShowMaskedPreview(false);
    setTestPassed(false);
  }, [config]);

  const modelOptions = useMemo(() => {
    const source = availableModels.length > 0 ? availableModels : PROVIDER_MODELS[draft.type];
    const unique = Array.from(new Set([...(draft.defaultModel ? [draft.defaultModel] : []), ...source]));
    return unique.map((model) => ({ value: model, label: model }));
  }, [availableModels, draft.defaultModel, draft.type]);

  const supportsBaseUrl = PROVIDERS_WITH_BASE_URL.has(draft.type);
  const maskedExistingKey = maskSecret(config?.apiKey);

  const updateType = (value: string): void => {
    const type = value as ProviderType;
    const models = PROVIDER_MODELS[type];
    setDraft((current) => ({
      ...current,
      type,
      baseUrl: PROVIDERS_WITH_BASE_URL.has(type) ? current.baseUrl : '',
      models,
      defaultModel: models.includes(current.defaultModel ?? '') ? current.defaultModel : models[0],
    }));
    setAvailableModels(models);
    setTestPassed(false);
  };

  const handleTest = async (): Promise<void> => {
    setTesting(true);
    try {
      await Promise.resolve(onTest?.());
      const models = draft.models.length > 0 ? draft.models : PROVIDER_MODELS[draft.type];
      setAvailableModels(models);
      setTestPassed(true);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = (): void => {
    const trimmedBaseUrl = draft.baseUrl?.trim();

    onSave({
      ...draft,
      apiKey: apiKeyInput.trim().length > 0 ? apiKeyInput.trim() : config?.apiKey,
      baseUrl: supportsBaseUrl && trimmedBaseUrl ? trimmedBaseUrl : undefined,
      models: availableModels.length > 0 ? availableModels : PROVIDER_MODELS[draft.type],
      defaultModel: draft.defaultModel,
    });
  };

  return (
    <div className="rounded-2xl border border-fleet-border bg-fleet-surface/80">
      <div className="border-b border-fleet-border px-4 py-4">
        <SectionTitle title={config ? `${t('providerPanel.edit')} ${config.name}` : t('providerPanel.new')} subtitle={t('providerPanel.secretsHint')} />
      </div>
      <ScrollPanel className="max-h-[32rem]">
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <FieldShell label={t('common.name')}>
            <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className={FIELD_CLASS} placeholder="Production OpenAI" />
          </FieldShell>
          <SelectField label={t('common.type')} value={draft.type} options={PROVIDER_OPTIONS} onChange={updateType} />
          <div className="md:col-span-2">
            <FieldShell label={t('settings.apiKey')} hint={<HintTooltip content={t('providerPanel.apiKeyHint')} />}>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    value={apiKeyInput}
                    onChange={(event) => setApiKeyInput(event.target.value)}
                    type="password"
                    autoComplete="new-password"
                    className={FIELD_CLASS}
                    placeholder={maskedExistingKey || t('settings.pasteApiKey')}
                  />
                  <button type="button" onClick={() => setShowMaskedPreview((value) => !value)} className="rounded-lg border border-fleet-border bg-fleet-bg px-3 text-sm text-fleet-text transition hover:border-fleet-accent">
                    {showMaskedPreview ? t('common.hide') : t('common.show')}
                  </button>
                </div>
                {showMaskedPreview && maskedExistingKey ? <div className="text-xs text-fleet-muted">{t('settings.storedKey')}: {maskedExistingKey}</div> : null}
              </div>
            </FieldShell>
          </div>
          {supportsBaseUrl ? (
            <div className="md:col-span-2">
              <FieldShell label={t('settings.baseUrl')}>
                <input value={draft.baseUrl ?? ''} onChange={(event) => setDraft((current) => ({ ...current, baseUrl: event.target.value }))} className={FIELD_CLASS} placeholder="http://localhost:11434" />
              </FieldShell>
            </div>
          ) : null}
          <SelectField label={t('common.defaultModel')} value={draft.defaultModel ?? modelOptions[0]?.value ?? ''} options={modelOptions} onChange={(value) => setDraft((current) => ({ ...current, defaultModel: value }))} />
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={testing}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-fleet-accent px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('common.testConnection')}
            </button>
            {onRemove ? (
              <button type="button" onClick={onRemove} className="rounded-lg bg-red-500/20 px-4 py-2 text-sm text-red-400 transition hover:bg-red-500/30">
                {t('common.remove')}
              </button>
            ) : null}
          </div>
          {testPassed ? (
            <div className="md:col-span-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              <div className="mb-2 font-medium">{t('settings.connectionReady')}</div>
              <div className="flex flex-wrap gap-2">
                {availableModels.map((model) => (
                  <span key={model} className="rounded-full border border-emerald-400/20 px-2 py-1 text-xs">{model}</span>
                ))}
              </div>
            </div>
          ) : null}
          <div className="md:col-span-2 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('common.storageWarning')}</span>
          </div>
        </div>
      </ScrollPanel>
      <div className="flex justify-between gap-3 border-t border-fleet-border p-4">
        <div className="text-xs text-fleet-muted">{PROVIDER_LABELS[draft.type]}</div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setDraft(createDraft(config))} className="rounded-lg border border-fleet-border bg-fleet-surface px-4 py-2 text-sm text-fleet-text transition hover:border-fleet-accent">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={handleSave} className="rounded-lg bg-fleet-accent px-4 py-2 text-sm font-medium text-white transition hover:brightness-110">
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}