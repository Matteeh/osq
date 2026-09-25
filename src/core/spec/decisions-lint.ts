import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { type Adr, readDecisions, sameAdrNumber } from '../foundation/decisions.js';
import { checkProjectRules } from '../foundation/rules-block.js';
import { type LintFinding, makeFinding } from './lint-findings.js';

/**
 * Decisions lint: the proposal's `## Decisions` section and the AGENTS.md
 * project rules block, checked only when the project has at least one ADR with
 * osq frontmatter. A project without ADRs returns no findings.
 */

/** HTML comments are structural scaffolding, not declared decision text. */
const HTML_COMMENT_REGEX = /<!--[\s\S]*?-->/g;

/** An `ADR <n>` mention anywhere in the section; a departure line names its ADR. */
const ADR_MENTION_REGEX = /\bADR\s+(\d+)/g;

const MISSING_SECTION_ERROR =
  'proposal.md needs a ## Decisions section: name each accepted ADR that governs a capability this change writes, or write None';

export interface DecisionsLintInput {
  readonly projectRoot: string;
  readonly folderPath: string;
  /** Repository-relative `proposal.md`; the change document's own findings. */
  readonly proposalPath: string;
  /** The proposal body with frontmatter stripped. */
  readonly proposalBody: string;
  readonly config: OsqConfig;
}

/**
 * Reads a proposal body's `## <heading>` section content. The heading must
 * occupy its own line; a mention inside prose does not count. Returns `null`
 * when the section is absent.
 */
function readSection(body: string, heading: string): string | null {
  const match = new RegExp(`^##\\s+${heading}\\s*$`, 'm').exec(body);
  if (!match) {
    return null;
  }
  const rest = body.slice(match.index + match[0].length);
  const boundary = rest.search(/\n##(?!#)\s/);
  return boundary === -1 ? rest : rest.slice(0, boundary);
}

/** True when a section holds only HTML comments and whitespace. */
function sectionIsBlank(section: string): boolean {
  return section.replace(HTML_COMMENT_REGEX, '').trim().length === 0;
}

/** True when `target` exists as a regular file. */
async function fileExists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then((stat) => stat.isFile())
    .catch(() => false);
}

/** Capability names whose directory under the change's `specs/` holds `spec.md`. */
async function readWrittenCapabilities(folderPath: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(path.join(folderPath, 'specs'), { withFileTypes: true });
  } catch {
    return [];
  }

  const capabilities: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (await fileExists(path.join(folderPath, 'specs', entry.name, 'spec.md'))) {
      capabilities.push(entry.name);
    }
  }
  return capabilities.sort();
}

/** The distinct ADR numbers named anywhere in a Decisions section, in order. */
function mentionedAdrNumbers(section: string): string[] {
  const numbers: string[] = [];
  for (const match of section.matchAll(ADR_MENTION_REGEX)) {
    if (!numbers.some((number) => sameAdrNumber(number, match[1]))) {
      numbers.push(match[1]);
    }
  }
  return numbers;
}

/** One error per governing capability ADR the section leaves unnamed. */
function unnamedAdrFindings(
  section: string,
  adrs: readonly Adr[],
  written: readonly string[],
  proposalPath: string,
): LintFinding[] {
  const mentioned = mentionedAdrNumbers(section);
  const findings: LintFinding[] = [];
  for (const adr of adrs) {
    const applies = adr.appliesTo;
    if (adr.status !== 'accepted' || applies === null || applies === 'all') {
      continue;
    }
    const capability = written.find((name) => applies.includes(name));
    if (capability === undefined) {
      continue;
    }
    if (mentioned.some((number) => sameAdrNumber(number, adr.number))) {
      continue;
    }
    findings.push(
      makeFinding(
        'error',
        { file: proposalPath, section: 'Decisions' },
        `proposal.md ## Decisions does not name ADR ${adr.number}, which applies to ${capability}`,
      ),
    );
  }
  return findings;
}

/** One warning per named ADR number that doesn't exist or isn't accepted. */
function unknownAdrFindings(
  section: string,
  adrs: readonly Adr[],
  proposalPath: string,
): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const number of mentionedAdrNumbers(section)) {
    const adr = adrs.find((entry) => sameAdrNumber(entry.number, number));
    if (adr !== undefined && adr.status === 'accepted') {
      continue;
    }
    findings.push(
      makeFinding(
        'warning',
        { file: proposalPath, section: 'Decisions' },
        `proposal.md ## Decisions names ADR ${number}, which does not exist or is not accepted`,
      ),
    );
  }
  return findings;
}

/**
 * Checks a proposal's Decisions section and, when the project has ADRs, the
 * AGENTS.md project rules block. Returns the change's own findings; a project
 * whose decisions folder holds no ADR with osq frontmatter returns none.
 */
export async function collectDecisionsFindings(input: DecisionsLintInput): Promise<LintFinding[]> {
  const records = await readDecisions(input.projectRoot, input.config);
  if (records.adrs.length === 0) {
    return [];
  }

  const findings: LintFinding[] = [];
  for (const message of await checkProjectRules(input.projectRoot, input.config)) {
    findings.push(makeFinding('error', { file: 'AGENTS.md' }, message));
  }

  const section = readSection(input.proposalBody, 'Decisions');
  if (section === null || sectionIsBlank(section)) {
    findings.push(
      makeFinding(
        'error',
        { file: input.proposalPath, section: 'Decisions' },
        MISSING_SECTION_ERROR,
      ),
    );
    return findings;
  }

  const written = await readWrittenCapabilities(input.folderPath);
  findings.push(...unnamedAdrFindings(section, records.adrs, written, input.proposalPath));
  findings.push(...unknownAdrFindings(section, records.adrs, input.proposalPath));
  return findings;
}
