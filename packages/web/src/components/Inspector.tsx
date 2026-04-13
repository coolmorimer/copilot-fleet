import type { ChangeEvent, ReactElement } from 'react';
import type { NodeStatus, ProviderType } from '@copilot-fleet/shared';

import { NODE_ICON_ELEMENTS, STATUS_COLORS, STATUS_ICONS } from '../styles/theme.js';
import { useGraphStore } from '../store/graph-store.js';
import { useSettingsStore } from '../store/settings-store.js';
import { useT } from '../i18n/useT.js';

const STATUSES: NodeStatus[] = ['idle', 'queued', 'running', 'done', 'error', 'skipped', 'cancelled'];
const PROVIDERS: ProviderType[] = ['github-copilot', 'openai', 'anthropic', 'ollama', 'lmstudio', 'custom-api', 'vscode-local'];

const PROVIDER_MODELS: Record<ProviderType, string[]> = {
  'github-copilot': ['claude-sonnet-4', 'gpt-4.1', 'gpt-4o', 'o3', 'o4-mini'],
  'openai': ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'o3', 'o4-mini'],
  'anthropic': ['claude-sonnet-4', 'claude-opus-4', 'claude-haiku'],
  'ollama': ['qwen2.5-coder', 'llama3.2', 'codestral', 'deepseek-coder-v2'],
  'lmstudio': ['qwen2.5-coder', 'llama3.2', 'codestral'],
  'custom-api': ['gpt-4.1', 'gpt-4.1-mini'],
  'vscode-local': ['copilot'],
};

const readString = (config: Record<string, unknown>, key: string, fallback = ''): string => {
  const value = config[key];
  return typeof value === 'string' ? value : fallback;
};

const readNumber = (config: Record<string, unknown>, key: string, fallback = 0): number => {
  const value = config[key];
  return typeof value === 'number' ? value : fallback;
};

const readList = (config: Record<string, unknown>, key: string): string[] => {
  const value = config[key];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return [];
};

