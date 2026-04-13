import type { ReactElement, ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Building2, Layers3, RefreshCw, Shield, Users, X, Zap } from 'lucide-react';

import { TEMPLATE_CARDS } from './data.js';
import type { TemplateIconId } from './data.js';
import { ScrollPanel } from './shared.js';
import { useT } from '../i18n/useT.js';

const TEMPLATE_ICON_MAP: Record<TemplateIconId, ReactNode> = {
  zap: <Zap size={20} />,
  users: <Users size={20} />,
  building: <Building2 size={20} />,
  refresh: <RefreshCw size={20} />,
  shield: <Shield size={20} />,
};

export interface TemplateGalleryProps {
  onSelect: (templateId: string) => void;
  onClose: () => void;
}

export function TemplateGallery({ onSelect, onClose }: TemplateGalleryProps): ReactElement {
  const t = useT();
  return (
    <Dialog.Root open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] flex max-h-[80vh] w-[min(960px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[28px] border border-fleet-border bg-fleet-deep shadow-2xl outline-none">
          <div className="flex items-start justify-between border-b border-fleet-border px-5 py-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-fleet-text">{t('gallery.title')}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-fleet-muted">{t('gallery.subtitle')}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="rounded-lg border border-fleet-border bg-fleet-surface p-2 text-fleet-muted transition hover:border-fleet-accent hover:text-white" aria-label={t('gallery.closeAria')}>
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <ScrollPanel className="max-h-[calc(80vh-5rem)]">
            <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
              {TEMPLATE_CARDS.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => {
                    onSelect(template.id);
                    onClose();
                  }}
                  className="group rounded-2xl border border-fleet-border bg-fleet-surface p-4 text-left shadow-lg transition duration-200 hover:border-fleet-accent hover:shadow-[0_0_30px_rgba(99,102,241,0.18)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-fleet-accent/10 text-fleet-accent">{TEMPLATE_ICON_MAP[template.icon]}</div>
                      <div>
                        <div className="text-base font-semibold text-fleet-text">{template.name}</div>
                        <p className="mt-1 text-sm leading-6 text-fleet-muted">{template.description}</p>
                      </div>
                    </div>
                    <Layers3 className="h-5 w-5 text-fleet-muted transition group-hover:text-fleet-accent" />
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-fleet-muted">
                    <span>{template.agentCount} {t('common.agents')}</span>
                    <span>{t('gallery.load')}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {template.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-fleet-accent/20 bg-fleet-accent/10 px-2 py-1 text-[11px] text-fleet-text">
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </ScrollPanel>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}