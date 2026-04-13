import { useState } from 'react';
import type { DragEvent, ReactElement, ReactNode } from 'react';
import type { NodeType } from '@copilot-fleet/shared';

import { Boxes, Brain, ChevronDown, ChevronLeft, FileOutput, GitBranch, Merge, Play, Search, Split, User, Wrench } from 'lucide-react';

import { useGraphStore } from '../store/graph-store.js';
import { AgentLibrary } from './AgentLibrary.js';
import { SessionHistory } from './SessionHistory.js';
import { useT } from '../i18n/useT.js';
import type { TKey } from '../i18n/translations.js';

type PaletteItem = { tKey: TKey; type: NodeType; icon: ReactNode };
type SectionId = 'triggers' | 'agents' | 'custom' | 'models' | 'logic' | 'tools' | 'output' | 'history';

const SECTION_ITEMS: Record<Exclude<SectionId, 'agents' | 'custom' | 'history'>, PaletteItem[]> = {
  triggers: [{ tKey: 'node.manualTrigger', type: 'trigger', icon: <Play size={16} /> }],
  models: [{ tKey: 'node.llmModel', type: 'llm', icon: <Brain size={16} /> }],
  logic: [
    { tKey: 'node.condition', type: 'condition', icon: <GitBranch size={16} /> },
    { tKey: 'node.splitter', type: 'splitter', icon: <Split size={16} /> },
    { tKey: 'node.merger', type: 'merger', icon: <Merge size={16} /> },
    { tKey: 'node.group', type: 'group', icon: <Boxes size={16} /> },
  ],
  tools: [
    { tKey: 'node.tool', type: 'tool', icon: <Wrench size={16} /> },
    { tKey: 'node.human', type: 'human', icon: <User size={16} /> },
  ],
  output: [{ tKey: 'node.output', type: 'output', icon: <FileOutput size={16} /> }],
};

export function Sidebar(): ReactElement {
  const t = useT();
  const addNode = useGraphStore((state) => state.addNode);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>({
    triggers: true,
    agents: true,
    custom: true,
    models: true,
    logic: true,
    tools: true,
    output: true,
    history: true,
  });

  const matchesQuery = (label: string): boolean => label.toLowerCase().includes(query.trim().toLowerCase());

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, type: NodeType): void => {
    event.dataTransfer.setData('application/reactflow', type);
    event.dataTransfer.effectAllowed = 'move';
  };

  const toggleSection = (section: SectionId): void => {
    setOpenSections((state) => ({ ...state, [section]: !state[section] }));
  };

  return (
    <aside className={`flex h-full shrink-0 flex-col border-r border-fleet-border bg-fleet-surface transition-all ${collapsed ? 'w-14' : 'w-72'}`}>
      <div className="border-b border-fleet-border p-3">
        <div className="flex items-center justify-between gap-2">
          {!collapsed ? <h2 className="truncate text-sm font-semibold text-fleet-text">{t('sidebar.nodePalette')}</h2> : null}
          <button type="button" onClick={() => setCollapsed((value) => !value)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-fleet-border bg-fleet-panel text-fleet-text">
            <ChevronLeft size={16} className={collapsed ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
        </div>
        {!collapsed ? (
          <label className="mt-3 flex min-h-11 items-center gap-2 rounded-xl border border-fleet-border bg-fleet-panel/60 px-3">
            <Search size={16} className="text-fleet-muted" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('sidebar.searchPlaceholder')} className="w-full bg-transparent text-sm text-fleet-text outline-none placeholder:text-fleet-muted" />
          </label>
        ) : null}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <Section title={t('sidebar.triggers')} collapsed={collapsed} open={openSections.triggers} onToggle={() => toggleSection('triggers')}>
          <PaletteList items={SECTION_ITEMS.triggers.filter((item) => matchesQuery(t(item.tKey)))} addNode={addNode} onDragStart={handleDragStart} t={t} />
        </Section>
        <Section title={t('sidebar.agents')} collapsed={collapsed} open={openSections.agents} onToggle={() => toggleSection('agents')}>
          <AgentLibrary filter="builtin" searchQuery={query} />
        </Section>
        <Section title={t('sidebar.myAgents')} collapsed={collapsed} open={openSections.custom} onToggle={() => toggleSection('custom')}>
          <AgentLibrary filter="custom" searchQuery={query} />
        </Section>
        <Section title={t('sidebar.models')} collapsed={collapsed} open={openSections.models} onToggle={() => toggleSection('models')}>
          <PaletteList items={SECTION_ITEMS.models.filter((item) => matchesQuery(t(item.tKey)))} addNode={addNode} onDragStart={handleDragStart} t={t} />
        </Section>
        <Section title={t('sidebar.logic')} collapsed={collapsed} open={openSections.logic} onToggle={() => toggleSection('logic')}>
          <PaletteList items={SECTION_ITEMS.logic.filter((item) => matchesQuery(t(item.tKey)))} addNode={addNode} onDragStart={handleDragStart} t={t} />
        </Section>
        <Section title={t('sidebar.tools')} collapsed={collapsed} open={openSections.tools} onToggle={() => toggleSection('tools')}>
          <PaletteList items={SECTION_ITEMS.tools.filter((item) => matchesQuery(t(item.tKey)))} addNode={addNode} onDragStart={handleDragStart} t={t} />
        </Section>
        <Section title={t('sidebar.output')} collapsed={collapsed} open={openSections.output} onToggle={() => toggleSection('output')}>
          <PaletteList items={SECTION_ITEMS.output.filter((item) => matchesQuery(t(item.tKey)))} addNode={addNode} onDragStart={handleDragStart} t={t} />
        </Section>
        {!collapsed ? (
          <Section title={t('sidebar.recentSessions')} collapsed={false} open={openSections.history} onToggle={() => toggleSection('history')}>
            <SessionHistory />
          </Section>
        ) : null}
      </div>
    </aside>
  );
}

