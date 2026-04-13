import { memo } from 'react';
import type { ReactNode } from 'react';

import { Position } from '@xyflow/react';
import { NODE_COLORS } from '@copilot-fleet/shared';
import { Bot, FileText, FlaskConical, Lock, Map, Palette, Search, Settings, Shield, Wrench } from 'lucide-react';

import { useT } from '../i18n/useT.js';
import {
  Field,
  FleetFlowNodeProps,
  HandlePort,
  InlineMeter,
  NodeChrome,
  StatusFooter,
  TagList,
  previewValue,
  readNumber,
  readString,
  readStringList,
} from './shared.js';

const AGENT_ICON_MAP: Record<string, ReactNode> = {
  coder: <Bot size={14} />,
  reviewer: <Shield size={14} />,
  tester: <FlaskConical size={14} />,
  refactorer: <Wrench size={14} />,
  documenter: <FileText size={14} />,
  security: <Lock size={14} />,
  designer: <Palette size={14} />,
  devops: <Settings size={14} />,
  researcher: <Search size={14} />,
  planner: <Map size={14} />,
};

function AgentNodeComponent({ data, selected }: FleetFlowNodeProps) {
  const t = useT();
  const color = NODE_COLORS.agent;
  const agentId = readString(data.config, ['agentId'], '');
  const provider = readString(data.config, ['provider', 'providerType'], 'Auto');
  const model = readString(data.config, ['model', 'modelName'], t('nodeCard.modelNotSet'));
  const prompt = readString(data.config, ['prompt', 'systemPrompt', 'instruction'], t('nodeCard.promptNotSet'));
  const files = readStringList(data.config, ['files', 'fileGlobs', 'paths']);
  const temperature = readNumber(data.config, ['temperature'], 0.3);
  const maxTokens = readNumber(data.config, ['maxTokens'], 4096);
  const issueNumber = readNumber(data.config, ['issueNumber'], 0);
  const prNumber = readNumber(data.config, ['prNumber'], 0);
  const issueUrl = readString(data.config, ['issueUrl'], '');
  const prUrl = readString(data.config, ['prUrl'], '');
  const agentIcon = AGENT_ICON_MAP[agentId] ?? <Bot size={14} />;

  return (
    <NodeChrome
      data={data}
      selected={selected}
      icon={agentIcon}
      title={data.label}
      accent={color}
      minWidth={260}
      footer={<StatusFooter data={data} accent={color.glow} />}
    >
      <HandlePort type="target" position={Position.Left} color={color.glow} id="agent-in" />
      <HandlePort type="source" position={Position.Right} color={color.glow} id="agent-out" />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('nodeCard.provider')} value={provider} />
        <Field label={t('nodeCard.model')} value={<span className="font-mono text-[10px]">{previewValue(model, 28)}</span>} />
      </div>
      <Field label={t('nodeCard.prompt')} value={<p className="leading-5 text-fleet-text/90">{previewValue(prompt, 140)}</p>} />
      {files.length > 0 ? <Field label={t('nodeCard.files')} value={<TagList items={files.slice(0, 6)} />} /> : null}
      <div className="grid grid-cols-2 gap-3">
        <InlineMeter label={t('nodeCard.temperature')} value={Math.round(temperature * 50)} max={100} accent={color.glow} />
        <InlineMeter label={t('nodeCard.maxTokens')} value={Math.min(maxTokens, 8192)} max={8192} accent={color.header} />
      </div>
      {issueNumber > 0 || prNumber > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          <Field
            label={t('nodeCard.issue')}
            value={
              issueNumber > 0 ? (
                issueUrl ? (
                  <a className="text-sky-300 underline-offset-2 hover:underline" href={issueUrl} target="_blank" rel="noreferrer">
                    #{issueNumber}
                  </a>
                ) : (
                  `#${issueNumber}`
                )
              ) : (
                '—'
              )
            }
          />
          <Field
            label={t('nodeCard.pr')}
            value={
              prNumber > 0 ? (
                prUrl ? (
                  <a className="text-sky-300 underline-offset-2 hover:underline" href={prUrl} target="_blank" rel="noreferrer">
                    #{prNumber}
                  </a>
                ) : (
                  `#${prNumber}`
                )
              ) : (
                '—'
              )
            }
          />
        </div>
      ) : null}
    </NodeChrome>
  );
}

export const AgentNode = memo(AgentNodeComponent);