import { memo } from 'react';

import { Position } from '@xyflow/react';
import { NODE_COLORS } from '@copilot-fleet/shared';
import { Wrench } from 'lucide-react';

import { useT } from '../i18n/useT.js';
import { Field, FleetFlowNodeProps, HandlePort, NodeChrome, StatusFooter, previewValue, readRecord, readString } from './shared.js';

function ToolNodeComponent({ data, selected }: FleetFlowNodeProps) {
  const t = useT();
  const color = NODE_COLORS.tool;
  const toolName = readString(data.config, ['toolName', 'name'], t('nodeCard.tool'));
  const parameters = readRecord(data.config, ['parameters', 'args']);

  return (
    <NodeChrome
      data={data}
      selected={selected}
      icon={<Wrench size={14} />}
      title={t('nodeTitle.tool')}
      accent={color}
      minWidth={230}
      footer={<StatusFooter data={data} accent={color.glow} />}
    >
      <HandlePort type="target" position={Position.Left} color={color.glow} id="tool-in" />
      <HandlePort type="source" position={Position.Right} color={color.glow} id="tool-out" />
      <Field label={t('nodeCard.tool')} value={<span className="font-mono text-[10px]">{previewValue(toolName, 36)}</span>} />
      <Field label={t('nodeCard.parameters')} value={<p className="leading-5 text-fleet-text/90">{previewValue(parameters, 140)}</p>} mono />
    </NodeChrome>
  );
}

export const ToolNode = memo(ToolNodeComponent);