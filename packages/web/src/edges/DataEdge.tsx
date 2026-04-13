import type { ReactElement } from 'react';

import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';

type DataEdgeData = {
  active?: boolean;
};

export function DataEdge({ data, label, ...props }: EdgeProps): ReactElement {
  const [edgePath, labelX, labelY] = getSmoothStepPath(props);
  const edgeData = (data ?? {}) as DataEdgeData;
  const isActive = props.animated || edgeData.active;
  const labelText = typeof label === 'string' || typeof label === 'number' ? String(label) : null;

  return (
    <>
      <BaseEdge path={edgePath} style={{ stroke: isActive ? '#6366f1' : '#4a4a6a', strokeWidth: 2 }} />
      {labelText ? (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-fleet-border bg-fleet-surface/95 px-2 py-1 text-[10px] font-medium text-fleet-text shadow-lg"
            style={{ left: labelX, top: labelY }}
          >
            {labelText}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}