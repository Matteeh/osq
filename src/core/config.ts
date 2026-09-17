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
}

export interface OsqConfig {
  readonly harness: string;
  readonly maxConcurrency: number;
  readonly limits: OsqLimits;
  readonly paths: OsqPaths;
  readonly timeouts: OsqTimeouts;
}

export const DEFAULT_CONFIG: OsqConfig = {
  harness: process.env.OSQ_HARNESS || 'agy',
  maxConcurrency: 1,
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
    staleLockSeconds: 300,
    taskTimeoutSeconds: 1800,
  },
};

export function defineConfig(config: Partial<OsqConfig>): OsqConfig {
  return {
    ...DEFAULT_CONFIG,
    ...config,
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
