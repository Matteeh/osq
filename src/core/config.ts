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
  readonly specs: string;
  readonly archive: string;
  readonly features: string;
  readonly decisions: string;
  readonly templates: string;
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

export interface OsqConfig {
  readonly harness: string;
  readonly maxConcurrency: number;
  readonly limits: OsqLimits;
  readonly paths: OsqPaths;
  readonly timeouts: OsqTimeouts;
  readonly agy?: AgyConfig;
}

export const DEFAULT_CONFIG: OsqConfig = {
  harness: 'agy',
  maxConcurrency: 1,
  agy: {
    model: 'gemini-3.8-flash-high',
    dangerouslySkipPermissions: true,
  },
  limits: {
    maxScopeFiles: 8,
    maxFeatureWrites: 2,
    maxContractTables: 1,
    maxAcceptanceLines: 7,
  },
  paths: {
    specs: 'specs',
    archive: 'specs/archive',
    features: 'features',
    decisions: 'decisions',
    templates: 'templates',
  },
  timeouts: {
    staleLockSeconds: 2700,
    taskTimeoutSeconds: 1800,
    verifyTimeoutSeconds: 600,
  },
};

export function defineConfig(config: Partial<OsqConfig>): OsqConfig {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    agy: {
      ...DEFAULT_CONFIG.agy,
      ...(config.agy || {}),
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
  let userConfig: Partial<OsqConfig> = {};

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
        const resolved = (loaded as { default?: Partial<OsqConfig> })?.default || loaded;
        if (typeof resolved === 'object' && resolved !== null) {
          userConfig = resolved as Partial<OsqConfig>;
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

  return defineConfig({
    ...userConfig,
    harness,
    agy: {
      ...DEFAULT_CONFIG.agy,
      ...(userConfig.agy || {}),
      ...(model ? { model } : {}),
    },
  });
}
