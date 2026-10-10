import path from 'node:path';
import { SLICES } from '../../cli/slices.js';
import type { AgyConfig, OpencodeConfig } from './config-agents.js';
import { checkTraceabilityCapabilities } from './config-capabilities.js';
import {
  type CapabilitiesConfig,
  DEFAULT_CAPABILITIES_CONFIG,
  validateCapabilitiesConfig,
} from './config-capability-groups.js';
import { type ClaudeConfig, validateClaudeConfig } from './config-claude.js';
import { type CodexConfig, validateCodexConfig, validatePlannerConfig } from './config-codex.js';
import {
  type ConfinementConfig,
  DEFAULT_CONFINEMENT_CONFIG,
  validateConfinementConfig,
} from './config-confinement.js';
import { applyHarnessModelEnv } from './config-env.js';
import { ConfigLoadError, loadConfigFile } from './config-file.js';
import { DEFAULT_GATES_CONFIG, type GatesConfig, validateGatesConfig } from './config-gates.js';
import { DEFAULT_INBOX_CONFIG, type InboxConfig, validateInboxConfig } from './config-inbox.js';
import type { OsqLimits } from './config-limits.js';
import {
  DEFAULT_NOTICES_CONFIG,
  type NoticesConfig,
  validateNoticesConfig,
} from './config-notices.js';
import { type PiConfig, validatePiConfig } from './config-pi.js';
import {
  DEFAULT_PLANNING_CONFIG,
  type PlanningConfig,
  validatePlanningConfig,
} from './config-planning.js';
import { type QueueConfig, validateQueueConfig } from './config-queue.js';
import { DEFAULT_SERVE_CONFIG, type ServeConfig, validateServeConfig } from './config-serve.js';
import { composeDefaultConfig, resolveSliceConfig } from './config-slices.js';
import {
  DEFAULT_TRACEABILITY_CONFIG,
  type TraceabilityConfig,
  validateTraceabilityConfig,
} from './config-traceability.js';
import type { OsqUserConfig } from './config-user.js';
import { type ValidatorConfig, validateValidatorConfig } from './config-validator.js';
import { DEFAULT_VCS_CONFIG, type VcsConfig, validateVcsConfig } from './config-vcs.js';
import { DEFAULT_WATCH_CONFIG, type WatchConfig, validateWatchConfig } from './config-watch.js';

export { ConfigLoadError } from './config-file.js';
export type { AgyConfig, OpencodeConfig } from './config-agents.js';
export type { ClaudeConfig } from './config-claude.js';
export type { CodexConfig } from './config-codex.js';
export type { ConfinementConfig } from './config-confinement.js';
export type { CapabilitiesConfig } from './config-capability-groups.js';
export type { PiConfig } from './config-pi.js';
export type { QueueConfig } from './config-queue.js';
export type { ServeConfig } from './config-serve.js';
export type { WatchConfig } from './config-watch.js';
export type { TraceabilityConfig } from './config-traceability.js';
export type { OsqUserConfig } from './config-user.js';
export type { OsqLimits } from './config-limits.js';
export type { ValidatorConfig } from './config-validator.js';
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
  readonly gitRemoteSeconds?: number;
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
  readonly inbox?: InboxConfig;
  readonly capabilities?: CapabilitiesConfig;
  readonly confinement?: ConfinementConfig;
  readonly validator?: ValidatorConfig;
  readonly watch?: WatchConfig;
  readonly notices?: NoticesConfig;
}

const base: OsqConfig = {
  harness: 'agy',
  maxConcurrency: 1,
  serve: DEFAULT_SERVE_CONFIG,
  inbox: DEFAULT_INBOX_CONFIG,
  watch: DEFAULT_WATCH_CONFIG,
  notices: DEFAULT_NOTICES_CONFIG,
  vcs: DEFAULT_VCS_CONFIG,
  capabilities: DEFAULT_CAPABILITIES_CONFIG,
  confinement: DEFAULT_CONFINEMENT_CONFIG,
  gates: DEFAULT_GATES_CONFIG,
  traceability: DEFAULT_TRACEABILITY_CONFIG,
  planning: DEFAULT_PLANNING_CONFIG,
  agy: {
    model: 'gemini-3.8-flash-high',
    dangerouslySkipPermissions: false,
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
    cardOutputLines: 20,
    markerOutputLines: 40,
    markerLineChars: 400,
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
export const DEFAULT_CONFIG: OsqConfig = composeDefaultConfig(base, SLICES);
export function defineConfig(config: OsqUserConfig): OsqConfig {
  const { planner, queue: rawQueue, validator: rawValidator, ...restConfig } = config;
  let validatedPlanner: PlannerConfig | undefined;
  if (planner !== undefined) {
    validatedPlanner = validatePlannerConfig(planner);
  }
  const queue = rawQueue === undefined ? undefined : validateQueueConfig(rawQueue);
  const validator = validateValidatorConfig(rawValidator);
  const codex = validateCodexConfig(config.codex);
  const pi = validatePiConfig(config.pi);
  const claude = validateClaudeConfig(config.claude);
  const serve = validateServeConfig(config.serve);
  const inbox = validateInboxConfig(config.inbox);
  const watch = validateWatchConfig(config.watch);

  return {
    ...DEFAULT_CONFIG,
    ...restConfig,
    serve,
    inbox,
    watch,
    notices: validateNoticesConfig(config.notices),
    vcs: validateVcsConfig(config.vcs),
    planning: validatePlanningConfig(config.planning),
    gates: validateGatesConfig(config.gates),
    traceability: validateTraceabilityConfig(config.traceability),
    capabilities: validateCapabilitiesConfig(config.capabilities),
    confinement: validateConfinementConfig(config.confinement),
    ...(validatedPlanner ? { planner: validatedPlanner } : {}),
    ...(queue ? { queue } : {}),
    ...(validator ? { validator } : {}),
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
    log: { ...DEFAULT_CONFIG.log, ...(config.log || {}) },
    limits: { ...DEFAULT_CONFIG.limits, ...(config.limits || {}) },
    paths: { ...DEFAULT_CONFIG.paths, ...(config.paths || {}) },
    timeouts: { ...DEFAULT_CONFIG.timeouts, ...(config.timeouts || {}) },
    ...resolveSliceConfig(config, SLICES),
  };
}

export async function loadConfig(projectRoot: string): Promise<OsqConfig> {
  try {
    const envPath = path.join(projectRoot, '.env');
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile(envPath);
    }
  } catch {}

  const { userConfig, path: configPath } = await loadConfigFile(projectRoot);

  const harness = userConfig.harness || process.env.OSQ_HARNESS || DEFAULT_CONFIG.harness;
  const envModel = process.env.OSQ_MODEL?.trim();
  const envOverrides = envModel ? applyHarnessModelEnv(userConfig, harness, envModel) : {};

  try {
    const config = defineConfig({
      ...userConfig,
      harness,
      ...envOverrides,
      ...(userConfig.planner ? { planner: userConfig.planner } : {}),
    });
    await checkTraceabilityCapabilities(
      projectRoot,
      config.paths.openspecRoot,
      config.traceability?.capabilities ?? [],
    );
    return config;
  } catch (err) {
    if (configPath !== undefined) throw new ConfigLoadError(configPath, err);
    throw err;
  }
}
