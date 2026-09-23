import { execFile } from 'node:child_process';
import type { OsqConfig } from './config.js';

/**
 * Optional Pi CLI execution settings. Every field is optional; omitting a field
 * defers to Pi's own native configuration and defaults. Pi reads `AGENTS.md`
 * itself, so osq writes no Pi files.
 */
export interface PiConfig {
  readonly bin?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly thinking?: string;
}

const PI_STRING_FIELDS = ['bin', 'provider', 'model', 'thinking'] as const;

/** Validate optional Pi settings, rejecting blank or non-string values. */
export function validatePiConfig(pi: unknown): PiConfig {
  if (pi === undefined || pi === null) {
    return {};
  }
  if (typeof pi !== 'object' || Array.isArray(pi)) {
    throw new Error('pi configuration must be an object');
  }
  const record = pi as Record<string, unknown>;
  const validated: Record<string, string> = {};
  for (const field of PI_STRING_FIELDS) {
    const value = record[field];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`pi.${field} must be a non-empty string if provided`);
    }
    validated[field] = value.trim();
  }
  return validated;
}

/** Tested Pi release range. Pi ships often, so bumping this is a one-liner. */
export const PI_TESTED_RANGE = '>=0.87.0 <0.88.0';

const PI_TESTED_MIN: readonly [number, number, number] = [0, 87, 0];
const PI_TESTED_MAX: readonly [number, number, number] = [0, 88, 0];

/** Assessment of one `pi --version` line against the tested range. */
export interface PiVersionAssessment {
  readonly version: string;
  readonly tested: boolean;
  readonly warning?: string;
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

/** Assess the first line of `pi --version` without failing outside the range. */
export function assessPiVersion(raw: string): PiVersionAssessment {
  const version = raw.trim().split('\n')[0]?.trim() ?? '';
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) {
    return {
      version,
      tested: false,
      warning: `Pi version "${version}" is outside the tested range ${PI_TESTED_RANGE}`,
    };
  }
  const current: [number, number, number] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const tested =
    compareVersion(current, PI_TESTED_MIN) >= 0 && compareVersion(current, PI_TESTED_MAX) < 0;
  if (tested) return { version, tested };
  return {
    version,
    tested,
    warning: `Pi ${version} is outside the tested range ${PI_TESTED_RANGE}`,
  };
}

/** Outcome of `pi auth check --provider <name> --json`. */
export interface PiAuthResult {
  readonly ok: boolean;
  readonly status: string;
  readonly provider: string;
  readonly reason?: string;
}

/** Inputs a catalog entry's doctor `diagnose` hook receives after a probe. */
export interface HarnessDiagnoseContext {
  readonly config: OsqConfig;
  readonly projectRoot: string;
  readonly version: string;
}

/** One extra doctor check contributed by a catalog entry. */
export interface HarnessDiagnosis {
  readonly name: string;
  readonly ok: boolean;
  readonly warning?: boolean;
  readonly message: string;
}

/** Resolve the Pi executable: explicit `pi.bin`, then `OSQ_PI_PATH`, then `pi`. */
export function resolvePiBinary(config?: { readonly pi?: { readonly bin?: string } }): string {
  const explicit = config?.pi?.bin?.trim();
  if (explicit) return explicit;
  const fromEnv = process.env.OSQ_PI_PATH?.trim();
  if (fromEnv) return fromEnv;
  return 'pi';
}

/** Pi thinking level as effort, or null when unset. */
export function resolvePiEffort(config?: {
  readonly pi?: { readonly thinking?: string };
}): string | null {
  return config?.pi?.thinking?.trim() || null;
}

/** Version warning plus provider credential check for `osq doctor`. */
export async function diagnosePi(
  context: HarnessDiagnoseContext,
): Promise<readonly HarnessDiagnosis[]> {
  const assessment = assessPiVersion(context.version);
  const version: HarnessDiagnosis = {
    name: 'harness-version',
    ok: true,
    ...(assessment.tested ? {} : { warning: true }),
    message: assessment.tested
      ? `Pi ${assessment.version} (tested ${PI_TESTED_RANGE})`
      : (assessment.warning ?? `Pi ${assessment.version} is outside ${PI_TESTED_RANGE}`),
  };

  const provider = context.config.pi?.provider?.trim();
  if (!provider) return [version];

  const auth = await runPiAuthCheck(
    resolvePiBinary(context.config),
    context.projectRoot,
    provider,
    context.config.timeouts?.harnessPreflightSeconds ?? 10,
  );
  const authCheck: HarnessDiagnosis = auth.ok
    ? { name: 'harness-auth', ok: true, message: `${auth.provider} credentials ready` }
    : {
        name: 'harness-auth',
        ok: false,
        message: `${auth.provider} credentials not ready: ${auth.reason ?? auth.status}`,
      };
  return [version, authCheck];
}

function parseJsonRecord(raw: string): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function stringField(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * Run `pi auth check --provider <name> --json`. Pi exits 0, 1, or 2 and always
 * prints the status object, so a non-zero exit is data, not an error.
 */
export function runPiAuthCheck(
  bin: string,
  projectRoot: string,
  provider: string,
  timeoutSeconds = 10,
): Promise<PiAuthResult> {
  return new Promise((resolve) => {
    execFile(
      bin,
      ['auth', 'check', '--provider', provider, '--json'],
      { cwd: projectRoot, timeout: timeoutSeconds * 1000 },
      (err, stdout) => {
        const parsed = parseJsonRecord((stdout || '').trim());
        const status = stringField(parsed, 'status') ?? (err ? 'error' : 'unknown');
        const reason = stringField(parsed, 'reason') ?? (err ? String(err.message) : undefined);
        const resolvedProvider = stringField(parsed, 'provider') ?? provider;
        resolve({
          ok: status === 'ready',
          status,
          provider: resolvedProvider,
          ...(reason ? { reason } : {}),
        });
      },
    );
  });
}
