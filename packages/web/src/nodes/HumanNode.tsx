import { memo } from 'react';

import { Position } from '@xyflow/react';
import { NODE_COLORS } from '@copilot-fleet/shared';
import { User } from 'lucide-react';

import { useT } from '../i18n/useT.js';
import { Field, FleetFlowNodeProps, HandlePort, NodeChrome, StatusFooter, previewValue, readString } from './shared.js';

function HumanNodeComponent({ data, selected }: FleetFlowNodeProps) {
  const t = useT();
  const color = NODE_COLORS.human;
  const instruction = readString(data.config, ['instruction', 'prompt', 'message'], t('nodeCard.awaitingInstructions'));

  return (
    <NodeChrome
      data={data}
      selected={selected}
      icon={<User size={14} />}
      title={t('nodeTitle.humanApproval')}
      accent={color}
      minWidth={240}
      footer={<StatusFooter data={data} accent={color.glow} />}
    >
      <HandlePort type="target" position={Position.Left} color={color.glow} id="human-in" />
      <HandlePort type="source" position={Position.Right} color={color.glow} id="human-out" />
      <Field label={t('nodeCard.instruction')} value={<p className="leading-5 text-fleet-text/90">{previewValue(instruction, 132)}</p>} />
      {data.status === 'running' ? (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-pink-300">{t('nodeCard.waitingApproval')}</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-[10px] font-semibold text-emerald-200"
            >
              {t('nodeCard.approve')}
            </button>
            <button
              type="button"
              className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-[10px] font-semibold text-rose-200"
            >
              {t('nodeCard.reject')}
            </button>
          </div>
        </div>
      ) : null}
    </NodeChrome>
  );
}

export const HumanNode = memo(HumanNodeComponent);