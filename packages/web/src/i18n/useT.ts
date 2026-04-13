import { useCallback } from 'react';

import { useSettingsStore } from '../store/settings-store.js';
import { translations } from './translations.js';
import type { TKey } from './translations.js';

/**
 * Returns a translation function `t(key)` that resolves a TKey
 * to the UI string matching the active locale.
 *
 * Supports simple `{name}` interpolation:
 *   t('onboarding.stepOf', { n: '2' })  →  "Step 2 of 4" | "Шаг 2 из 4"
 */
export function useT(): (key: TKey, vars?: Record<string, string>) => string {
  const locale = useSettingsStore((state) => state.locale);

  return useCallback(
    (key: TKey, vars?: Record<string, string>): string => {
      const entry = translations[key];
      let text: string = entry?.[locale] ?? (key as string);
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replaceAll(`{${k}}`, v);
        }
      }
      return text;
    },
    [locale],
  );
}
