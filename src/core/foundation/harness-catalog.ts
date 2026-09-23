import type { HarnessDiagnoseContext, HarnessDiagnosis } from './config-pi.js';
import { diagnosePi, resolvePiBinary, resolvePiEffort } from './config-pi.js';
import type { OsqConfig } from './config.js';

/**
 * Canonical, immutable catalog of first-party harness capabilities. Every
 * shared consumer derives its harness knowledge from here, so adding a harness
 * never means editing a generic workflow branch.
 */
export const HARNESS_NAMES = ['agy', 'opencode', 'mock', 'codex', 'pi'] as const;

export type HarnessName = (typeof HARNESS_NAMES)[number];

/** Where in {@link OsqConfig} a harness keeps its harness-specific settings. */
export type HarnessConfigKey = 'agy' | 'opencode' | 'codex' | 'pi';

export interface PlannerCapability {
  /** Whether `planner.agent` is a meaningful setting for this harness. */
  readonly agent: boolean;
  /** Agent selected for planning when none is configured, if any. */
  readonly defaultAgent?: string;
  /** Brief attribution for a native (unspecified) planner model. */
  readonly briefModelWhenNative: string;
}

export interface HarnessCatalogEntry {
  readonly name: HarnessName;
  /** `OsqConfig` section holding harness-specific settings, if any. */
  readonly configKey?: HarnessConfigKey;
  /** `OSQ_MODEL` applies even when this harness is not the selected executor. */
  readonly envModelWhenUnselected: boolean;
  /** Resolve the external executable, or `null` when none is required. */
  readonly executable: (config: OsqConfig) => string | null;
  /** Effective configured model, or `undefined` to defer to native defaults. */
  readonly model: (config: OsqConfig) => string | undefined;
  /** Applicable reasoning effort, or `null` when the harness has no such knob. */
  readonly effort: (config: OsqConfig) => string | null;
  readonly planner: PlannerCapability;
  /** Optional extra doctor checks run after a passing `harness` probe. */
  readonly diagnose?: (context: HarnessDiagnoseContext) => Promise<readonly HarnessDiagnosis[]>;
}

type HarnessCatalogDefinitions = {
  readonly [K in HarnessName]: Omit<HarnessCatalogEntry, 'name'>;
};

const DEFINITIONS: HarnessCatalogDefinitions = {
  agy: {
    configKey: 'agy',
    // Agent is the historical default harness, so OSQ_MODEL feeds its section
    // regardless of the selected executor.
    envModelWhenUnselected: true,
    executable: () => process.env.AGY_PATH || 'agy',
    model: (config) => config.agy?.model?.trim() || undefined,
    effort: () => null,
    planner: { agent: true, briefModelWhenNative: '' },
  },
  opencode: {
    configKey: 'opencode',
    envModelWhenUnselected: false,
    executable: (config) => process.env.OPENCODE_PATH || config.opencode?.bin || 'opencode',
    model: (config) => config.opencode?.model?.trim() || undefined,
    effort: () => null,
    planner: { agent: true, defaultAgent: 'osq-planner', briefModelWhenNative: '' },
  },
  mock: {
    envModelWhenUnselected: false,
    executable: () => null,
    model: () => undefined,
    effort: () => null,
    planner: { agent: true, briefModelWhenNative: '' },
  },
  codex: {
    configKey: 'codex',
    envModelWhenUnselected: false,
    executable: (config) => {
      const explicit = config.codex?.bin?.trim();
      if (explicit) return explicit;
      const fromEnv = process.env.CODEX_PATH?.trim();
      if (fromEnv) return fromEnv;
      return 'codex';
    },
    model: (config) => {
      const explicit = config.codex?.model?.trim();
      if (explicit) return explicit;
      if (normalizeHarnessName(config.harness) === 'codex') {
        const fromEnv = process.env.OSQ_MODEL?.trim();
        if (fromEnv) return fromEnv;
      }
      return undefined;
    },
    effort: (config) => config.codex?.effort?.trim() || null,
    planner: { agent: false, briefModelWhenNative: 'default' },
  },
  pi: {
    configKey: 'pi',
    envModelWhenUnselected: false,
    executable: resolvePiBinary,
    model: resolvePiModel,
    effort: resolvePiEffort,
    planner: { agent: false, briefModelWhenNative: 'default' },
    diagnose: diagnosePi,
  },
};

/** Normalize arbitrary casing and surrounding whitespace to a lower-case name. */
export function normalizeHarnessName(name: string): string {
  return typeof name === 'string' ? name.trim().toLowerCase() : '';
}

/** The frozen catalog, ordered by {@link HARNESS_NAMES}. */
export const HARNESS_CATALOG: readonly HarnessCatalogEntry[] = Object.freeze(
  HARNESS_NAMES.map((name) => Object.freeze({ name, ...DEFINITIONS[name] })),
);

