import { useState } from 'react';
import type { ReactElement } from 'react';

import type { ProviderConfig } from '@copilot-fleet/shared';

import { useGraphStore } from '../store/graph-store.js';
import { createStarterTemplate } from '../store/starter-templates.js';
import { useSettingsStore } from '../store/settings-store.js';
import { useT } from '../i18n/useT.js';
import type { TKey } from '../i18n/translations.js';

const PROVIDER_OPTIONS: Array<{ id: 'github-copilot' | 'openai' | 'ollama' | 'skip'; titleKey: TKey; descKey: TKey }> = [
  { id: 'github-copilot', titleKey: 'provider.githubCopilot', descKey: 'provider.githubCopilotDesc' },
  { id: 'openai', titleKey: 'provider.openai', descKey: 'provider.openaiDesc' },
  { id: 'ollama', titleKey: 'provider.ollama', descKey: 'provider.ollamaDesc' },
  { id: 'skip', titleKey: 'provider.skip', descKey: 'provider.skipDesc' },
];

const TEMPLATE_OPTIONS = [
  { id: 'quick-fix', titleKey: 'template.quickFix' as const, descKey: 'template.quickFixDesc' as const },
  { id: 'feature-squad', titleKey: 'template.featureSquad' as const, descKey: 'template.featureSquadDesc' as const },
  { id: 'fullstack-team', titleKey: 'template.fullstackTeam' as const, descKey: 'template.fullstackTeamDesc' as const },
  { id: 'empty', titleKey: 'template.empty' as const, descKey: 'template.emptyDesc' as const },
] as const;

