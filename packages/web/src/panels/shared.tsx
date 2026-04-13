import { useEffect, useState } from 'react';
import type { KeyboardEvent, ReactElement, ReactNode } from 'react';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import * as Select from '@radix-ui/react-select';
import * as Slider from '@radix-ui/react-slider';
import * as Switch from '@radix-ui/react-switch';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Check, ChevronDown, Info, X } from 'lucide-react';

export const FIELD_CLASS = 'w-full rounded-lg border border-fleet-border bg-fleet-bg px-3 py-2 text-sm text-fleet-text outline-none transition focus:border-fleet-accent focus:ring-2 focus:ring-fleet-accent/30';
export const LABEL_CLASS = 'text-xs uppercase tracking-[0.22em] text-fleet-muted';

export const cx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(' ');

export const maskSecret = (value?: string): string => {
  if (!value) {
    return '';
  }

  const tail = value.slice(-4);
  return `${'•'.repeat(Math.max(4, value.length - 4))}${tail}`;
};

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }): ReactElement {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-fleet-text">{title}</h3>
      {subtitle ? <p className="text-sm text-fleet-muted">{subtitle}</p> : null}
    </div>
  );
}

export function FieldShell({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }): ReactElement {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-center gap-2">
        <span className={LABEL_CLASS}>{label}</span>
        {hint}
      </span>
      {children}
    </label>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}): ReactElement {
  const selected = options.find((option) => option.value === value);

  return (
    <FieldShell label={label}>
      <Select.Root value={value} onValueChange={onChange}>
        <Select.Trigger className={cx(FIELD_CLASS, 'flex items-center justify-between')}>
          <Select.Value>{selected?.label ?? 'Select option'}</Select.Value>
          <Select.Icon>
            <ChevronDown className="h-4 w-4 text-fleet-muted" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="z-[80] overflow-hidden rounded-xl border border-fleet-border bg-fleet-surface shadow-2xl">
            <Select.Viewport className="p-1">
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  className="relative flex cursor-pointer select-none items-center rounded-lg px-8 py-2 text-sm text-fleet-text outline-none data-[highlighted]:bg-fleet-accent/20 data-[state=checked]:text-white"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className="absolute left-2 inline-flex items-center">
                    <Check className="h-4 w-4 text-fleet-accent" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </FieldShell>
  );
}

export function ToggleField({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}): ReactElement {
  return (
    <div className="flex items-center justify-between rounded-xl border border-fleet-border bg-fleet-surface/70 px-3 py-3">
      <div className="space-y-1 pr-4">
        <div className="text-sm text-fleet-text">{label}</div>
        {description ? <div className="text-sm text-fleet-muted">{description}</div> : null}
      </div>
      <Switch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="relative h-6 w-11 rounded-full border border-fleet-border bg-fleet-bg transition data-[state=checked]:bg-fleet-accent"
      >
        <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white transition will-change-transform data-[state=checked]:translate-x-[22px]" />
      </Switch.Root>
    </div>
  );
}

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  formatValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  formatValue: (value: number) => string;
  onChange: (value: number) => void;
}): ReactElement {
  return (
    <FieldShell label={label}>
      <div className="rounded-xl border border-fleet-border bg-fleet-surface/70 px-3 py-3">
        <div className="mb-3 flex items-center justify-between text-sm text-fleet-text">
          <span>{formatValue(value)}</span>
          <span className="text-fleet-muted">{min}–{max}</span>
        </div>
        <Slider.Root value={[value]} min={min} max={max} step={step} onValueChange={([next]) => onChange(next ?? value)} className="relative flex h-5 items-center">
          <Slider.Track className="relative h-2 grow rounded-full bg-fleet-bg">
            <Slider.Range className="absolute h-full rounded-full bg-fleet-accent" />
          </Slider.Track>
          <Slider.Thumb className="block h-4 w-4 rounded-full border border-white/30 bg-white shadow" />
        </Slider.Root>
      </div>
    </FieldShell>
  );
}

export function TagInput({
  label,
  items,
  placeholder,
  onChange,
}: {
  label: string;
  items: string[];
  placeholder: string;
  onChange: (items: string[]) => void;
}): ReactElement {
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setDraft('');
  }, [items]);

  const pushDraft = (): void => {
    const value = draft.trim();
    if (!value || items.includes(value)) {
      setDraft('');
      return;
    }
    onChange([...items, value]);
    setDraft('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      pushDraft();
    }
    if (event.key === 'Backspace' && draft.length === 0 && items.length > 0) {
      onChange(items.slice(0, -1));
    }
  };

  return (
    <FieldShell label={label}>
      <div className="rounded-xl border border-fleet-border bg-fleet-bg p-2">
        <div className="mb-2 flex flex-wrap gap-2">
          {items.map((item) => (
            <span key={item} className="inline-flex items-center gap-1 rounded-full border border-fleet-accent/30 bg-fleet-accent/10 px-2 py-1 text-xs text-fleet-text">
              {item}
              <button type="button" onClick={() => onChange(items.filter((entry) => entry !== item))} className="text-fleet-muted transition hover:text-white" aria-label={`Remove ${item}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={pushDraft}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="w-full bg-transparent px-1 py-1 text-sm text-fleet-text outline-none placeholder:text-fleet-muted"
        />
      </div>
    </FieldShell>
  );
}

export function ScrollPanel({ children, className }: { children: ReactNode; className?: string }): ReactElement {
  return (
    <ScrollArea.Root className={cx('overflow-hidden', className)} type="auto">
      <ScrollArea.Viewport className="h-full w-full">{children}</ScrollArea.Viewport>
      <ScrollArea.Scrollbar orientation="vertical" className="flex w-2.5 touch-none p-0.5">
        <ScrollArea.Thumb className="flex-1 rounded-full bg-fleet-border hover:bg-fleet-muted" />
      </ScrollArea.Scrollbar>
      <ScrollArea.Corner className="bg-fleet-border" />
    </ScrollArea.Root>
  );
}

export function HintTooltip({ content }: { content: string }): ReactElement {
  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button type="button" className="text-fleet-muted transition hover:text-fleet-text" aria-label="Info">
            <Info className="h-3.5 w-3.5" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content sideOffset={6} className="z-[90] max-w-56 rounded-lg border border-fleet-border bg-fleet-deep px-3 py-2 text-xs text-fleet-text shadow-xl">
            {content}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}