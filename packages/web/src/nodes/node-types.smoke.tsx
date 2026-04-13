import type { ComponentType } from 'react';

import type { NodeProps, Node } from '@xyflow/react';

import { nodeTypes } from './index.js';
import type { FleetNodeData } from '../store/graph-store.js';

type FleetNodeComponent = ComponentType<NodeProps<Node<FleetNodeData>>>;

const registry: Record<FleetNodeData['nodeType'], FleetNodeComponent> = nodeTypes;

export const smokeNodeTypes = registry;