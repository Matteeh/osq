/**
 * Text and JSON rendering for `osq lint`.
 *
 * A change's own findings print under the change name, repository findings
 * print once in their own group, and `--json` carries the same fields as one
 * document. Formatting, deduplication, and document building live here so the
 * command stays small.
 */

import type { LintFinding } from './lint-findings.js';

/** The repository group header printed once after every change. */
export const REPOSITORY_HEADER =
  'repository: findings about other changes and living specs; they do not affect the exit code';

/** The minimal logger surface finding printing needs. */
export interface FindingLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/** The JSON document `osq lint --json` writes to stdout. */
export interface LintJsonDocument {
  readonly valid: boolean;
  readonly changes: LintJsonChange[];
  readonly repository: LintFinding[];
}

export interface LintJsonChange {
  readonly change: string;
  readonly valid: boolean;
  readonly findings: LintFinding[];
}

/** One linted change as the JSON builder consumes it. */
export interface LintJsonEntry {
  readonly change: string;
  readonly valid: boolean;
  readonly findings: readonly LintFinding[];
  readonly repository: readonly LintFinding[];
}

/** The requirement-or-section qualifier, preferring the requirement. */
function qualifier(finding: LintFinding): string {
  const name = finding.requirement ?? finding.section;
  return name === null ? '' : ` (${name})`;
}

/** Format one finding as `<prefix>: <severity> <file><qualifier>: <message>`. */
export function formatFinding(prefix: string, finding: LintFinding): string {
  return `${prefix}: ${finding.severity} ${finding.file}${qualifier(finding)}: ${finding.message}`;
}

/** Format one change's own finding under the change name. */
export function formatChangeFinding(change: string, finding: LintFinding): string {
  return formatFinding(change, finding);
}

/** Format one repository finding under the fixed `repository` prefix. */
export function formatRepositoryFinding(finding: LintFinding): string {
  return formatFinding('repository', finding);
}

/** True when two findings are equal in every field. */
function sameFinding(left: LintFinding, right: LintFinding): boolean {
  return (
    left.severity === right.severity &&
    left.file === right.file &&
    left.requirement === right.requirement &&
    left.section === right.section &&
    left.message === right.message
  );
}

/** Drop findings equal in every field, keeping the first occurrence's order. */
export function dedupeFindings(findings: readonly LintFinding[]): LintFinding[] {
  const unique: LintFinding[] = [];
  for (const finding of findings) {
    if (!unique.some((existing) => sameFinding(existing, finding))) {
      unique.push(finding);
    }
  }
  return unique;
}

/** Print one finding at the logger level that matches its severity. */
function printFinding(logger: FindingLogger, prefix: string, finding: LintFinding): void {
  const line = formatFinding(prefix, finding);
  if (finding.severity === 'error') {
    logger.error(line);
  } else {
    logger.warn(line);
  }
}

/** Print a change's findings and, when valid, its validity line. */
export function printChangeFindings(
  logger: FindingLogger,
  change: string,
  result: { readonly valid: boolean; readonly findings: readonly LintFinding[] },
): void {
  for (const finding of result.findings) {
    printFinding(logger, change, finding);
  }
  if (result.valid) {
    logger.info(`${change}: valid`);
  }
}

/** Print the repository group, one line per unique finding, or nothing. */
export function printRepositoryFindings(
  logger: FindingLogger,
  findings: readonly LintFinding[],
): void {
  if (findings.length === 0) {
    return;
  }
  logger.info(REPOSITORY_HEADER);
  for (const finding of findings) {
    printFinding(logger, 'repository', finding);
  }
}

/** Build the `osq lint --json` document from every linted change. */
export function buildLintJson(valid: boolean, entries: readonly LintJsonEntry[]): LintJsonDocument {
  return {
    valid,
    changes: entries.map((entry) => ({
      change: entry.change,
      valid: entry.valid,
      findings: [...entry.findings],
    })),
    repository: dedupeFindings(entries.flatMap((entry) => [...entry.repository])),
  };
}