export function Inspector(): ReactElement {
  const t = useT();
  const selectedNode = useGraphStore((state) => state.getSelectedNode());
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const updateNodeData = useGraphStore((state) => state.updateNodeData);
  const removeNode = useGraphStore((state) => state.removeNode);
  const duplicateNode = useGraphStore((state) => state.duplicateNode);
  const providers = useSettingsStore((state) => state.providers);

  const updateConfig = (patch: Record<string, unknown>): void => {
    if (!selectedNode) {
      return;
    }
    updateNodeData(selectedNode.id, { config: { ...selectedNode.data.config, ...patch } });
  };

  const updateField = (field: 'label' | 'description') => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!selectedNode) {
      return;
    }
    updateNodeData(selectedNode.id, { [field]: event.target.value });
  };

  if (!selectedNode) {
    return (
      <aside className="hidden h-full w-[300px] shrink-0 items-center justify-center border-l border-fleet-border bg-fleet-surface/70 p-4 text-center text-sm text-fleet-muted xl:flex">
        {t('inspector.selectHint')}
      </aside>
    );
  }

  const selectedProvider = readString(selectedNode.data.config, 'provider', 'github-copilot') as ProviderType;
  const fallbackModels = PROVIDER_MODELS[selectedProvider] ?? PROVIDER_MODELS['github-copilot'];
  const configuredModels = providers.find((provider) => provider.type === selectedProvider)?.models ?? [];
  const providerModels = Array.from(new Set([...fallbackModels, ...configuredModels])).filter(Boolean);

  return (
    <aside className="hidden h-full w-[300px] shrink-0 flex-col border-l border-fleet-border bg-fleet-surface/70 xl:flex">
      <div className="border-b border-fleet-border px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-fleet-muted">{t('inspector.selectedNode')}</div>
            <h2 className="mt-2 flex items-center gap-2 text-base font-semibold text-fleet-text">
              <span className="flex items-center text-fleet-muted">{NODE_ICON_ELEMENTS[selectedNode.data.nodeType]}</span>
              <span>{selectedNode.data.label}</span>
            </h2>
          </div>
          <span className="rounded-full border border-fleet-border px-2 py-0.5 text-[11px] uppercase tracking-[0.2em] text-fleet-muted">{selectedNodeId ?? selectedNode.data.nodeType}</span>
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm text-fleet-text">
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-[0.2em] text-fleet-muted">{t('inspector.label')}</span>
          <input
            value={selectedNode.data.label}
            onChange={updateField('label')}
            className="w-full rounded-lg border border-fleet-border bg-fleet-panel px-3 py-2 outline-none focus:border-fleet-accent"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-[0.2em] text-fleet-muted">{t('inspector.description')}</span>
          <textarea
            value={selectedNode.data.description ?? ''}
            onChange={updateField('description')}
            className="min-h-24 w-full rounded-lg border border-fleet-border bg-fleet-panel px-3 py-2 outline-none focus:border-fleet-accent"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-[0.2em] text-fleet-muted">{t('inspector.status')}</span>
          <select
            value={selectedNode.data.status}
            onChange={(event) => updateNodeData(selectedNode.id, { status: event.target.value as NodeStatus })}
            className="w-full rounded-lg border border-fleet-border bg-fleet-panel px-3 py-2 outline-none focus:border-fleet-accent"
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_ICONS[status]} {status}
              </option>
            ))}
          </select>
        </label>
        <div className="space-y-2 rounded-xl border border-fleet-border bg-fleet-bg/40 p-3">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-fleet-muted">
            <span>{t('inspector.progress')}</span>
            <span>{selectedNode.data.progress}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={selectedNode.data.progress}
            onChange={(event) => updateNodeData(selectedNode.id, { progress: Number(event.target.value) })}
            className="w-full accent-fleet-accent"
          />
        </div>
        <div className="rounded-xl border border-fleet-border bg-fleet-bg/40 p-3 text-xs text-fleet-muted">
          <div className="mb-2 font-semibold uppercase tracking-[0.2em]">{t('inspector.statusTone')}</div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[selectedNode.data.status] }} />
            <span>{selectedNode.data.status}</span>
          </div>
        </div>
        <NodeSpecificFields
          nodeType={selectedNode.data.nodeType}
          config={selectedNode.data.config}
          providerModels={providerModels}
          updateConfig={updateConfig}
        />
      </div>
      <div className="flex gap-2 border-t border-fleet-border p-4 text-sm">
        <button
          type="button"
          onClick={() => duplicateNode(selectedNode.id)}
          className="flex-1 rounded-lg border border-fleet-border bg-fleet-panel px-3 py-2 transition hover:border-fleet-accent"
        >
          {t('common.duplicate')}
        </button>
        <button
          type="button"
          onClick={() => removeNode(selectedNode.id)}
          className="flex-1 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-red-100 transition hover:border-red-400"
        >
          {t('common.delete')}
        </button>
      </div>
    </aside>
  );
}

interface NodeSpecificFieldsProps {
  nodeType: string;
  config: Record<string, unknown>;
  providerModels: string[];
  updateConfig: (patch: Record<string, unknown>) => void;
}

