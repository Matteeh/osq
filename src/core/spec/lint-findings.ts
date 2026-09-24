/**
 * The shared lint finding shape.
 *
 * Every diagnostic lint produces carries the severity that decides whether it
 * blocks, the repository-relative file it concerns, the requirement or section
 * within that file when one applies, and the human-readable message. The
 * change's own findings decide validity; repository findings are reported but
 * never block.
 */

/** A finding either fails the change (`error`) or merely informs (`warning`). */
export type LintSeverity = 'error' | 'warning';

/** Classify an OpenSpec level; `WARNING` and `INFO` are lint warnings. */
export function openSpecSeverity(level: string): LintSeverity {
  const lowered = level.toLowerCase();
  return lowered.includes('warn') || lowered.includes('info') ? 'warning' : 'error';
}

export interface LintFinding {
  readonly severity: LintSeverity;
  readonly file: string;
  readonly requirement: string | null;
  readonly section: string | null;
  readonly message: string;
}

/** The location fields of a finding; the requirement and section default to null. */
export interface FindingLocation {
  readonly file: string;
  readonly requirement?: string | null;
  readonly section?: string | null;
}

export function makeFinding(
  severity: LintSeverity,
  location: FindingLocation,
  message: string,
): LintFinding {
  return {
    severity,
    file: location.file,
    requirement: location.requirement ?? null,
    section: location.section ?? null,
    message,
  };
}

/**
 * Accumulates the change's own findings apart from repository findings and
 * derives the legacy message arrays from the change's own findings in order.
 */
export class LintFindingSet {
  private readonly ownFindings: LintFinding[] = [];
  private readonly repositoryFindings: LintFinding[] = [];

  get findings(): readonly LintFinding[] {
    return this.ownFindings;
  }

  get repository(): readonly LintFinding[] {
    return this.repositoryFindings;
  }

  error(location: FindingLocation, message: string): void {
    this.ownFindings.push(makeFinding('error', location, message));
  }

  warning(location: FindingLocation, message: string): void {
    this.ownFindings.push(makeFinding('warning', location, message));
  }

  addOwn(finding: LintFinding): void {
    this.ownFindings.push(finding);
  }

  addRepository(finding: LintFinding): void {
    this.repositoryFindings.push(finding);
  }

  errors(): string[] {
    return this.ownFindings.filter((f) => f.severity === 'error').map((f) => f.message);
  }

  warnings(): string[] {
    return this.ownFindings.filter((f) => f.severity === 'warning').map((f) => f.message);
  }
}