interface SectionProps {
  title: string;
  collapsed: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactElement;
}

function Section({ title, collapsed, open, onToggle, children }: SectionProps): ReactElement {
  return (
    <section className="rounded-2xl border border-fleet-border bg-fleet-bg/20">
      <button type="button" onClick={onToggle} className="flex min-h-11 w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.18em] text-fleet-muted">
        <span>{collapsed ? title.slice(0, 1) : title}</span>
        {!collapsed ? <ChevronDown size={14} className={open ? 'transition-transform' : '-rotate-90 transition-transform'} /> : null}
      </button>
      {open && !collapsed ? <div className="space-y-2 p-2 pt-0">{children}</div> : null}
    </section>
  );
}

interface PaletteListProps {
  items: PaletteItem[];
  addNode: (type: NodeType, position: { x: number; y: number }) => string;
  onDragStart: (event: DragEvent<HTMLButtonElement>, type: NodeType) => void;
  t: (key: TKey) => string;
}

function PaletteList({ items, addNode, onDragStart, t }: PaletteListProps): ReactElement {
  if (items.length === 0) {
    return <div className="px-2 py-3 text-xs text-fleet-muted">No palette items match the current search.</div>;
  }

  return (
    <div className="space-y-1">
      {items.map((item, index) => (
        <button
          key={`${item.type}-${item.tKey}`}
          type="button"
          draggable
          onDragStart={(event) => onDragStart(event, item.type)}
          onClick={() => addNode(item.type, { x: 160, y: 120 + index * 44 })}
          className="flex min-h-9 w-full items-center gap-2.5 rounded-lg border border-fleet-border bg-fleet-panel/40 px-2.5 py-1.5 text-left transition hover:border-fleet-accent"
        >
          <span className="flex shrink-0 items-center text-fleet-muted">{item.icon}</span>
          <span className="truncate text-sm text-fleet-text">{t(item.tKey)}</span>
        </button>
      ))}
    </div>
  );
}