export function Onboarding(): ReactElement {
  const t = useT();
  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState<(typeof PROVIDER_OPTIONS)[number]['id']>('github-copilot');
  const [template, setTemplate] = useState<(typeof TEMPLATE_OPTIONS)[number]['id']>('quick-fix');
  const completeOnboarding = useSettingsStore((state) => state.completeOnboarding);
  const addProvider = useSettingsStore((state) => state.addProvider);
  const loadGraph = useGraphStore((state) => state.loadGraph);

  const finishOnboarding = (): void => {
    let templateProviders: ProviderConfig[] | undefined;
    if (provider !== 'skip') {
      const config: ProviderConfig = {
        type: provider,
        name: provider,
        models: provider === 'ollama' ? ['qwen2.5-coder', 'llama3.2', 'codestral'] : provider === 'openai' ? ['gpt-4.1', 'gpt-4.1-mini', 'o3', 'o4-mini'] : ['claude-sonnet-4', 'gpt-4.1', 'gpt-4o', 'o3', 'o4-mini'],
        defaultModel: provider === 'ollama' ? 'qwen2.5-coder' : provider === 'openai' ? 'gpt-4.1' : 'claude-sonnet-4',
      };
      addProvider(config);
      templateProviders = [config];
    }

    loadGraph(createStarterTemplate(template, { providers: templateProviders }));
    completeOnboarding();
  };

  return (
    <main className="flex h-screen items-center justify-center bg-fleet-bg p-6">
      <div className="w-full max-w-5xl rounded-[32px] border border-fleet-border bg-fleet-surface/90 p-6 shadow-2xl backdrop-blur md:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
          <div className="rounded-[28px] border border-fleet-border bg-fleet-panel/60 p-6">
            <p className="text-sm uppercase tracking-[0.3em] text-fleet-accent">{t('onboarding.brand')}</p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight text-fleet-text">{t('onboarding.headline')}</h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-fleet-muted">{t('onboarding.intro')}</p>
            {step === 0 ? <WelcomeStep t={t} /> : null}
            {step === 1 ? <ChoiceGrid options={PROVIDER_OPTIONS} selected={provider} onSelect={setProvider} t={t} /> : null}
            {step === 2 ? <ChoiceGrid options={TEMPLATE_OPTIONS} selected={template} onSelect={setTemplate} t={t} /> : null}
            {step === 3 ? <DoneStep provider={provider} template={template} t={t} /> : null}
          </div>
          <div className="flex flex-col justify-between rounded-[28px] border border-fleet-border bg-fleet-bg/50 p-6">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-fleet-muted">{t('onboarding.stepOf', { n: String(step + 1) })}</div>
              <h2 className="mt-3 text-2xl font-semibold text-fleet-text">{[t('onboarding.step0Title'), t('onboarding.step1Title'), t('onboarding.step2Title'), t('onboarding.step3Title')][step]}</h2>
              <p className="mt-3 text-sm leading-6 text-fleet-muted">{[t('onboarding.step0Desc'), t('onboarding.step1Desc'), t('onboarding.step2Desc'), t('onboarding.step3Desc')][step]}</p>
            </div>
            <div>
              <div className="mb-6 flex items-center justify-center gap-2">
                {Array.from({ length: 4 }, (_, index) => (
                  <span key={`step-${index}`} className={`h-2.5 w-2.5 rounded-full ${index === step ? 'bg-fleet-accent' : 'bg-fleet-border'}`} />
                ))}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0} className="min-h-11 flex-1 rounded-xl border border-fleet-border px-4 text-sm text-fleet-text disabled:opacity-40">
                  {t('common.back')}
                </button>
                {step < 3 ? (
                  <button type="button" onClick={() => setStep((value) => Math.min(3, value + 1))} className="min-h-11 flex-1 rounded-xl bg-fleet-accent px-4 text-sm font-medium text-white shadow-neon transition hover:brightness-110">
                    {t('common.next')}
                  </button>
                ) : (
                  <button type="button" onClick={finishOnboarding} className="min-h-11 flex-1 rounded-xl bg-fleet-accent px-4 text-sm font-medium text-white shadow-neon transition hover:brightness-110">
                    {t('onboarding.launch')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function WelcomeStep({ t }: { t: (key: TKey, vars?: Record<string, string>) => string }): ReactElement {
  const items: TKey[] = ['onboarding.welcome1', 'onboarding.welcome2', 'onboarding.welcome3'];
  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-3">
      {items.map((key) => (
        <div key={key} className="rounded-2xl border border-fleet-border bg-black/10 p-4 text-sm text-fleet-text">
          {t(key)}
        </div>
      ))}
    </div>
  );
}

function ChoiceGrid<T extends string>({ options, selected, onSelect, t }: { options: ReadonlyArray<{ id: T; titleKey: TKey; descKey: TKey }>; selected: T; onSelect: (value: T) => void; t: (key: TKey, vars?: Record<string, string>) => string }): ReactElement {
  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-2">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onSelect(option.id)}
          className={`min-h-28 rounded-2xl border p-4 text-left transition ${selected === option.id ? 'border-fleet-accent bg-fleet-panel/70' : 'border-fleet-border bg-black/10 hover:border-fleet-accent/60'}`}
        >
          <div className="text-base font-semibold text-fleet-text">{t(option.titleKey)}</div>
          <p className="mt-2 text-sm leading-6 text-fleet-muted">{t(option.descKey)}</p>
        </button>
      ))}
    </div>
  );
}

function DoneStep({ provider, template, t }: { provider: string; template: string; t: (key: TKey, vars?: Record<string, string>) => string }): ReactElement {
  return (
    <div className="mt-8 space-y-4 rounded-2xl border border-fleet-border bg-black/10 p-5 text-sm text-fleet-text">
      <div>{t('onboarding.providerLabel')}: <span className="text-white">{provider}</span></div>
      <div>{t('onboarding.templateLabel')}: <span className="text-white">{template}</span></div>
      <ul className="space-y-2 text-fleet-muted">
        <li>{t('onboarding.doneHint1')}</li>
        <li>{t('onboarding.doneHint2')}</li>
        <li>{t('onboarding.doneHint3')}</li>
      </ul>
    </div>
  );
}