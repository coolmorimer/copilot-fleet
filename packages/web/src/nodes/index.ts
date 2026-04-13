import { AgentNode } from './AgentNode.js';
import { ConditionNode } from './ConditionNode.js';
import { GroupNode } from './GroupNode.js';
import { HumanNode } from './HumanNode.js';
import { LLMNode } from './LLMNode.js';
import { MergerNode } from './MergerNode.js';
import { OutputNode } from './OutputNode.js';
import { SplitterNode } from './SplitterNode.js';
import { ToolNode } from './ToolNode.js';
import { TriggerNode } from './TriggerNode.js';

export const nodeTypes = {
  trigger: TriggerNode,
  agent: AgentNode,
  llm: LLMNode,
  splitter: SplitterNode,
  merger: MergerNode,
  condition: ConditionNode,
  human: HumanNode,
  tool: ToolNode,
  output: OutputNode,
  group: GroupNode,
};

export type { FleetNodeData } from '../store/graph-store.js';