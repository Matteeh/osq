import type { DeltaRequirement } from './delta.js';
import { type LintFinding, makeFinding } from './lint-findings.js';

/** A whole line that is an HTML comment whose text starts with `source:`. */
const SOURCE_COMMENT_LINE_REGEX = /^<!--\s*source:.*-->$/;

/** The only requirement allowed to keep a source comment. */
const CODE_OWNERSHIP_REQUIREMENT = 'Code ownership';

/**
 * Warn once per delta requirement, other than `Code ownership`, that carries a
 * source comment: a line that on its own is an HTML comment whose text starts
 * with `source:`. A mention inside other text, such as within backticks, is
 * not a source comment and produces no finding.
 */
export function sourceCommentFindings(
  capability: string,
  deltaFile: string,
  requirements: readonly DeltaRequirement[],
): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const requirement of requirements) {
    if (requirement.name === CODE_OWNERSHIP_REQUIREMENT) {
      continue;
    }
    const carriesSource = requirement.raw
      .split('\n')
      .some((line) => SOURCE_COMMENT_LINE_REGEX.test(line));
    if (!carriesSource) {
      continue;
    }
    findings.push(
      makeFinding(
        'warning',
        { file: deltaFile, requirement: requirement.name },
        `${capability}: requirement "${requirement.name}" carries a source comment; only Code ownership keeps one`,
      ),
    );
  }
  return findings;
}