/** Ordered available harness names. */
export function availableHarnessNames(): readonly HarnessName[] {
  return HARNESS_NAMES;
}

/** Case-insensitive catalog lookup, or `undefined` when unregistered. */
export function findHarness(name: string): HarnessCatalogEntry | undefined {
  const normalized = normalizeHarnessName(name);
  return HARNESS_CATALOG.find((entry) => entry.name === normalized);
}

/** Case-insensitive catalog lookup that reports catalog names when unknown. */
export function lookupHarness(name: string): HarnessCatalogEntry {
  const entry = findHarness(name);
  if (!entry) {
    throw new Error(`Unknown harness: "${name}". Available harnesses: ${HARNESS_NAMES.join(', ')}`);
  }
  return entry;
}

/** Resolve a registered harness's external executable, or `null` for none. */
export function resolveHarnessExecutable(name: string, config: OsqConfig): string | null {
  return lookupHarness(name).executable(config);
}

/** Selected executor identity: harness, effective model or `default`, effort or null. */
export interface ExecutorIdentity {
  readonly harness: HarnessName;
  readonly model: string;
  readonly effort: string | null;
}

/**
 * Identity of the executor selected by configuration. Never borrows a model or
 * effort from a harness that is not the selected one.
 */
export function resolveExecutorIdentity(config: OsqConfig): ExecutorIdentity {
  const entry = lookupHarness(config.harness);
  return {
    harness: entry.name,
    model: entry.model(config) ?? 'default',
    effort: entry.effort(config),
  };
}

/** Planner harness, model, brief attribution, and optional agent actually used. */
export interface PlannerSelection {
  harness: HarnessName;
  model?: string;
  briefModel: string;
  agent?: string;
}

/**
 * Resolve the planner independently of the executor. An explicit `planner`
 * block always wins and never inherits executor model, effort, or agent; with
 * no planner block the selected executor's catalog entry supplies planning
 * capabilities, including its supported default agent.
 */
export function resolvePlannerSelection(config: OsqConfig): PlannerSelection {
  const explicit = config.planner;
  if (explicit) {
    const entry = lookupHarness(explicit.harness);
    const agent = explicit.agent ?? entry.planner.defaultAgent;
    return {
      harness: entry.name,
      model: explicit.model,
      briefModel: explicit.model,
      ...(agent && entry.planner.agent ? { agent } : {}),
    };
  }

  const entry = lookupHarness(config.harness);
  const model = entry.model(config);
  const agent = entry.planner.defaultAgent;
  return {
    harness: entry.name,
    ...(model ? { model } : {}),
    briefModel: model ?? entry.planner.briefModelWhenNative,
    ...(agent && entry.planner.agent ? { agent } : {}),
  };
}

/**
 * Selected model for a harness, never borrowing another harness's model. A
 * native selection is represented as `default` rather than a guessed model.
 */
export function resolveHarnessModel(harness: string, config: OsqConfig): string {
  return lookupHarness(harness).model(config) ?? 'default';
}

/** Configured effort for a harness, or null when the knob does not apply. */
export function resolveHarnessEffort(harness: string, config: OsqConfig): string | null {
  return lookupHarness(harness).effort(config);
}

/** Selected model for the adapter that is actually running. */
export function resolveAdapterModel(_adapterName: string, config: OsqConfig): string {
  return resolveExecutorIdentity(config).model;
}

/** Resolve the Codex executable: explicit config, then `CODEX_PATH`, then `codex`. */
export function resolveCodexBinary(config?: Pick<OsqConfig, 'codex'>): string {
  return lookupHarness('codex').executable((config ?? {}) as OsqConfig) ?? 'codex';
}

/**
 * Resolve the Codex execution model: explicit `codex.model`, then `OSQ_MODEL`
 * only when Codex is the executor, otherwise `undefined` (native default).
 */
export function resolveCodexModel(
  config?: Pick<OsqConfig, 'harness' | 'codex'>,
): string | undefined {
  return lookupHarness('codex').model((config ?? {}) as OsqConfig);
}

/** Resolve the Codex reasoning effort override, or `undefined` for native defaults. */
export function resolveCodexEffort(config?: Pick<OsqConfig, 'codex'>): string | undefined {
  return lookupHarness('codex').effort((config ?? {}) as OsqConfig) ?? undefined;
}

/**
 * Resolve the Pi execution model: explicit `pi.model`, then `OSQ_MODEL` only
 * when Pi is the executor, otherwise `undefined` (Pi's native default).
 */
export function resolvePiModel(config?: Pick<OsqConfig, 'harness' | 'pi'>): string | undefined {
  const explicit = config?.pi?.model?.trim();
  if (explicit) return explicit;
  if (normalizeHarnessName(config?.harness ?? '') === 'pi') {
    const fromEnv = process.env.OSQ_MODEL?.trim();
    if (fromEnv) return fromEnv;
  }
  return undefined;
}
