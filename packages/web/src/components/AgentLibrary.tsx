import type { DragEvent, ReactElement, ReactNode } from 'react';

import { Bot, FileText, Lock, Map, Palette, Search, Settings, Shield, Wrench } from 'lucide-react';
import { FlaskConical } from 'lucide-react';

import type { TKey } from '../i18n/translations.js';
import { useT } from '../i18n/useT.js';
import { useGraphStore } from '../store/graph-store.js';
import { AGENT_LIBRARY } from './agent-library.data.js';
import type { AgentIconId } from './agent-library.data.js';

const ICON_MAP: Record<AgentIconId, ReactNode> = {
  'bot': <Bot size={18} />,
  'shield': <Shield size={18} />,
  'flask': <FlaskConical size={18} />,
  'wrench': <Wrench size={18} />,
  'file-text': <FileText size={18} />,
  'lock': <Lock size={18} />,
  'palette': <Palette size={18} />,
  'settings': <Settings size={18} />,
  'search': <Search size={18} />,
  'map': <Map size={18} />,
};

interface AgentLibraryProps {
  filter: 'builtin' | 'custom';
  searchQuery?: string;
}

export function AgentLibrary({ filter, searchQuery = '' }: AgentLibraryProps): ReactElement {
  const t = useT();
  const addNode = useGraphStore((state) => state.addNode);
  const updateNodeData = useGraphStore((state) => state.updateNodeData);
  const query = searchQuery.trim().toLowerCase();

  const tName = (id: string): string => t(`agent.${id}` as TKey);
  const tDesc = (id: string): string => t(`agent.${id}Desc` as TKey);

  const agents = AGENT_LIBRARY.filter((agent) => (filter === 'builtin' ? agent.builtin : !agent.builtin)).filter((agent) => {
    if (!query) {
      return true;
    }

    return `${agent.name} ${tName(agent.id)} ${agent.description} ${tDesc(agent.id)} ${agent.id}`.toLowerCase().includes(query);
  });

  const createAgentNode = (agentId: string): void => {
    const agent = AGENT_LIBRARY.find((item) => item.id === agentId);
    if (!agent) {
      return;
    }

    const nodeId = addNode('agent', { x: 280, y: 180 });
    if (!nodeId) {
      return;
    }

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
  };

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, agentId: string): void => {
    event.dataTransfer.setData('application/reactflow', 'agent');
    event.dataTransfer.setData('application/copilot-fleet-agent', agentId);
    event.dataTransfer.effectAllowed = 'move';
  };

  if (agents.length === 0) {
    return <div className="rounded-xl border border-dashed border-fleet-border bg-fleet-bg/30 px-3 py-4 text-xs text-fleet-muted">{t('agent.noMatch')}</div>;
  }

  return (
    <div className="grid gap-2">
      {agents.map((agent) => (
        <button
          key={agent.id}
          type="button"
          draggable
          onDragStart={(event) => handleDragStart(event, agent.id)}
          onClick={() => createAgentNode(agent.id)}
          className="min-h-11 rounded-2xl border border-fleet-border bg-fleet-panel/50 p-3 text-left transition hover:border-fleet-accent hover:bg-fleet-panel"
          style={{ boxShadow: `inset 0 0 0 1px ${agent.color}22` }}
        >
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${agent.color}22`, color: agent.color }}>
              {ICON_MAP[agent.icon] ?? <Bot size={18} />}
            </span>
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-sm font-semibold text-fleet-text">{tName(agent.id)}</span>
                <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.12em]" style={{ backgroundColor: `${agent.color}1f`, color: agent.color }}>
                  {filter === 'builtin' ? t('agent.builtin') : t('agent.custom')}
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-4 text-fleet-muted line-clamp-2">{tDesc(agent.id)}</p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}