import fs from 'node:fs/promises';
import path from 'node:path';
import { createJiti } from 'jiti';
import type { AgyConfig, OpencodeConfig } from './config-agents.js';
import { type ClaudeConfig, validateClaudeConfig } from './config-claude.js';
import { type CodexConfig, validateCodexConfig, validatePlannerConfig } from './config-codex.js';
import { applyHarnessModelEnv } from './config-env.js';
import { DEFAULT_GATES_CONFIG, type GatesConfig, validateGatesConfig } from './config-gates.js';
import { type PiConfig, validatePiConfig } from './config-pi.js';
import {
  DEFAULT_PLANNING_CONFIG,
  type PlanningConfig,
  validatePlanningConfig,
} from './config-planning.js';
import { type QueueConfig, validateQueueConfig } from './config-queue.js';
import { DEFAULT_SERVE_CONFIG, type ServeConfig, validateServeConfig } from './config-serve.js';
import {
  DEFAULT_TRACEABILITY_CONFIG,
  type TraceabilityConfig,
  validateTraceabilityConfig,
} from './config-traceability.js';
import type { OsqUserConfig } from './config-user.js';
import { DEFAULT_VCS_CONFIG, type VcsConfig, validateVcsConfig } from './config-vcs.js';

export type { AgyConfig, OpencodeConfig } from './config-agents.js';
export type { ClaudeConfig } from './config-claude.js';
export type { CodexConfig } from './config-codex.js';
export type { PiConfig } from './config-pi.js';
export type { QueueConfig } from './config-queue.js';
export type { ServeConfig } from './config-serve.js';
export type { TraceabilityConfig } from './config-traceability.js';
export type { OsqUserConfig } from './config-user.js';

export interface OsqLimits {
  readonly maxScopeFiles: number;
  readonly maxFeatureWrites: number;
  readonly maxContractTables: number;
  readonly maxAcceptanceLines: number;
  /** Import levels the frozen-test reach warning follows. */
  readonly importGraphDepth: number;
  /** The most tests or files one import-graph warning lists. */
  readonly maxListedImporters: number;
  /** The most characters an accepted ADR's rule may have. */
  readonly maxRuleLength: number;
  /** The most system-wide rules the AGENTS.md block may hold. */
  readonly maxProjectRules: number;
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
  readonly gitSeconds?: number;
  readonly gitCommitSeconds?: number;
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
  readonly vcs?: VcsConfig;
  readonly agy?: AgyConfig;
  readonly opencode?: OpencodeConfig;
  readonly codex?: CodexConfig;
  readonly pi?: PiConfig;
  readonly claude?: ClaudeConfig;
  readonly log?: LogConfig;
  readonly planner?: PlannerConfig;
  readonly planning?: PlanningConfig;
  readonly queue?: QueueConfig;
  readonly serve?: Partial<ServeConfig>;
  readonly gates?: GatesConfig;
  readonly traceability?: TraceabilityConfig;
}

export const DEFAULT_CONFIG: OsqConfig = {
  harness: 'agy',
  maxConcurrency: 1,
  serve: DEFAULT_SERVE_CONFIG,
  vcs: DEFAULT_VCS_CONFIG,
  gates: DEFAULT_GATES_CONFIG,
  traceability: DEFAULT_TRACEABILITY_CONFIG,
  planning: DEFAULT_PLANNING_CONFIG,
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
    importGraphDepth: 2,
    maxListedImporters: 8,
    maxRuleLength: 160,
    maxProjectRules: 10,
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
  const { planner, queue: rawQueue, ...restConfig } = config;
  let validatedPlanner: PlannerConfig | undefined;
  if (planner !== undefined) {
    validatedPlanner = validatePlannerConfig(planner);
  }
  const queue = rawQueue === undefined ? undefined : validateQueueConfig(rawQueue);
  const codex = validateCodexConfig(config.codex);
  const pi = validatePiConfig(config.pi);
  const claude = validateClaudeConfig(config.claude);
  const serve = validateServeConfig(config.serve);

  return {
    ...DEFAULT_CONFIG,
    ...restConfig,
    serve,
    vcs: validateVcsConfig(config.vcs),
    planning: validatePlanningConfig(config.planning),
    gates: validateGatesConfig(config.gates),
    traceability: validateTraceabilityConfig(config.traceability),
    ...(validatedPlanner ? { planner: validatedPlanner } : {}),
    ...(queue ? { queue } : {}),
    agy: {
      ...DEFAULT_CONFIG.agy,
      ...(config.agy || {}),
    },
    opencode: {
      ...DEFAULT_CONFIG.opencode,
      ...(config.opencode || {}),
    },
    codex,
    pi,
    claude,
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
  const envModel = process.env.OSQ_MODEL?.trim();
  const envOverrides = envModel ? applyHarnessModelEnv(userConfig, harness, envModel) : {};

  return defineConfig({
    ...userConfig,
    harness,
    ...envOverrides,
    ...(userConfig.planner ? { planner: userConfig.planner } : {}),
  });
}
