import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { DEFAULT_AGENT_PARAMETERS } from '@copilot-fleet/shared';
import type { AgentDefinition, ProviderType } from '@copilot-fleet/shared';

import { Bot } from 'lucide-react';

import { PROVIDER_MODELS, PROVIDER_OPTIONS } from './data.js';
import { FIELD_CLASS, FieldShell, ScrollPanel, SectionTitle, SelectField, SliderField, TagInput } from './shared.js';
import { useT } from '../i18n/useT.js';

export interface AgentEditorProps {
  agent?: AgentDefinition;
  onSave: (agent: AgentDefinition) => void;
  onCancel: () => void;
}

type DraftAgent = Omit<AgentDefinition, 'id' | 'builtin'>;

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const createDraft = (agent?: AgentDefinition): DraftAgent => ({
  name: agent?.name ?? '',
  displayName: agent?.displayName ?? '',
  description: agent?.description ?? '',
  icon: agent?.icon ?? 'bot',
  color: agent?.color ?? '#6366f1',
  provider: agent?.provider ?? 'github-copilot',
  model: agent?.model ?? PROVIDER_MODELS['github-copilot'][0],
  fallbackModel: agent?.fallbackModel,
  systemPrompt: agent?.systemPrompt ?? '',
  parameters: agent?.parameters ?? DEFAULT_AGENT_PARAMETERS,
  files: agent?.files ?? { include: [], exclude: [] },
  hooks: agent?.hooks ?? { before: '', after: '' },
  labels: agent?.labels ?? [],
});

