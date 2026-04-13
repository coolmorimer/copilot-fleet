import type { ReactElement } from 'react';
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow } from '@xyflow/react';
import type { Edge, Node } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';

import { edgeTypes } from '../edges/index.js';
import { nodeTypes } from '../nodes/index.js';
import { getNodeColor } from '../styles/theme.js';
import type { FleetNodeData } from '../store/graph-store.js';
import { useGraphStore } from '../store/graph-store.js';
import { useSettingsStore } from '../store/settings-store.js';
import { AGENT_LIBRARY } from './agent-library.data.js';

export function Canvas(): ReactElement {
  const { screenToFlowPosition } = useReactFlow<Node<FleetNodeData>, Edge>();
  const nodes = useGraphStore((state) => state.nodes);
  const edges = useGraphStore((state) => state.edges);
  const addNode = useGraphStore((state) => state.addNode);
  const updateNodeData = useGraphStore((state) => state.updateNodeData);
  const onNodesChange = useGraphStore((state) => state.onNodesChange);
  const onEdgesChange = useGraphStore((state) => state.onEdgesChange);
  const onConnect = useGraphStore((state) => state.onConnect);
  const selectNode = useGraphStore((state) => state.selectNode);
  const showMinimap = useSettingsStore((state) => state.showMinimap);
  const showGrid = useSettingsStore((state) => state.showGrid);
  const snapToGrid = useSettingsStore((state) => state.snapToGrid);
  const gridSize = useSettingsStore((state) => state.gridSize);

  return (
    <div className="min-h-0 flex-1 bg-fleet-bg">
      <ReactFlow<Node<FleetNodeData>, Edge>
        colorMode="dark"
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ type: 'data' }}
        fitView
        snapToGrid={snapToGrid}
        snapGrid={[gridSize, gridSize]}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(event) => {
          event.preventDefault();
          const type = event.dataTransfer.getData('application/reactflow') as FleetNodeData['nodeType'] | '';
          if (!type) {
            return;
          }

          const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
          const nodeId = addNode(type, position);
          if (!nodeId) {
            return;
          }

          const agentId = event.dataTransfer.getData('application/copilot-fleet-agent');
          if (agentId) {
            const agent = AGENT_LIBRARY.find((item) => item.id === agentId);
            if (agent) {
              updateNodeData(nodeId, {
                label: agent.name,
                description: agent.description,
                config: {
                  agentId: agent.id,
                  provider: agent.provider,
                  model: agent.model,
                  systemPrompt: agent.systemPrompt,
                  skills: agent.skills,
                  temperature: 0.3,
                  maxTokens: 4096,
                  timeout: 1800000,
                  files: [],
                },
              });
            }
          }
        }}
        onSelectionChange={({ nodes: selectedNodes }) => {
          selectNode(selectedNodes[0]?.id ?? null);
        }}
        className="bg-fleet-bg"
      >
        {showGrid ? <Background variant={BackgroundVariant.Dots} gap={gridSize} size={1} /> : null}
        <Controls showInteractive={false} />
        {showMinimap ? (
          <MiniMap<Node<FleetNodeData>>
            pannable
            zoomable
            nodeColor={(node) => getNodeColor(node.data.nodeType).header}
            nodeStrokeColor={(node) => getNodeColor(node.data.nodeType).glow}
            maskColor="rgba(15, 52, 96, 0.35)"
          />
        ) : null}
      </ReactFlow>
    </div>
  );
}