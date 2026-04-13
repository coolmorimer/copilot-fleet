import type { FleetEvent, FleetEventType } from '@copilot-fleet/shared';

type EventListener = (event: FleetEvent) => void;

export class FleetEventEmitter {
  private listeners: Map<FleetEventType | '*', Set<EventListener>>;

  constructor() {
    this.listeners = new Map();
  }

  on(type: FleetEventType | '*', listener: EventListener): () => void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
    return () => this.off(type, listener);
  }

  off(type: FleetEventType | '*', listener: EventListener): void {
    const listeners = this.listeners.get(type);
    if (!listeners) {
      return;
    }

    listeners.delete(listener);
    if (listeners.size === 0) {
      this.listeners.delete(type);
    }
  }

  emit(event: FleetEvent): void {
    const typedListeners = this.listeners.get(event.type);
    if (typedListeners) {
      for (const listener of typedListeners) {
        listener(event);
      }
    }

    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      for (const listener of wildcardListeners) {
        listener(event);
      }
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}