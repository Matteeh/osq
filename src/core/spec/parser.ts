import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

export interface FrontmatterResult {
  data: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(content: string): FrontmatterResult {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: content };
  }

  try {
    const data = YAML.parse(match[1]) || {};
    return {
      data: typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {},
      body: match[2] || '',
    };
  } catch {
    return { data: {}, body: content };
  }
}

export interface SpecFeatures {
  readonly reads: string[];
}

/**
 * Detects whether raw proposal frontmatter declares `features.writes`.
 * The field is no longer part of the proposal schema: capability writes are
 * declared solely by the delta spec files under `specs/<capability>/spec.md`.
 * The linter uses this to reject any frontmatter still carrying the key.
 */
export function hasDeclaredWrites(data: Record<string, unknown>): boolean {
  const features = data.features;
  if (features === null || typeof features !== 'object' || Array.isArray(features)) {
    return false;
  }
  return 'writes' in (features as Record<string, unknown>);
}

export interface SpecData {
  readonly title: string;
  readonly dependsOn: string[];
  readonly features: SpecFeatures;
  readonly goal: string;
  readonly contract: string;
  readonly contractTablesCount: number;
  readonly nonGoals: string;
  readonly delta: string;
  readonly verify: string;
  readonly raw: string;
}

function extractSection(body: string, heading: string): string {
  const regex = new RegExp(`##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=(?:\\n##\\s+|$))`, 'i');
  const match = body.match(regex);
  return match ? match[1].trim() : '';
}

function countMarkdownTables(text: string): number {
  const tableRegex = /\|[^\n]+\|\r?\n\|[-:\s|]+\|\r?\n(?:\|[^\n]+\|\r?\n?)+/g;
  const matches = text.match(tableRegex);
  return matches ? matches.length : 0;
}

export function parseSpecMd(content: string): SpecData {
  const { data, body } = parseFrontmatter(content);

  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const dependsOn = Array.isArray(data.depends_on)
    ? data.depends_on.map((d: unknown) => {
        const str = String(d).trim();
        const num = Number.parseInt(str, 10);
        return !Number.isNaN(num) ? String(num).padStart(3, '0') : str;
      })
    : [];

  const rawFeatures = (data.features as Record<string, unknown>) || {};
  const reads = Array.isArray(rawFeatures.reads)
    ? rawFeatures.reads.map((r: unknown) => String(r).trim())
    : [];

  const goal = extractSection(body, 'Goal');
  const contract = extractSection(body, 'Contract');
  const nonGoals = extractSection(body, 'Non-goals');
  const delta = extractSection(body, 'Delta');
  const verify = typeof data.verify === 'string' ? data.verify.trim() : '';

  return {
    title,
    dependsOn,
    features: { reads },
    goal,
    contract,
    contractTablesCount: countMarkdownTables(contract),
    nonGoals,
    delta,
    verify,
    raw: content,
  };
}

/**
 * Extracts the file path globs owned by a capability from a
 * `### Requirement: Code ownership` block. Globs are read from the
 * `<!-- source: ... -->` comment declared directly beneath the header
 * (comma-separated). When no source comment is present, backtick-quoted
 * path-like tokens inside the requirement block are used as a fallback.
 * Returns an empty array when the header is absent.
 */
