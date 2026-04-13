import type { ReactElement } from 'react';

import { BaseEdge, getBezierPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';

type AnimatedEdgeData = {
  animated?: boolean;
  color?: string;
  sourceColor?: string;
  targetColor?: string;
};

export function AnimatedEdge({ id, data, ...props }: EdgeProps): ReactElement {
  const [edgePath] = getBezierPath(props);
  const edgeData = (data ?? {}) as AnimatedEdgeData;
  const isAnimated = edgeData.animated ?? props.animated ?? true;
  const sourceColor = edgeData.sourceColor ?? edgeData.color ?? '#6366f1';
  const targetColor = edgeData.targetColor ?? '#22d3ee';
  const gradientId = `fleet-edge-${id}`;

  return (
    <>
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={props.sourceX} y1={props.sourceY} x2={props.targetX} y2={props.targetY}>
          <stop offset="0%" stopColor={sourceColor} />
          <stop offset="100%" stopColor={targetColor} />
        </linearGradient>
      </defs>
      {isAnimated ? (
        <BaseEdge
          path={edgePath}
          style={{
            stroke: `url(#${gradientId})`,
            strokeWidth: 7,
            strokeOpacity: 0.18,
            filter: `drop-shadow(0 0 10px ${sourceColor})`,
          }}
        />
      ) : null}
      <BaseEdge
        path={edgePath}
        style={{
          stroke: `url(#${gradientId})`,
          strokeWidth: 2.5,
          strokeDasharray: '8 4',
          animation: isAnimated ? 'flow-dash 1s linear infinite' : undefined,
          filter: isAnimated ? `drop-shadow(0 0 8px ${sourceColor})` : undefined,
        }}
      />
    </>
  );
}