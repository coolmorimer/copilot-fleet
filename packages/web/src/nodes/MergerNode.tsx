import { memo } from 'react';

import { Position } from '@xyflow/react';
import { NODE_COLORS } from '@copilot-fleet/shared';
import { Merge } from 'lucide-react';

import { useT } from '../i18n/useT.js';
import { Field, FleetFlowNodeProps, HandlePort, NodeChrome, ProgressBar, StatusBadge, readNumber, readString } from './shared.js';

function MergerNodeComponent({ data, selected }: FleetFlowNodeProps) {
  const t = useT();
  const color = NODE_COLORS.merger;
  const totalInputs = Math.max(readNumber(data.config, ['inputs', 'expectedInputs'], 0), 2);
  const receivedInputs = Math.min(readNumber(data.config, ['received', 'receivedInputs'], 0), totalInputs);
  const strategy = readString(data.config, ['strategy', 'mergeStrategy'], 'all');
  const receiveProgress = totalInputs > 0 ? (receivedInputs / totalInputs) * 100 : 0;
  const handleIds = ['merger-left', 'merger-right', 'merger-in-3', 'merger-in-4', 'merger-in-5'];

  return (
    <NodeChrome
      data={data}
      selected={selected}
      icon={<Merge size={14} />}
      title={t('nodeTitle.merge')}
      accent={color}
      minWidth={220}
      footer={
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <StatusBadge status={data.status} />
            <span className="text-[10px] text-fleet-muted">{receivedInputs}/{totalInputs} {t('nodeCard.received')}</span>
          </div>
          <ProgressBar progress={receiveProgress} accent={color.glow} />
        </div>
      }
    >
      {Array.from({ length: totalInputs }, (_, index) => (
        <HandlePort
          key={`merge-${index}`}
          id={handleIds[index] ?? `merger-in-${index + 1}`}
          type="target"
          position={Position.Left}
          color={color.glow}
          top={`${((index + 1) / (totalInputs + 1)) * 100}%`}
        />
      ))}
      <HandlePort type="source" position={Position.Right} color={color.glow} id="merger-out" />
      <Field label={t('nodeCard.waiting')} value={t('nodeCard.waitsForInputs', { n: String(totalInputs) })} />
      <Field label={t('nodeCard.strategy')} value={<span className="capitalize">{strategy}</span>} />
    </NodeChrome>
  );
}

export const MergerNode = memo(MergerNodeComponent);