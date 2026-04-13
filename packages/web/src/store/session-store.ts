import type { FleetEvent, NodeResult, SessionError, SessionStatus } from '@copilot-fleet/shared';
import { create } from 'zustand';

interface SessionState {
  sessionId: string | null;
  status: SessionStatus;
  currentWave: number;
  totalWaves: number;
  startedAt: string | null;
  elapsed: number;
  results: Map<string, NodeResult>;
  errors: SessionError[];
  logs: FleetEvent[];
  startSession: (sessionId: string, totalWaves: number) => void;
  completeSession: () => void;
  failSession: (error: string) => void;
  abortSession: () => void;
  advanceWave: () => void;
  addResult: (nodeId: string, result: NodeResult) => void;
  addError: (error: SessionError) => void;
  addLog: (event: FleetEvent) => void;
  updateElapsed: (ms: number) => void;
  clearConsole: () => void;
  reset: () => void;
  isRunning: () => boolean;
}

const createSessionError = (message: string): SessionError => ({
  nodeId: 'session',
  message,
  timestamp: new Date().toISOString(),
  recoverable: false,
});

export const useSessionStore = create<SessionState>((set, get) => ({
  sessionId: null,
  status: 'idle',
  currentWave: 0,
  totalWaves: 0,
  startedAt: null,
  elapsed: 0,
  results: new Map<string, NodeResult>(),
  errors: [],
  logs: [],
  startSession: (sessionId, totalWaves) => {
    set({
      sessionId,
      status: 'running',
      currentWave: 0,
      totalWaves,
      startedAt: new Date().toISOString(),
      elapsed: 0,
      results: new Map<string, NodeResult>(),
      errors: [],
      logs: [],
    });
  },
  completeSession: () => {
    set((state) => ({
      status: 'completed',
      elapsed: state.startedAt ? Date.now() - Date.parse(state.startedAt) : state.elapsed,
    }));
  },
  failSession: (error) => {
    set((state) => ({
      status: 'failed',
      errors: [...state.errors, createSessionError(error)],
      elapsed: state.startedAt ? Date.now() - Date.parse(state.startedAt) : state.elapsed,
    }));
  },
  abortSession: () => {
    set((state) => ({
      status: 'aborted',
      elapsed: state.startedAt ? Date.now() - Date.parse(state.startedAt) : state.elapsed,
    }));
  },
  advanceWave: () => {
    set((state) => ({
      currentWave: Math.min(state.currentWave + 1, state.totalWaves),
    }));
  },
  addResult: (nodeId, result) => {
    set((state) => {
      const next = new Map(state.results);
      next.set(nodeId, result);
      return { results: next };
    });
  },
  addError: (error) => {
    set((state) => ({
      errors: [...state.errors, error],
    }));
  },
  addLog: (event) => {
    set((state) => ({
      logs: [...state.logs, event],
    }));
  },
  updateElapsed: (ms) => {
    set({ elapsed: Math.max(0, ms) });
  },
  clearConsole: () => {
    set({ logs: [], errors: [] });
  },
  reset: () => {
    set({
      sessionId: null,
      status: 'idle',
      currentWave: 0,
      totalWaves: 0,
      startedAt: null,
      elapsed: 0,
      results: new Map<string, NodeResult>(),
      errors: [],
      logs: [],
    });
  },
  isRunning: () => get().status === 'running',
}));