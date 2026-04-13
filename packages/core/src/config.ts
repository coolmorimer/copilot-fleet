import { readFile, writeFile } from 'node:fs/promises';

import { DEFAULT_SESSION_CONFIG } from '@copilot-fleet/shared';
import type { Locale, SessionConfig } from '@copilot-fleet/shared';

export interface FleetConfig {
  session: SessionConfig;
  providers: Record<string, Record<string, unknown>>;
  agents: string[];
  locale: Locale;
}

export function createDefaultConfig(): FleetConfig {
  return {
    session: { ...DEFAULT_SESSION_CONFIG },
    providers: {},
    agents: [],
    locale: 'en' as Locale,
  };
}

export function mergeConfig(base: FleetConfig, overrides: Partial<FleetConfig>): FleetConfig {
  return {
    session: {
      ...base.session,
      ...(overrides.session ?? {}),
    },
    providers: {
      ...base.providers,
      ...(overrides.providers ?? {}),
    },
    agents: overrides.agents ? [...overrides.agents] : [...base.agents],
    locale: overrides.locale ?? base.locale,
  };
}

export async function loadConfigFromFile(path: string): Promise<FleetConfig> {
  const content = await readFile(path, 'utf8');
  const parsed = JSON.parse(content) as Partial<FleetConfig>;
  return mergeConfig(createDefaultConfig(), parsed);
}

export async function saveConfigToFile(config: FleetConfig, path: string): Promise<void> {
  const content = `${JSON.stringify(config, null, 2)}\n`;
  await writeFile(path, content, 'utf8');
}