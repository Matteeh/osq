import type { SpecDetails, ValidatorProblem, ValidatorRanEventData } from './show-types.js';

/** How each validator problem reads in a finding line. */
const PROBLEM_WORDS: Record<ValidatorProblem, string> = {
  no_code: 'no code meets it',
  no_test: 'no test covers it',
  passes_without_change: 'its test passes without the change',
};

/** The validated run's findings, or none for a malformed or other outcome. */
function findings(
  data: ValidatorRanEventData,
): readonly ValidatorRanEventData['findings'][number][] {
  return data.outcome === 'validated' && Array.isArray(data.findings) ? data.findings : [];
}

/** The whole-seconds duration the headline reports. */
function durationSeconds(data: ValidatorRanEventData): number {
  return Math.round(Number.isFinite(data.duration) ? data.duration : 0);
}

/** The `Validation:` headline, without the leading blank line. */
function headline(data: ValidatorRanEventData): string {
  if (data.outcome === 'not_run') {
    return `Validation: not run (${data.reason ?? 'unknown'})`;
  }
  const run = `Validation: ${data.outcome} by ${data.harness}/${data.model} in ${durationSeconds(data)}s`;
  if (data.outcome !== 'validated') return run;
  return `${run}, ${data.scenarios} scenarios judged, ${findings(data).length} findings`;
}

/** One line per finding of a validated run. */
function findingLines(data: ValidatorRanEventData): string[] {
  return findings(data).map(
    (finding) =>
      `  - ${finding.capability}: ${finding.requirement} / ${finding.scenario}: ${PROBLEM_WORDS[finding.problem]}. ${finding.detail}`,
  );
}

/**
 * The `Validation:` section lines for a change whose detail carries validation,
 * or no lines when it does not. It reads no files.
 */
export function validationLines(details: SpecDetails): string[] {
  const data = details.validation;
  if (!data) return [];
  const lines = ['', headline(data), ...findingLines(data)];
  if (Array.isArray(data.restored) && data.restored.length > 0) {
    lines.push(`  Restored: ${data.restored.join(', ')}`);
  }
  return lines;
}
