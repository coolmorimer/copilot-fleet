import type { CSSProperties, ReactNode } from 'react';

import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import type { NodeStatus } from '@copilot-fleet/shared';

import { useT } from '../i18n/useT.js';
import type { TKey } from '../i18n/translations.js';
import type { FleetNodeData } from '../store/graph-store.js';

export type FleetFlowNodeProps = NodeProps<Node<FleetNodeData>>;

type Tone = {
  icon: string;
  label: string;
  className: string;
};

const STATUS_META: Record<NodeStatus, Tone> = {
  idle: { icon: '○', label: 'Idle', className: 'border-slate-600/80 bg-slate-500/10 text-slate-300' },
  queued: { icon: '⋯', label: 'Queued', className: 'border-sky-500/60 bg-sky-500/10 text-sky-300' },
  running: { icon: '◌', label: 'Running', className: 'border-amber-500/70 bg-amber-500/15 text-amber-200' },
  done: { icon: '✓', label: 'Done', className: 'border-emerald-500/70 bg-emerald-500/15 text-emerald-200' },
  error: { icon: '✕', label: 'Error', className: 'border-red-500/70 bg-red-500/15 text-red-200' },
  skipped: { icon: '↷', label: 'Skipped', className: 'border-slate-500/70 bg-slate-500/10 text-slate-300' },
  cancelled: { icon: '■', label: 'Cancelled', className: 'border-rose-500/60 bg-rose-500/10 text-rose-200' },
};

export const cx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(' ');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const readConfigValue = (config: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) {
    if (key in config) {
      return config[key];
    }
  }
  return undefined;
};

export const readString = (config: Record<string, unknown>, keys: string[], fallback = 'Not set'): string => {
  const value = readConfigValue(config, keys);
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return fallback;
};

export const readNumber = (config: Record<string, unknown>, keys: string[], fallback = 0): number => {
  const value = readConfigValue(config, keys);
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

export const readStringList = (config: Record<string, unknown>, keys: string[]): string[] => {
  const value = readConfigValue(config, keys);
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

export const readRecord = (config: Record<string, unknown>, keys: string[]): Record<string, unknown> | undefined => {
  const value = readConfigValue(config, keys);
  return isRecord(value) ? value : undefined;
};

export const previewValue = (value: unknown, maxLength = 96): string => {
  const text = (() => {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => previewValue(item, maxLength)).join(', ');
    }
    if (isRecord(value)) {
      return Object.entries(value)
        .slice(0, 4)
        .map(([key, item]) => `${key}: ${previewValue(item, 24)}`)
        .join(', ');
    }
    return 'Not available';
  })();

  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
};

export const clampProgress = (progress: number): number => Math.min(100, Math.max(0, progress));

export const formatPercent = (value: number): string => `${Math.round(value)}%`;

export const getStatusMeta = (status: NodeStatus): Tone => STATUS_META[status];

export type NodeChromeProps = {
  data: FleetNodeData;
  selected: boolean;
  icon: ReactNode;
  title: string;
  accent: { header: string; glow: string };
  minWidth?: number;
  className?: string;
  bodyClassName?: string;
  footer?: ReactNode;
  children: ReactNode;
};

export function NodeChrome({
  data,
  selected,
  icon,
  title,
  accent,
  minWidth = 220,
  className,
  bodyClassName,
  footer,
  children,
}: NodeChromeProps) {
  const isRunning = data.status === 'running';
  const glow = `${accent.glow}${selected ? '66' : isRunning ? '44' : '20'}`;

  return (
    <div
      className={cx(
        'fleet-node rounded-xl border bg-fleet-surface text-[11px] text-fleet-text shadow-[0_10px_30px_rgba(3,7,18,0.35)]',
        `type-${data.nodeType}`,
        `status-${data.status}`,
        selected && 'selected',
        isRunning && 'animate-pulse-glow',
        className,
      )}
      style={{
        minWidth,
        borderColor: selected ? accent.glow : 'var(--fleet-border)',
        boxShadow: `0 0 0 1px ${selected ? accent.glow : 'var(--fleet-border)'}, 0 0 22px ${glow}`,
        backgroundColor: 'var(--fleet-surface)',
      }}
    >
      <div
        className="flex items-center justify-between rounded-t-xl px-3 py-2 text-[13px] font-semibold text-slate-950"
        style={{ backgroundColor: accent.header }}
      >
        <div className="flex min-w-0 items-center gap-2 text-slate-950">
          <span className="text-sm leading-none">{icon}</span>
          <span className="truncate">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={data.status} compact />
          {data.error ? (
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200/70 bg-red-950/40 text-[10px] font-bold text-red-100"
              title={data.error}
            >
              !
            </span>
          ) : null}
        </div>
      </div>
      <div className={cx('space-y-3 px-3 py-3', bodyClassName)}>{children}</div>
      {footer ? <div className="border-t border-fleet-border/80 px-3 py-2">{footer}</div> : null}
    </div>
  );
}

export function StatusBadge({ status, compact = false }: { status: NodeStatus; compact?: boolean }) {
  const t = useT();
  const meta = getStatusMeta(status);

  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full border font-medium',
        compact ? 'gap-1 px-1.5 py-0.5 text-[9px]' : 'gap-1.5 px-2 py-1 text-[10px]',
        meta.className,
      )}
    >
      <span>{meta.icon}</span>
      <span>{t(`status.${status}` as TKey)}</span>
    </span>
  );
}

export function ProgressBar({ progress, accent }: { progress: number; accent: string }) {
  const t = useT();
  const value = clampProgress(progress);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-fleet-muted">
        <span>{t('nodeCard.progress')}</span>
        <span>{formatPercent(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-fleet-deep/60">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${value}%`, background: `linear-gradient(90deg, ${accent}, ${accent}aa)` }}
        />
      </div>
    </div>
  );
}

export function HandlePort({
  type,
  position,
  id,
  color,
  top,
}: {
  type: 'source' | 'target';
  position: Position;
  id?: string;
  color: string;
  top?: string;
}) {
  const style: CSSProperties = {
    width: 12,
    height: 12,
    borderWidth: 2,
    borderColor: '#0f172a',
    backgroundColor: color,
    boxShadow: `0 0 10px ${color}88`,
  };

  if (top) {
    style.top = top;
    style.transform = 'translateY(-50%)';
  }

  return <Handle id={id} type={type} position={position} style={style} />;
}

export function Field({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-[0.14em] text-fleet-muted">{label}</div>
      <div className={cx('text-fleet-text', mono && 'font-mono text-[10px]')}>{value}</div>
    </div>
  );
}

export function InlineMeter({ label, value, max, accent }: { label: string; value: number; max: number; accent: string }) {
  const progress = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-fleet-muted">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-fleet-deep/60">
        <div className="h-full rounded-full" style={{ width: `${clampProgress(progress)}%`, backgroundColor: accent }} />
      </div>
    </div>
  );
}

export function TagList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <span className="text-fleet-muted">None</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full border border-fleet-border bg-fleet-bg/60 px-2 py-0.5 font-mono text-[10px] text-fleet-text"
        >
          {previewValue(item, 22)}
        </span>
      ))}
    </div>
  );
}

export function StatusFooter({ data, accent }: { data: FleetNodeData; accent: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={data.status} />
        {data.description ? <span className="truncate text-[10px] text-fleet-muted">{previewValue(data.description, 42)}</span> : null}
      </div>
      {data.status === 'running' ? <ProgressBar progress={data.progress} accent={accent} /> : null}
      {data.status === 'error' && data.error ? <div className="text-[10px] text-red-200">{previewValue(data.error, 120)}</div> : null}
    </div>
  );
}