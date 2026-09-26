import type { HarnessDiagnoseContext, HarnessDiagnosis } from './config-pi.js';

/** Tested opencode release range. opencode 1 is deliberately out of support. */
export const OPENCODE_TESTED_RANGE = '>=2.0.0 <3.0.0';

const OPENCODE_TESTED_MIN: readonly [number, number, number] = [2, 0, 0];
const OPENCODE_TESTED_MAX: readonly [number, number, number] = [3, 0, 0];

/** Assessment of one `opencode --version` line against the tested range. */
export interface OpencodeVersionAssessment {
  /** Extracted `major.minor.patch`, or the raw first line when unparseable. */
  readonly version: string;
  /** False only below 2.0.0, the one version that is a hard failure. */
  readonly ok: boolean;
  /** True only inside `>=2.0.0 <3.0.0`. */
  readonly tested: boolean;
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

/**
 * Assess the first `major.minor.patch` in `opencode --version` output, so
 * `opencode v2.0.18` reads as `2.0.18`. Below 2.0.0 is a failure; a version at
 * or above 3.0.0, or output with no readable version, is a passing warning.
 */
export function assessOpencodeVersion(raw: string): OpencodeVersionAssessment {
  const line = raw.trim().split('\n')[0]?.trim() ?? '';
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(line);
  if (!match) {
    return { version: line, ok: true, tested: false };
  }
  const version = `${match[1]}.${match[2]}.${match[3]}`;
  const current: [number, number, number] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const atLeastMinimum = compareVersion(current, OPENCODE_TESTED_MIN) >= 0;
  const tested = atLeastMinimum && compareVersion(current, OPENCODE_TESTED_MAX) < 0;
  return { version, ok: atLeastMinimum, tested };
}

function versionMessage(assessment: OpencodeVersionAssessment): string {
  if (assessment.tested) {
    return `opencode ${assessment.version} (tested ${OPENCODE_TESTED_RANGE})`;
  }
  if (assessment.ok) {
    return `opencode ${assessment.version} is outside the tested range ${OPENCODE_TESTED_RANGE}`;
  }
  return `opencode ${assessment.version} is not supported; the opencode adapter needs opencode 2 (tested ${OPENCODE_TESTED_RANGE})`;
}

/**
 * Version check for `osq doctor`. Inside the tested range the check passes
 * silently; below 2.0.0 it fails because the adapter no longer supports
 * opencode 1; above the range and unparseable output pass with a warning.
 */
export async function diagnoseOpencode(
  context: HarnessDiagnoseContext,
): Promise<readonly HarnessDiagnosis[]> {
  const assessment = assessOpencodeVersion(context.version);
  const warns = assessment.ok && !assessment.tested;
  return [
    {
      name: 'harness-version',
      ok: assessment.ok,
      ...(warns ? { warning: true } : {}),
      message: versionMessage(assessment),
    },
  ];
}
