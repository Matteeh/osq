import fs from 'node:fs/promises';
import path from 'node:path';
import { createJiti } from 'jiti';
import { type CodexConfig, validateCodexConfig, validatePlannerConfig } from './config-codex.js';
import { HARNESS_CATALOG } from './harness-catalog.js';

export type { CodexConfig } from './config-codex.js';

export interface OsqLimits {
  readonly maxScopeFiles: number;
  readonly maxFeatureWrites: number;
  readonly maxContractTables: number;
  readonly maxAcceptanceLines: number;
}

export interface OsqPaths {
  readonly features: string;
  readonly decisions: string;
  readonly templates: string;
  readonly openspecRoot: string;
}

export interface OsqTimeouts {
  readonly staleLockSeconds: number;
  readonly taskTimeoutSeconds: number;
  readonly verifyTimeoutSeconds: number;
  /** Preflight `--version` probe deadline; defaults to 10 seconds. */
  readonly harnessPreflightSeconds?: number;
  /** Kill grace after SIGTERM before SIGKILL; defaults to 5000 milliseconds. */
  readonly harnessKillGracePeriodMs?: number;
}

export interface AgyConfig {
  readonly model?: string;
  readonly dangerouslySkipPermissions?: boolean;
}

export interface OpencodeConfig {
  readonly bin?: string;
  readonly model?: string;
  readonly agent?: string;
  readonly variant?: string;
}

export interface LogConfig {
  readonly heartbeatSeconds?: number;
}

export interface PlannerConfig {
  readonly harness: string;
  readonly model: string;
  readonly agent?: string;
}

export interface OsqConfig {
  readonly harness: string;
  readonly maxConcurrency: number;
  readonly limits: OsqLimits;
  readonly paths: OsqPaths;
  readonly timeouts: OsqTimeouts;
  readonly agy?: AgyConfig;
  readonly opencode?: OpencodeConfig;
  readonly codex?: CodexConfig;
  readonly log?: LogConfig;
  readonly planner?: PlannerConfig;
}

export type OsqUserConfig = Partial<
  Omit<
    OsqConfig,
    'limits' | 'paths' | 'timeouts' | 'agy' | 'opencode' | 'codex' | 'log' | 'planner'
  >
> & {
  readonly limits?: Partial<OsqLimits>;
  readonly paths?: Partial<OsqPaths>;
  readonly timeouts?: Partial<OsqTimeouts>;
  readonly agy?: Partial<AgyConfig>;
  readonly opencode?: Partial<OpencodeConfig>;
  readonly codex?: Partial<CodexConfig>;
  readonly log?: Partial<LogConfig>;
  readonly planner?: Partial<PlannerConfig>;
};

export const DEFAULT_CONFIG: OsqConfig = {
  harness: 'agy',
  maxConcurrency: 1,
  agy: {
    model: 'gemini-3.8-flash-high',
    dangerouslySkipPermissions: true,
  },
  opencode: {
    bin: 'opencode',
    model: 'deepseek/deepseek-flash',
    agent: 'osq-coder',
  },
  log: {
    heartbeatSeconds: 60,
  },
  limits: {
    maxScopeFiles: 8,
    maxFeatureWrites: 2,
    maxContractTables: 1,
    maxAcceptanceLines: 7,
  },
  paths: {
    features: 'openspec/specs',
    decisions: 'decisions',
    templates: 'templates',
    openspecRoot: 'openspec',
  },
  timeouts: {
    staleLockSeconds: 2700,
    taskTimeoutSeconds: 1800,
    verifyTimeoutSeconds: 600,
    harnessPreflightSeconds: 10,
    harnessKillGracePeriodMs: 5000,
  },
};

export function defineConfig(config: OsqUserConfig): OsqConfig {
  const { planner, ...restConfig } = config;
  let validatedPlanner: PlannerConfig | undefined;
  if (planner !== undefined) {
    validatedPlanner = validatePlannerConfig(planner);
  }
  const codex = validateCodexConfig(config.codex);

  return {
    ...DEFAULT_CONFIG,
    ...restConfig,
    ...(validatedPlanner ? { planner: validatedPlanner } : {}),
    agy: {
      ...DEFAULT_CONFIG.agy,
      ...(config.agy || {}),
    },
    opencode: {
      ...DEFAULT_CONFIG.opencode,
      ...(config.opencode || {}),
    },
    codex,
    log: {
      ...DEFAULT_CONFIG.log,
      ...(config.log || {}),
    },
    limits: {
      ...DEFAULT_CONFIG.limits,
      ...(config.limits || {}),
    },
    paths: {
      ...DEFAULT_CONFIG.paths,
      ...(config.paths || {}),
    },
    timeouts: {
      ...DEFAULT_CONFIG.timeouts,
      ...(config.timeouts || {}),
    },
  };
}

/**
 * Apply OSQ_MODEL to each catalogued harness section that accepts it. An
 * explicitly configured model always wins; the default harness additionally
 * receives the environment model even when it is not the selected executor.
 * Sections are returned as partial config overrides so `defineConfig` still
 * owns default merging and validation.
 */
function applyHarnessModelEnv(
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

export async function loadConfig(projectRoot: string): Promise<OsqConfig> {
  try {
    const envPath = path.join(projectRoot, '.env');
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile(envPath);
    }
  } catch {}

  const configFiles = ['osq.config.ts', 'osq.config.js', 'osq.config.mjs'];
  let userConfig: OsqUserConfig = {};

  for (const file of configFiles) {
    const fullPath = path.join(projectRoot, file);
    const exists = await fs
      .stat(fullPath)
      .then(() => true)
      .catch(() => false);

    if (exists) {
      try {
        const jiti = createJiti(import.meta.url, {
          moduleCache: false,
          interopDefault: true,
        });
        const loaded = await jiti.import(fullPath);
        const resolved = (loaded as { default?: OsqUserConfig })?.default || loaded;
        if (typeof resolved === 'object' && resolved !== null) {
          userConfig = resolved as OsqUserConfig;
        }
      } catch (err) {
        if (process.env.DEBUG_OSQ) {
          console.error(`Warning: Failed to load config from ${file}:`, err);
        }
      }
      break;
    }
  }

  const harness = userConfig.harness || process.env.OSQ_HARNESS || DEFAULT_CONFIG.harness;
  const envModel = process.env.OSQ_MODEL?.trim();
  const envOverrides = envModel ? applyHarnessModelEnv(userConfig, harness, envModel) : {};

  return defineConfig({
    ...userConfig,
    harness,
    ...envOverrides,
    ...(userConfig.planner ? { planner: userConfig.planner } : {}),
  });
}
