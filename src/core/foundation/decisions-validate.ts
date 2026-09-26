import type { OsqConfig } from './config.js';
import type { Adr, DecisionRecords } from './decisions.js';

/** Validation errors and warnings for a project's ADRs. */
export interface DecisionProblems {
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

const VALID_STATUSES = new Set(['proposed', 'accepted', 'superseded']);

/** True when two ADR numbers name the same ADR by numeric value: `7` is `007`. */
export function sameAdrNumber(a: string, b: string): boolean {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  if (Number.isNaN(na) || Number.isNaN(nb)) return a === b;
  return na === nb;
}

function validateMalformed(adr: Adr, errors: string[]): void {
  for (const field of adr.malformed) {
    errors.push(`${adr.path}: ${field} must be a list of non-empty strings`);
  }
}

function validateAccepted(adr: Adr, config: OsqConfig, errors: string[]): void {
  if (adr.appliesTo === null) {
    errors.push(`${adr.path}: accepted ADR needs applies_to, either "all" or capabilities`);
  }
  if (adr.rule === '') {
    errors.push(`${adr.path}: accepted ADR needs a one-line rule`);
  } else if (adr.rule.includes('\n')) {
    errors.push(`${adr.path}: rule must be one line`);
  } else if (adr.rule.length > config.limits.maxRuleLength) {
    errors.push(
      `${adr.path}: rule is longer than limits.maxRuleLength (${config.limits.maxRuleLength})`,
    );
  }
}

function validateSuperseded(adr: Adr, numbers: readonly string[], errors: string[]): void {
  const replacement = adr.supersededBy;
  if (replacement === null) {
    errors.push(`${adr.path}: superseded ADR needs superseded_by naming its replacement`);
  } else if (!numbers.some((number) => sameAdrNumber(number, replacement))) {
    errors.push(`${adr.path}: superseded_by ${replacement} names no existing ADR`);
  }
}

function warnUnknownCapabilities(adr: Adr, living: ReadonlySet<string>, warnings: string[]): void {
  if (adr.appliesTo === null || adr.appliesTo === 'all') return;
  for (const name of adr.appliesTo) {
    if (!living.has(name)) {
      warnings.push(`${adr.path}: applies_to capability "${name}" has no living spec`);
    }
  }
}

/**
 * Validates the parsed ADRs: status vocabulary, malformed `checks` and `denies`
 * fields, an accepted ADR's applies_to and rule, a superseded ADR's replacement,
 * plus warnings for ignored files and for capability names without a living spec.
 */
export function validateDecisions(
  records: DecisionRecords,
  livingCapabilities: readonly string[],
  config: OsqConfig,
): DecisionProblems {
  const errors: string[] = [];
  const warnings: string[] = [];
  const living = new Set(livingCapabilities);
  const numbers = records.adrs.map((adr) => adr.number);

  for (const adr of records.adrs) {
    validateMalformed(adr, errors);
    if (!VALID_STATUSES.has(adr.status)) {
      errors.push(`${adr.path}: status must be proposed, accepted, or superseded`);
      continue;
    }
    if (adr.status === 'accepted') validateAccepted(adr, config, errors);
    if (adr.status === 'superseded') validateSuperseded(adr, numbers, errors);
    warnUnknownCapabilities(adr, living, warnings);
  }

  for (const ignoredPath of records.ignored) {
    warnings.push(`${ignoredPath}: no osq frontmatter, ignored`);
  }

  return { errors, warnings };
}