export function AgentEditor({ agent, onSave, onCancel }: AgentEditorProps): ReactElement {
  const t = useT();
  const [draft, setDraft] = useState<DraftAgent>(() => createDraft(agent));

  useEffect(() => {
    setDraft(createDraft(agent));
  }, [agent]);

  const modelOptions = useMemo(() => {
    const currentModels = PROVIDER_MODELS[draft.provider as ProviderType] ?? [];
    const uniqueModels = Array.from(new Set([draft.model, ...(draft.fallbackModel ? [draft.fallbackModel] : []), ...currentModels].filter(Boolean)));
    return uniqueModels.map((model) => ({ value: model, label: model }));
  }, [draft.fallbackModel, draft.model, draft.provider]);

  const saveAgent = (): void => {
    const stableName = draft.name.trim();
    onSave({
      id: agent?.id ?? slugify(stableName || draft.displayName || 'custom-agent'),
      builtin: false,
      ...draft,
      name: stableName,
      displayName: draft.displayName.trim(),
      description: draft.description.trim(),
      systemPrompt: draft.systemPrompt,
      hooks: {
        before: draft.hooks?.before?.trim() || undefined,
        after: draft.hooks?.after?.trim() || undefined,
      },
      files: {
        include: draft.files?.include?.length ? draft.files.include : undefined,
        exclude: draft.files?.exclude?.length ? draft.files.exclude : undefined,
      },
      labels: draft.labels?.length ? draft.labels : undefined,
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-fleet-border bg-fleet-surface/80">
      <div className="border-b border-fleet-border px-4 py-4">
        <SectionTitle title={agent ? t('agentEditor.edit') : t('agentEditor.create')} subtitle={t('agentEditor.subtitle')} />
      </div>
      <ScrollPanel className="min-h-0 flex-1">
        <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FieldShell label={t('common.name')}>
                <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className={FIELD_CLASS} placeholder="security-reviewer" />
              </FieldShell>
              <FieldShell label={t('agentEditor.displayName')}>
                <input value={draft.displayName} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} className={FIELD_CLASS} placeholder="Security Reviewer" />
              </FieldShell>
              <FieldShell label={t('common.description')}>
                <input value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} className={FIELD_CLASS} placeholder="Audits changes for security regressions." />
              </FieldShell>
              <div className="grid gap-4 grid-cols-[8rem_1fr]">
                <FieldShell label={t('agentEditor.icon')}>
                  <input value={draft.icon ?? ''} onChange={(event) => setDraft((current) => ({ ...current, icon: event.target.value }))} className={FIELD_CLASS} placeholder="bot" />
                </FieldShell>
                <FieldShell label={t('common.color')}>
                  <div className="flex items-center gap-3 rounded-lg border border-fleet-border bg-fleet-bg px-3 py-2">
                    <input type="color" value={draft.color ?? '#6366f1'} onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))} className="h-8 w-10 rounded border border-fleet-border bg-transparent" />
                    <span className="text-sm text-fleet-text">{draft.color}</span>
                  </div>
                </FieldShell>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label={t('common.provider')}
                value={draft.provider}
                options={PROVIDER_OPTIONS}
                onChange={(value) => {
                  const provider = value as ProviderType;
                  const firstModel = PROVIDER_MODELS[provider][0];
                  setDraft((current) => ({ ...current, provider, model: current.model || firstModel }));
                }}
              />
              <SelectField label={t('common.model')} value={draft.model} options={modelOptions} onChange={(value) => setDraft((current) => ({ ...current, model: value }))} />
            </div>
            <FieldShell label={t('agentEditor.systemPrompt')}>
              <textarea
                value={draft.systemPrompt}
                onChange={(event) => setDraft((current) => ({ ...current, systemPrompt: event.target.value }))}
                className={`${FIELD_CLASS} min-h-48 resize-y font-mono text-[13px] leading-6`}
                placeholder="You are a focused implementation agent..."
              />
            </FieldShell>
            <div className="grid gap-4 md:grid-cols-3">
              <SliderField label={t('common.temperature')} value={draft.parameters.temperature} min={0} max={1} step={0.05} formatValue={(value) => value.toFixed(2)} onChange={(value) => setDraft((current) => ({ ...current, parameters: { ...current.parameters, temperature: value } }))} />
              <SliderField label={t('common.maxTokens')} value={draft.parameters.maxTokens} min={256} max={16384} step={256} formatValue={(value) => `${value}`} onChange={(value) => setDraft((current) => ({ ...current, parameters: { ...current.parameters, maxTokens: value } }))} />
              <SliderField label={t('common.timeout')} value={Math.round(draft.parameters.timeout / 60000)} min={1} max={60} step={1} formatValue={(value) => `${value} min`} onChange={(value) => setDraft((current) => ({ ...current, parameters: { ...current.parameters, timeout: value * 60000 } }))} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <TagInput label={t('agentEditor.includePatterns')} items={draft.files?.include ?? []} placeholder="src/**/*.ts" onChange={(items) => setDraft((current) => ({ ...current, files: { ...current.files, include: items } }))} />
              <TagInput label={t('agentEditor.excludePatterns')} items={draft.files?.exclude ?? []} placeholder="dist/**" onChange={(items) => setDraft((current) => ({ ...current, files: { ...current.files, exclude: items } }))} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <FieldShell label={t('agentEditor.beforeCommand')}>
                <textarea value={draft.hooks?.before ?? ''} onChange={(event) => setDraft((current) => ({ ...current, hooks: { ...current.hooks, before: event.target.value } }))} className={`${FIELD_CLASS} min-h-24 resize-y font-mono text-[13px]`} placeholder="pnpm lint" />
              </FieldShell>
              <FieldShell label={t('agentEditor.afterCommand')}>
                <textarea value={draft.hooks?.after ?? ''} onChange={(event) => setDraft((current) => ({ ...current, hooks: { ...current.hooks, after: event.target.value } }))} className={`${FIELD_CLASS} min-h-24 resize-y font-mono text-[13px]`} placeholder="pnpm test" />
              </FieldShell>
            </div>
            <TagInput label={t('agentEditor.labels')} items={draft.labels ?? []} placeholder="security, review, docs" onChange={(items) => setDraft((current) => ({ ...current, labels: items }))} />
          </div>
          <div className="space-y-4">
            <SectionTitle title={t('agentEditor.nodePreview')} subtitle={t('agentEditor.nodePreviewSub')} />
            <div className="rounded-2xl border border-fleet-border bg-fleet-surface shadow-[0_0_30px_rgba(99,102,241,0.12)]">
              <div className="flex items-center justify-between rounded-t-2xl px-4 py-3 text-slate-950" style={{ backgroundColor: draft.color ?? '#6366f1' }}>
                <div className="flex items-center gap-2 font-semibold">
                  <span className="flex items-center text-lg"><Bot size={18} /></span>
                  <span>{draft.displayName || draft.name || t('agentEditor.untitled')}</span>
                </div>
                <span className="rounded-full border border-slate-900/15 bg-white/15 px-2 py-1 text-[10px] uppercase tracking-[0.2em]">agent</span>
              </div>
              <div className="space-y-3 px-4 py-4 text-sm text-fleet-text">
                <p className="text-fleet-muted">{draft.description || t('agentEditor.descPreview')}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border border-fleet-border bg-fleet-bg p-3">
                    <div className="mb-1 text-fleet-muted">{t('common.provider')}</div>
                    <div>{draft.provider}</div>
                  </div>
                  <div className="rounded-xl border border-fleet-border bg-fleet-bg p-3">
                    <div className="mb-1 text-fleet-muted">{t('common.model')}</div>
                    <div className="truncate font-mono">{draft.model}</div>
                  </div>
                </div>
                <div className="rounded-xl border border-fleet-border bg-fleet-bg p-3 text-xs">
                  <div className="mb-2 text-fleet-muted">{t('agentEditor.labels')}</div>
                  <div className="flex flex-wrap gap-2">
                    {(draft.labels ?? []).length > 0 ? (draft.labels ?? []).map((label) => <span key={label} className="rounded-full border border-fleet-accent/20 px-2 py-1">{label}</span>) : <span className="text-fleet-muted">{t('agentEditor.noLabels')}</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ScrollPanel>
      <div className="flex justify-end gap-2 border-t border-fleet-border p-4">
        <button type="button" onClick={onCancel} className="rounded-lg border border-fleet-border bg-fleet-surface px-4 py-2 text-sm text-fleet-text transition hover:border-fleet-accent">
          {t('common.cancel')}
        </button>
        <button type="button" onClick={saveAgent} className="rounded-lg bg-fleet-accent px-4 py-2 text-sm font-medium text-white transition hover:brightness-110">
          {t('agentEditor.saveAgent')}
        </button>
      </div>
    </div>
  );
}