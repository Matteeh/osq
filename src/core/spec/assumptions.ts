/**
 * The proposal `## Assumptions` section: reading its lines and detecting a
 * section that exists but was never filled in. A proposal without the section
 * is a legacy document and stays silent, exactly as `## Surface` does.
 */

/** HTML comments are structural scaffolding, not declared assumption text. */
const HTML_COMMENT_REGEX = /<!--[\s\S]*?-->/g;

/** The one find-it error for a proposal `## Assumptions` section left empty. */
export const PROPOSAL_ASSUMPTIONS_ERROR =
  "proposal.md's ## Assumptions section is empty: write None or one line per assumption";

/**
 * Reads the raw body of a proposal's `## Assumptions` section. The heading must
 * occupy its own line and runs to the next `## ` heading, exactly as
 * `readSurfaceSection` in `linter.ts` reads `## Surface`. Returns `null` when
 * the section is absent.
 */
function readAssumptionsSection(body: string): string | null {
  const match = /^##\s+Assumptions\s*$/m.exec(body);
  if (!match) {
    return null;
  }
  const rest = body.slice(match.index + match[0].length);
  const boundary = rest.search(/\n##(?!#)\s/);
  return boundary === -1 ? rest : rest.slice(0, boundary);
}

/** Drop a leading `- ` list marker from one assumption line. */
function stripListMarker(line: string): string {
  return line.replace(/^-\s+/, '');
}

/**
 * Reads a proposal body's `## Assumptions` section. Returns `null` when the
 * section is absent, an empty list when the only line is `None`, and otherwise
 * the section's non-empty lines after HTML comments are removed, each trimmed
 * and without a leading `- ` list marker.
 *
 * @scenario spec-lint-and-approve: Assumptions read from a section
 */
export function readAssumptions(body: string): readonly string[] | null {
  const section = readAssumptionsSection(body);
  if (section === null) {
    return null;
  }
  const lines = section
    .replace(HTML_COMMENT_REGEX, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(stripListMarker);
  if (lines.length === 1 && lines[0] === 'None') {
    return [];
  }
  return lines;
}

/**
 * True when a proposal has an `## Assumptions` section holding nothing but
 * HTML comments and whitespace. A missing section is not empty here: lint
 * reports no assumptions finding for a proposal that predates the section.
 *
 * @scenario spec-lint-and-approve: Comment-only assumptions
 * @scenario spec-lint-and-approve: Proposal without assumptions
 */
export function assumptionsSectionIsEmpty(body: string): boolean {
  const section = readAssumptionsSection(body);
  if (section === null) {
    return false;
  }
  return section.replace(HTML_COMMENT_REGEX, '').trim().length === 0;
}
