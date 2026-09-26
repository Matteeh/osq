import { extractSection } from './parser.js';

/** The after-landing requirements an archived change records on its event. */
export interface VerificationRequirement {
  readonly afterLanding: boolean;
  readonly check: string | null;
}

/** The two halves of `## Human steps`, split by their subsections. */
export interface HumanSteps {
  readonly beforeApproval: string;
  readonly afterLanding: string;
}

const NONE = /^none\.?$/i;

function normalizePart(value: string): string {
  const trimmed = value.trim();
  return trimmed === '' || NONE.test(trimmed) ? '' : trimmed;
}

/**
 * Splits `## Human steps` into `beforeApproval` and `afterLanding` by its
 * `### Before approval` and `### After landing` subsections, in any case.
 * Text before the first subsection, or a section with neither, is after
 * landing. A part that is empty or `None` is empty.
 */
export function parseHumanSteps(body: string): HumanSteps {
  const section = extractSection(body, 'Human steps');
  if (!section) {
    return { beforeApproval: '', afterLanding: '' };
  }

  const before: string[] = [];
  const after: string[] = [];
  let current: 'preamble' | 'before' | 'after' = 'preamble';

  for (const line of section.split(/\r?\n/)) {
    const heading = line
      .match(/^###\s+(.+?)\s*$/)?.[1]
      ?.trim()
      .toLowerCase();
    if (heading === 'before approval') {
      current = 'before';
      continue;
    }
    if (heading === 'after landing') {
      current = 'after';
      continue;
    }
    if (current === 'before') before.push(line);
    else after.push(line);
  }

  return {
    beforeApproval: normalizePart(before.join('\n')),
    afterLanding: normalizePart(after.join('\n')),
  };
}

/** The trimmed frontmatter `check` command, else null. */
export function readCheckCommand(frontmatterData: Record<string, unknown>): string | null {
  const value = frontmatterData.check;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
