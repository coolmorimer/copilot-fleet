import { DEFAULT_SESSION_CONFIG } from '@copilot-fleet/shared';
import type { Locale, Preset, ProviderConfig } from '@copilot-fleet/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface GitHubUser {
  login: string;
  avatar_url: string;
  name: string | null;
}

interface SettingsState {
  locale: Locale;
  theme: 'dark' | 'light';
  preset: Preset;
  providers: ProviderConfig[];
  showMinimap: boolean;
  showGrid: boolean;
  snapToGrid: boolean;
  gridSize: number;
  autoSave: boolean;
  onboardingComplete: boolean;
  githubUser: GitHubUser | null;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setPreset: (preset: Preset) => void;
  addProvider: (config: ProviderConfig) => void;
  removeProvider: (name: string) => void;
  updateProvider: (name: string, config: Partial<ProviderConfig>) => void;
  setShowMinimap: (show: boolean) => void;
  setShowGrid: (show: boolean) => void;
  setSnapToGrid: (snap: boolean) => void;
  setGridSize: (size: number) => void;
  setAutoSave: (auto: boolean) => void;
  completeOnboarding: () => void;
  setGitHubUser: (user: GitHubUser | null) => void;
}

type SettingsSnapshot = Pick<
  SettingsState,
  | 'locale'
  | 'theme'
  | 'preset'
  | 'providers'
  | 'showMinimap'
  | 'showGrid'
  | 'snapToGrid'
  | 'gridSize'
  | 'autoSave'
  | 'onboardingComplete'
  | 'githubUser'
>;

const defaultSettings: SettingsSnapshot = {
  locale: DEFAULT_SESSION_CONFIG.locale,
  theme: 'dark',
  preset: DEFAULT_SESSION_CONFIG.preset,
  providers: [],
  showMinimap: true,
  showGrid: true,
  snapToGrid: true,
  gridSize: 24,
  autoSave: true,
  onboardingComplete: false,
  githubUser: null,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
      setPreset: (preset) => set({ preset }),
      addProvider: (config) => {
        set((state) => ({
          providers: [...state.providers.filter((provider) => provider.name !== config.name), config],
        }));
      },
      removeProvider: (name) => {
        set((state) => ({
          providers: state.providers.filter((provider) => provider.name !== name),
        }));
      },
      updateProvider: (name, config) => {
        set((state) => ({
          providers: state.providers.map((provider) =>
            provider.name === name
              ? {
                  ...provider,
                  ...config,
                  name: provider.name,
                }
              : provider,
          ),
        }));
      },
      setShowMinimap: (show) => set({ showMinimap: show }),
      setShowGrid: (show) => set({ showGrid: show }),
      setSnapToGrid: (snap) => set({ snapToGrid: snap }),
      setGridSize: (size) => set({ gridSize: Math.max(8, size) }),
      setAutoSave: (auto) => set({ autoSave: auto }),
      completeOnboarding: () => set({ onboardingComplete: true }),
      setGitHubUser: (user) => set({ githubUser: user }),
    }),
    {
      name: 'fleet-settings',
      partialize: (state): SettingsSnapshot => ({
        locale: state.locale,
        theme: state.theme,
        preset: state.preset,
        providers: state.providers,
        showMinimap: state.showMinimap,
        showGrid: state.showGrid,
        snapToGrid: state.snapToGrid,
        gridSize: state.gridSize,
        autoSave: state.autoSave,
        onboardingComplete: state.onboardingComplete,
        githubUser: state.githubUser,
      }),
    },
  ),
);