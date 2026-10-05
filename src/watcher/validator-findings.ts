import type { ValidatorFinding, ValidatorProblem } from '../harness/types.js';

const VALIDATOR_PROBLEMS: readonly ValidatorProblem[] = [
  'no_code',
  'no_test',
  'passes_without_change',
];

function isProblem(value: unknown): value is ValidatorProblem {
  return typeof value === 'string' && (VALIDATOR_PROBLEMS as readonly string[]).includes(value);
}

/** A field's trimmed non-empty string value, or null when it is missing or empty. */
function readField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** One strict finding, or null when any field is missing, empty, or unknown. */
function readFinding(value: unknown): ValidatorFinding | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.kind !== 'scenario') return null;
  const capability = readField(record, 'capability');
  const requirement = readField(record, 'requirement');
  const scenario = readField(record, 'scenario');
  const detail = readField(record, 'detail');
  if (!capability || !requirement || !scenario || !detail || !isProblem(record.problem)) {
    return null;
  }
  return {
    kind: 'scenario',
    capability,
    requirement,
    scenario,
    problem: record.problem,
    detail,
  };
}

/**
 * Read the validator's findings file. Returns the findings in file order with
 * their strings trimmed, or null when the text is not JSON, has no `findings`
 * array, or holds any finding with another kind or problem, or a missing or
 * empty field. `{"findings": []}` is a run with no findings.
 */
export function parseValidatorFindings(text: string): ValidatorFinding[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const raw = (parsed as Record<string, unknown>).findings;
  if (!Array.isArray(raw)) return null;

  const findings: ValidatorFinding[] = [];
  for (const entry of raw) {
    const finding = readFinding(entry);
    if (!finding) return null;
    findings.push(finding);
  }
  return findings;
}
