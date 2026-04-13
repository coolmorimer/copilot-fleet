import type { FleetGraph, SessionStatus } from '@copilot-fleet/shared';

export interface SavedSessionRecord {
  id: string;
  name: string;
  createdAt: string;
  status: SessionStatus | 'saved';
  duration: number;
  graph: FleetGraph;
}

const STORAGE_KEY = 'copilot-fleet:session-history';
const HISTORY_EVENT = 'copilot-fleet:history-updated';
const MAX_ITEMS = 12;

const canUseStorage = (): boolean => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const emitHistoryUpdated = (): void => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(HISTORY_EVENT));
  }
};

export const historyEventName = HISTORY_EVENT;

export function listSavedSessions(): SavedSessionRecord[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as SavedSessionRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSessionRecord(record: SavedSessionRecord): void {
  if (!canUseStorage()) {
    return;
  }

  const existing = listSavedSessions().filter((item) => item.id !== record.id);
  const next = [record, ...existing].slice(0, MAX_ITEMS);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emitHistoryUpdated();
}

export function getSavedSession(id: string): SavedSessionRecord | undefined {
  return listSavedSessions().find((item) => item.id === id);
}

export function getLatestSession(): SavedSessionRecord | undefined {
  return listSavedSessions()[0];
}