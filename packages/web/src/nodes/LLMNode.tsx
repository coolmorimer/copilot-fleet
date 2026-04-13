import { memo } from 'react';

import { Position } from '@xyflow/react';
import { NODE_COLORS } from '@copilot-fleet/shared';
import { Brain } from 'lucide-react';

import { useT } from '../i18n/useT.js';
import {
  Field,
  FleetFlowNodeProps,
  HandlePort,
  NodeChrome,
  StatusFooter,
  previewValue,
  readNumber,
  readRecord,
  readString,
} from './shared.js';

function LLMNodeComponent({ data, selected }: FleetFlowNodeProps) {
  const t = useT();
  const color = NODE_COLORS.llm;
  const model = readString(data.config, ['model', 'modelName'], t('nodeCard.modelNotSet'));
  const prompt = readString(data.config, ['prompt', 'userPrompt'], t('nodeCard.promptNotSet'));
  const temperature = readNumber(data.config, ['temperature'], 0.2);
  const usage = readRecord(data.config, ['usage', 'tokenUsage']);
  const totalTokens = usage && typeof usage.totalTokens === 'number' ? usage.totalTokens : readNumber(data.config, ['totalTokens'], 0);

  return (
    <NodeChrome
      data={data}
      selected={selected}
      icon={<Brain size={14} />}
      title={t('nodeTitle.llm')}
      accent={color}
      minWidth={240}
      footer={<StatusFooter data={data} accent={color.glow} />}
    >
      <HandlePort type="target" position={Position.Left} color={color.glow} id="llm-in" />
      <HandlePort type="source" position={Position.Right} color={color.glow} id="llm-out" />
      <Field label={t('nodeCard.model')} value={<span className="font-mono text-[10px]">{previewValue(model, 36)}</span>} />
      <Field label={t('nodeCard.prompt')} value={<p className="leading-5 text-fleet-text/90">{previewValue(prompt, 120)}</p>} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('nodeCard.temperature')} value={temperature.toFixed(1)} />
        <Field label={t('nodeCard.tokens')} value={data.status === 'done' ? totalTokens || '—' : t('nodeCard.pending')} />
      </div>
    </NodeChrome>
  );
}

export const LLMNode = memo(LLMNodeComponent);