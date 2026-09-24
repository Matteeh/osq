import type { HarnessDiagnoseContext, HarnessDiagnosis } from './config-pi.js';
import type { OsqConfig } from './config.js';

/**
 * Optional Claude Code execution settings. Every field is optional; omitting a
 * field defers to Claude Code's own native configuration and defaults.
 */
export interface ClaudeConfig {
  readonly bin?: string;
  readonly model?: string;
  /** Confine Bash with Claude Code's OS sandbox (needs bubblewrap and socat). */
  readonly sandbox?: boolean;
}

const CLAUDE_STRING_FIELDS = ['bin', 'model'] as const;

/** Validate optional Claude settings, rejecting blank strings and non-booleans. */
export function validateClaudeConfig(claude: unknown): ClaudeConfig {
  if (claude === undefined || claude === null) {
    return {};
  }
  if (typeof claude !== 'object' || Array.isArray(claude)) {
    throw new Error('claude configuration must be an object');
  }
  const record = claude as Record<string, unknown>;
  const validated: { bin?: string; model?: string; sandbox?: boolean } = {};
  for (const field of CLAUDE_STRING_FIELDS) {
    const value = record[field];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`claude.${field} must be a non-empty string if provided`);
    }
    validated[field] = value.trim();
  }
  const sandbox = record.sandbox;
  if (sandbox !== undefined) {
    if (typeof sandbox !== 'boolean') {
      throw new Error('claude.sandbox must be a boolean if provided');
    }
    validated.sandbox = sandbox;
  }
  return validated;
}

/** The oldest Claude Code release every flag osq passes was verified against. */
export const CLAUDE_MINIMUM_VERSION = '2.1.278';

/** Resolve the Claude Code executable: explicit `claude.bin`, then `claude`. */
export function resolveClaudeBinary(config?: {
  readonly claude?: { readonly bin?: string };
}): string {
  const explicit = config?.claude?.bin?.trim();
  if (explicit) return explicit;
  return 'claude';
}

/**
 * Claude Code execution model: explicit `claude.model`, then `OSQ_MODEL`, but
 * only when Claude is the selected executor. `undefined` defers to Claude Code's
 * native default, which the executor identity reports as `default`.
 */
export function resolveClaudeModel(
  config?: { readonly claude?: { readonly model?: string } },
  selected = false,
): string | undefined {
  const explicit = config?.claude?.model?.trim();
  if (explicit) return explicit;
  if (!selected) return undefined;
  return process.env.OSQ_MODEL?.trim() || undefined;
}

function parseVersion(raw: string): readonly [number, number, number] | undefined {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(raw);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersion(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return (a[i] ?? 0) - (b[i] ?? 0);
  }
  return 0;
}

/** Assessment of one `claude --version` line against the minimum version. */
export interface ClaudeVersionAssessment {
  readonly version: string;
  readonly ok: boolean;
}

/** Assess the first line of `claude --version` against {@link CLAUDE_MINIMUM_VERSION}. */
export function assessClaudeVersion(raw: string): ClaudeVersionAssessment {
  const version = raw.trim().split('\n')[0]?.trim() ?? '';
  const current = parseVersion(version);
  const minimum = parseVersion(CLAUDE_MINIMUM_VERSION);
  if (!current || !minimum) return { version, ok: false };
  return { version, ok: compareVersion(current, minimum) >= 0 };
}

function containmentText(config: OsqConfig): string {
  return config.claude?.sandbox
    ? 'file tools confined to the project; git denied; Bash sandboxed with no network'
    : 'file tools confined to the project; git denied; Bash unconfined with open network';
}

/** What the harness confines for this configuration, as the catalog reports it. */
export function claudeContainment(config: OsqConfig): string {
  return containmentText(config);
}

/**
 * Version floor plus containment report for `osq doctor`. A version below the
 * minimum fails; the containment line always passes and states the truth for
 * the configured sandbox setting.
 */
export async function diagnoseClaude(
  context: HarnessDiagnoseContext,
): Promise<readonly HarnessDiagnosis[]> {
  const assessment = assessClaudeVersion(context.version);
  const versionCheck: HarnessDiagnosis = assessment.ok
    ? {
        name: 'harness-version',
        ok: true,
        message: `Claude Code ${assessment.version} (minimum ${CLAUDE_MINIMUM_VERSION})`,
      }
    : {
        name: 'harness-version',
        ok: false,
        message: `Claude Code ${assessment.version} is below the required ${CLAUDE_MINIMUM_VERSION}`,
      };
  return [
    versionCheck,
    { name: 'harness-containment', ok: true, message: containmentText(context.config) },
  ];
}
