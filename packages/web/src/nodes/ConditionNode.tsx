import { memo } from 'react';

import { Position } from '@xyflow/react';
import { NODE_COLORS } from '@copilot-fleet/shared';
import { GitBranch } from 'lucide-react';

import { useT } from '../i18n/useT.js';
import { Field, FleetFlowNodeProps, HandlePort, NodeChrome, StatusFooter, previewValue, readString } from './shared.js';

function ConditionNodeComponent({ data, selected }: FleetFlowNodeProps) {
  const t = useT();
  const color = NODE_COLORS.condition;
  const condition = readString(data.config, ['condition', 'expression'], t('nodeCard.noCondition'));

  return (
    <NodeChrome
      data={data}
      selected={selected}
      icon={<GitBranch size={14} />}
      title={t('nodeTitle.condition')}
      accent={color}
      minWidth={220}
      footer={<StatusFooter data={data} accent={color.glow} />}
    >
      <HandlePort type="target" position={Position.Left} color={color.glow} id="condition-in" />
      <HandlePort type="source" position={Position.Right} color={color.glow} id="condition-true" top="34%" />
      <HandlePort type="source" position={Position.Right} color={color.header} id="condition-false" top="68%" />
      <div className="flex items-center gap-3 rounded-lg border border-fleet-border bg-fleet-surface/30 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-red-400/30 bg-red-500/10 text-red-200 [transform:rotate(45deg)]">
          <span className="[transform:rotate(-45deg)]">◇</span>
        </div>
        <p className="leading-5 text-fleet-text/90">{previewValue(condition, 120)}</p>
      </div>
      <Field label={t('nodeCard.branches')} value={<span className="text-fleet-muted">{t('nodeCard.truePath')}</span>} />
      <div className="flex justify-end gap-4 text-[10px] text-fleet-muted">
        <span>{t('nodeCard.true')}</span>
        <span>{t('nodeCard.false')}</span>
      </div>
    </NodeChrome>
  );
}

export const ConditionNode = memo(ConditionNodeComponent);