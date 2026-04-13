import { memo } from 'react';

import { Position } from '@xyflow/react';
import { NODE_COLORS } from '@copilot-fleet/shared';
import { Split } from 'lucide-react';

import { useT } from '../i18n/useT.js';
import { Field, FleetFlowNodeProps, HandlePort, NodeChrome, StatusFooter, readNumber, readStringList } from './shared.js';

function SplitterNodeComponent({ data, selected }: FleetFlowNodeProps) {
  const t = useT();
  const color = NODE_COLORS.splitter;
  const branchNames = readStringList(data.config, ['branchLabels', 'branches']);
  const configuredBranches = readNumber(data.config, ['branches', 'branchCount'], 0);
  const branchCount = Math.max(branchNames.length, configuredBranches, 2);
  const handleIds = ['splitter-a', 'splitter-b', 'splitter-c', 'splitter-d', 'splitter-e'];

  return (
    <NodeChrome
      data={data}
      selected={selected}
      icon={<Split size={14} />}
      title={t('nodeTitle.fork')}
      accent={color}
      minWidth={220}
      footer={<StatusFooter data={data} accent={color.glow} />}
    >
      <HandlePort type="target" position={Position.Left} color={color.glow} id="splitter-in" />
      {Array.from({ length: branchCount }, (_, index) => (
        <HandlePort
          key={`split-${index}`}
          id={handleIds[index] ?? `splitter-${index + 1}`}
          type="source"
          position={Position.Right}
          color={color.glow}
          top={`${((index + 1) / (branchCount + 1)) * 100}%`}
        />
      ))}
      <Field label={t('nodeCard.branches')} value={t('nodeCard.splitsInto', { n: String(branchCount) })} />
      <div className="flex flex-wrap gap-1.5 text-[10px] text-fleet-muted">
        {Array.from({ length: branchCount }, (_, index) => (
          <span key={`branch-label-${index}`} className="rounded-full border border-fleet-border bg-fleet-surface/40 px-2 py-0.5">
            {branchNames[index] ?? `${t('nodeCard.branch')} ${index + 1}`}
          </span>
        ))}
      </div>
    </NodeChrome>
  );
}

export const SplitterNode = memo(SplitterNodeComponent);