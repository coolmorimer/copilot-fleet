import { memo } from 'react';

import { NODE_COLORS } from '@copilot-fleet/shared';
import { Boxes } from 'lucide-react';

import { useT } from '../i18n/useT.js';
import { FleetFlowNodeProps, NodeChrome, previewValue } from './shared.js';

function GroupNodeComponent({ data, selected }: FleetFlowNodeProps) {
  const t = useT();
  const color = NODE_COLORS.group;

  return (
    <NodeChrome
      data={data}
      selected={selected}
      icon={<Boxes size={14} />}
      title={t('nodeTitle.group')}
      accent={color}
      minWidth={400}
      className="min-h-[180px]"
      bodyClassName="h-[132px]"
    >
      <div
        className="flex h-full flex-col justify-between rounded-lg border border-dashed border-fleet-border/40 bg-fleet-surface/20 p-4"
      >
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-fleet-muted">{t('nodeCard.container')}</div>
          <div className="mt-2 text-base font-semibold text-fleet-text">{data.label}</div>
        </div>
        <p className="max-w-[28rem] text-[11px] leading-5 text-fleet-muted">{previewValue(data.description ?? t('nodeCard.containerDesc'), 180)}</p>
      </div>
    </NodeChrome>
  );
}

export const GroupNode = memo(GroupNodeComponent);