export function parseCodeOwnership(content: string): string[] {
  const headerRegex = /^###\s+Requirement:\s*Code ownership\s*$/im;
  const headerMatch = headerRegex.exec(content);
  if (!headerMatch) {
    return [];
  }

  const rest = content.slice(headerMatch.index + headerMatch[0].length);
  const boundary = rest.search(/\n(?:###\s|##(?!#)\s)/);
  const block = boundary === -1 ? rest : rest.slice(0, boundary);

  const sourceRegex = /<!--\s*source:\s*([\s\S]*?)-->/i;
  const sourceMatch = sourceRegex.exec(block);
  if (sourceMatch) {
    return sourceMatch[1]
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  const globs: string[] = [];
  const seen = new Set<string>();
  for (const match of block.matchAll(/`([^`]+)`/g)) {
    const token = match[1].trim();
    if (token && /[/\\*]/.test(token) && !seen.has(token)) {
      seen.add(token);
      globs.push(token);
    }
  }

  return globs;
}

export const PROPOSAL_FILENAME = 'proposal.md';
export const SPEC_FILENAME = 'spec.md';

export type ChangeDocKind = 'proposal' | 'spec';

export interface ResolvedChangeDoc {
  readonly path: string;
  readonly kind: ChangeDocKind;
}

async function fileExists(filePath: string): Promise<boolean> {
  return fs
    .stat(filePath)
    .then(() => true)
    .catch(() => false);
}

/**
 * Resolves the change document inside a change folder, preferring the
 * OpenSpec `proposal.md` and falling back to the legacy `spec.md`.
 */
export async function resolveChangeDoc(folderPath: string): Promise<ResolvedChangeDoc | null> {
  const proposalPath = path.join(folderPath, PROPOSAL_FILENAME);
  if (await fileExists(proposalPath)) {
    return { path: proposalPath, kind: 'proposal' };
  }

  const specPath = path.join(folderPath, SPEC_FILENAME);
  if (await fileExists(specPath)) {
    return { path: specPath, kind: 'spec' };
  }

  return null;
}

/**
 * Parses `proposal.md` when present, otherwise falls back to `spec.md`.
 * Returns null when neither file exists in the change folder.
 */
export async function parseSpecMdFromFolder(folderPath: string): Promise<SpecData | null> {
  const resolved = await resolveChangeDoc(folderPath);
  if (!resolved) {
    return null;
  }

  const content = await fs.readFile(resolved.path, 'utf8');
  return parseSpecMd(content);
}

export type VerifyStarts = 'red' | 'green' | 'any';

export interface TaskData {
  readonly title: string;
  readonly verify: string;
  readonly scope: string[];
  readonly entry: string[];
  readonly skills: string[];
  readonly testsModify: boolean;
  readonly verifyStarts: VerifyStarts;
  readonly acceptance: string[];
  readonly raw: string;
}

function readVerifyStarts(data: Record<string, unknown>): VerifyStarts {
  const value = data.verify_starts;
  return value === 'green' || value === 'any' ? value : 'red';
}

function readTestsModify(data: Record<string, unknown>): boolean {
  const nested = data.tests;
  if (nested !== null && typeof nested === 'object' && !Array.isArray(nested)) {
    const modify = (nested as Record<string, unknown>).modify;
    if (typeof modify === 'boolean') {
      return modify;
    }
  }

  return data['tests.modify'] === true;
}

export function parseTaskMd(content: string): TaskData {
  const { data, body } = parseFrontmatter(content);

  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const verify = typeof data.verify === 'string' ? data.verify.trim() : '';
  const testsModify = readTestsModify(data);
  const verifyStarts = readVerifyStarts(data);

  const scope = Array.isArray(data.scope) ? data.scope.map((s: unknown) => String(s).trim()) : [];
  const entry = Array.isArray(data.entry) ? data.entry.map((e: unknown) => String(e).trim()) : [];
  const skills = Array.isArray(data.skills)
    ? data.skills.map((s: unknown) => String(s).trim())
    : [];

  const acceptanceSection = extractSection(body, 'Acceptance') || body;
  const itemRegex = /^[*-]\s+\[[ xX]\]\s+(.+)$/gm;
  const matches = acceptanceSection.matchAll(itemRegex);
  const acceptance: string[] = [];

  for (const match of matches) {
    acceptance.push(match[1].trim());
  }

  return {
    title,
    verify,
    scope,
    entry,
    skills,
    testsModify,
    verifyStarts,
    acceptance,
    raw: content,
  };
}

export interface ChecklistItem {
  readonly number: number | null;
  readonly title: string;
  readonly checked: boolean;
  readonly section: string | null;
  readonly line: number;
}

const SECTION_HEADING_REGEX = /^##\s+(.+?)\s*$/;
const CHECKLIST_ITEM_REGEX = /^[-*]\s+\[([ xX])\]\s+(?:(\d+)[.)]\s+)?(.+?)\s*$/;

/**
 * Parses an OpenSpec `tasks.md` checklist. Supports flat numbered lists and
 * grouped lists where items live under `## <section>` headers. Item numbers
 * are optional; unnumbered items yield `number: null`.
 */
export function parseTaskList(content: string): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const lines = content.split(/\r?\n/);
  let section: string | null = null;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];

    const sectionMatch = line.match(SECTION_HEADING_REGEX);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }

    const itemMatch = line.match(CHECKLIST_ITEM_REGEX);
    if (itemMatch) {
      items.push({
        number: itemMatch[2] ? Number.parseInt(itemMatch[2], 10) : null,
        title: itemMatch[3].trim(),
        checked: itemMatch[1].toLowerCase() === 'x',
        section,
        line: index + 1,
      });
    }
  }

  return items;
}
