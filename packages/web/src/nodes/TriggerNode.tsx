import { memo } from 'react';

import { Position } from '@xyflow/react';
import { NODE_COLORS } from '@copilot-fleet/shared';
import { Play } from 'lucide-react';

import { useT } from '../i18n/useT.js';
import { Field, FleetFlowNodeProps, HandlePort, NodeChrome, StatusFooter, readString } from './shared.js';

function TriggerNodeComponent({ data, selected }: FleetFlowNodeProps) {
  const t = useT();
  const color = NODE_COLORS.trigger;
  const triggerType = readString(data.config, ['triggerType', 'mode', 'type'], 'manual');

  return (
    <NodeChrome
      data={data}
      selected={selected}
      icon={<Play size={14} />}
      title={t('nodeTitle.start')}
      accent={color}
      minWidth={200}
      footer={<StatusFooter data={data} accent={color.glow} />}
    >
      <HandlePort type="source" position={Position.Right} color={color.glow} id="trigger-out" />
      <Field label={t('nodeCard.trigger')} value={<span className="capitalize">{triggerType}</span>} />
    </NodeChrome>
  );
}

export const TriggerNode = memo(TriggerNodeComponent);