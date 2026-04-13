import { memo } from 'react';

import { Position } from '@xyflow/react';
import { NODE_COLORS } from '@copilot-fleet/shared';
import { FileOutput } from 'lucide-react';

import { useT } from '../i18n/useT.js';
import { Field, FleetFlowNodeProps, HandlePort, NodeChrome, StatusBadge, previewValue, readString } from './shared.js';

function OutputNodeComponent({ data, selected }: FleetFlowNodeProps) {
  const t = useT();
  const color = NODE_COLORS.output;
  const outputType = readString(data.config, ['outputType', 'type'], 'report');
  const resultPreview = readString(data.config, ['resultSummary', 'resultPreview', 'result'], t('nodeCard.awaitingOutput'));

  return (
    <NodeChrome
      data={data}
      selected={selected}
      icon={<FileOutput size={14} />}
      title={t('nodeTitle.output')}
      accent={color}
      minWidth={220}
      footer={
        <div className="flex items-center justify-between gap-2">
          <StatusBadge status={data.status} />
          {data.status === 'done' ? <span className="text-[10px] text-emerald-300">{t('nodeCard.resultReady')}</span> : null}
        </div>
      }
    >
      <HandlePort type="target" position={Position.Left} color={color.glow} id="output-in" />
      <Field label={t('nodeCard.outputType')} value={<span className="capitalize">{outputType}</span>} />
      <Field label={data.status === 'done' ? t('nodeCard.summary') : t('nodeCard.preview')} value={<p className="leading-5">{previewValue(resultPreview, 140)}</p>} />
    </NodeChrome>
  );
}

export const OutputNode = memo(OutputNodeComponent);