function NodeSpecificFields({ nodeType, config, providerModels, updateConfig }: NodeSpecificFieldsProps): ReactElement | null {
  const t = useT();

  if (nodeType === 'agent') {
    return (
      <div className="space-y-3 rounded-2xl border border-fleet-border bg-fleet-bg/30 p-3">
        <SelectField label={t('nodeCard.provider')} value={readString(config, 'provider', 'github-copilot')} options={PROVIDERS} onChange={(value) => updateConfig({ provider: value })} />
        <SelectField label={t('nodeCard.model')} value={readString(config, 'model', providerModels[0] ?? 'claude-sonnet-4')} options={providerModels.length > 0 ? providerModels : ['claude-sonnet-4']} onChange={(value) => updateConfig({ model: value })} />
        <TextAreaField label={t('nodeCard.prompt')} value={readString(config, 'systemPrompt')} onChange={(value) => updateConfig({ systemPrompt: value })} />
        <TextAreaField label={t('nodeCard.files')} value={readList(config, 'files').join('\n')} onChange={(value) => updateConfig({ files: value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean) })} />
        <RangeField label={t('nodeCard.temperature')} value={readNumber(config, 'temperature', 0.3)} min={0} max={1} step={0.05} onChange={(value) => updateConfig({ temperature: value })} />
        <RangeField label={t('nodeCard.maxTokens')} value={readNumber(config, 'maxTokens', 4096)} min={256} max={8192} step={256} onChange={(value) => updateConfig({ maxTokens: value })} />
        <RangeField label={t('inspector.timeoutSec')} value={Math.round(readNumber(config, 'timeout', 1800000) / 1000)} min={30} max={3600} step={30} onChange={(value) => updateConfig({ timeout: value * 1000 })} />
      </div>
    );
  }

  if (nodeType === 'trigger') {
    return <SelectField label={t('inspector.triggerType')} value={readString(config, 'triggerType', 'manual')} options={['manual', 'schedule', 'webhook']} onChange={(value) => updateConfig({ triggerType: value })} />;
  }

  if (nodeType === 'condition') {
    return <TextAreaField label={t('inspector.conditionExpr')} value={readString(config, 'expression')} onChange={(value) => updateConfig({ expression: value })} />;
  }

  if (nodeType === 'output') {
    return <SelectField label={t('inspector.outputType')} value={readString(config, 'outputType', 'markdown')} options={['markdown', 'summary', 'handoff', 'report']} onChange={(value) => updateConfig({ outputType: value })} />;
  }

  if (nodeType === 'llm') {
    return (
      <div className="space-y-3 rounded-2xl border border-fleet-border bg-fleet-bg/30 p-3">
        <SelectField label={t('nodeCard.model')} value={readString(config, 'model', providerModels[0] ?? 'claude-sonnet-4')} options={providerModels.length > 0 ? providerModels : ['claude-sonnet-4']} onChange={(value) => updateConfig({ model: value })} />
        <TextAreaField label={t('nodeCard.prompt')} value={readString(config, 'prompt')} onChange={(value) => updateConfig({ prompt: value })} />
        <RangeField label={t('nodeCard.temperature')} value={readNumber(config, 'temperature', 0.2)} min={0} max={1} step={0.05} onChange={(value) => updateConfig({ temperature: value })} />
      </div>
    );
  }

  if (nodeType === 'splitter' || nodeType === 'merger') {
    return <RangeField label={t('inspector.branchCount')} value={readNumber(config, nodeType === 'splitter' ? 'branchCount' : 'expectedInputs', 2)} min={2} max={5} step={1} onChange={(value) => updateConfig(nodeType === 'splitter' ? { branchCount: value } : { expectedInputs: value })} />;
  }

  if (nodeType === 'human') {
    return <TextAreaField label={t('inspector.instruction')} value={readString(config, 'instruction')} onChange={(value) => updateConfig({ instruction: value })} />;
  }

  if (nodeType === 'tool') {
    return (
      <div className="space-y-3 rounded-2xl border border-fleet-border bg-fleet-bg/30 p-3">
        <InputField label={t('inspector.toolName')} value={readString(config, 'toolName')} onChange={(value) => updateConfig({ toolName: value })} />
        <TextAreaField label={t('inspector.parameters')} value={JSON.stringify(config.parameters ?? {}, null, 2)} onChange={(value) => updateConfig({ parameters: parseJsonRecord(value) })} />
      </div>
    );
  }

  return null;
}

function parseJsonRecord(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function InputField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }): ReactElement {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-[0.2em] text-fleet-muted">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-fleet-border bg-fleet-panel px-3 py-2 outline-none focus:border-fleet-accent" />
    </label>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }): ReactElement {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-[0.2em] text-fleet-muted">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-24 w-full rounded-lg border border-fleet-border bg-fleet-panel px-3 py-2 outline-none focus:border-fleet-accent" />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }): ReactElement {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-[0.2em] text-fleet-muted">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-fleet-border bg-fleet-panel px-3 py-2 outline-none focus:border-fleet-accent">
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function RangeField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }): ReactElement {
  return (
    <label className="block space-y-1">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-fleet-muted">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-fleet-accent" />
    </label>
  );
}