import fs from 'node:fs/promises';
import path from 'node:path';
import { createJiti } from 'jiti';

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
  readonly log?: LogConfig;
  readonly planner?: PlannerConfig;
}

export type OsqUserConfig = Partial<
  Omit<OsqConfig, 'limits' | 'paths' | 'timeouts' | 'agy' | 'opencode' | 'log' | 'planner'>
> & {
  readonly limits?: Partial<OsqLimits>;
  readonly paths?: Partial<OsqPaths>;
  readonly timeouts?: Partial<OsqTimeouts>;
  readonly agy?: Partial<AgyConfig>;
  readonly opencode?: Partial<OpencodeConfig>;
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
  },
};

const VALID_PLANNER_HARNESSES = new Set(['agy', 'opencode', 'mock']);

export function validatePlannerConfig(planner: unknown): PlannerConfig {
  if (!planner || typeof planner !== 'object') {
    throw new Error('planner configuration must be an object');
  }
  const p = planner as Record<string, unknown>;
  if (typeof p.harness !== 'string' || !p.harness.trim()) {
    throw new Error('planner.harness must be a non-empty string');
  }
  const harness = p.harness.trim();
  if (!VALID_PLANNER_HARNESSES.has(harness)) {
    throw new Error(
      `Unsupported planner harness: "${harness}". Must be one of: ${Array.from(VALID_PLANNER_HARNESSES).join(', ')}`,
    );
  }
  if (typeof p.model !== 'string' || !p.model.trim()) {
    throw new Error('planner.model must be a non-empty string');
  }
  const model = p.model.trim();
  if (p.agent !== undefined && (typeof p.agent !== 'string' || !p.agent.trim())) {
    throw new Error('planner.agent must be a non-empty string if provided');
  }
  const agent = typeof p.agent === 'string' && p.agent.trim() ? p.agent.trim() : undefined;

  return {
    harness,
    model,
    ...(agent ? { agent } : {}),
  };
}

export function defineConfig(config: OsqUserConfig): OsqConfig {
  const { planner, ...restConfig } = config;
  let validatedPlanner: PlannerConfig | undefined;
  if (planner !== undefined) {
    validatedPlanner = validatePlannerConfig(planner);
  }

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
  const model = userConfig.agy?.model || process.env.OSQ_MODEL || DEFAULT_CONFIG.agy?.model;
  const opencodeModel =
    userConfig.opencode?.model ||
    (harness === 'opencode' && process.env.OSQ_MODEL ? process.env.OSQ_MODEL : undefined) ||
    DEFAULT_CONFIG.opencode?.model;

  return defineConfig({
    ...userConfig,
    harness,
    agy: {
      ...DEFAULT_CONFIG.agy,
      ...(userConfig.agy || {}),
      ...(model ? { model } : {}),
    },
    opencode: {
      ...DEFAULT_CONFIG.opencode,
      ...(userConfig.opencode || {}),
      ...(opencodeModel ? { model: opencodeModel } : {}),
    },
    ...(userConfig.planner ? { planner: userConfig.planner } : {}),
  });
}
