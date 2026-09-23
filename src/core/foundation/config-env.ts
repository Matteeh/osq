import { DEFAULT_CONFIG, type OsqConfig, type OsqUserConfig } from './config.js';
import { HARNESS_CATALOG } from './harness-catalog.js';

// Apply OSQ_MODEL to catalogued harness sections that accept it; explicit
// models still win and `defineConfig` owns default merging and validation.
export function applyHarnessModelEnv(
  userConfig: OsqUserConfig,
  selectedHarness: string,
  envModel: string,
): Partial<OsqConfig> {
  const selected = selectedHarness.trim().toLowerCase();
  const overrides: Record<string, unknown> = {};
  for (const entry of HARNESS_CATALOG) {
    if (!entry.configKey) continue;
    if (!entry.envModelWhenUnselected && entry.name !== selected) continue;
    const sections = userConfig as unknown as Record<string, { model?: string } | undefined>;
    const section = sections[entry.configKey];
    if (section?.model) continue;
    const defaults = (DEFAULT_CONFIG as unknown as Record<string, object | undefined>)[
      entry.configKey
    ];
    overrides[entry.configKey] = { ...(defaults ?? {}), ...(section ?? {}), model: envModel };
  }
  return overrides as Partial<OsqConfig>;
}
