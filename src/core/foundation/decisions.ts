import crypto from 'node:crypto';
import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseFrontmatter } from '../spec/parser.js';
import type { OsqConfig } from './config.js';

/** One architecture decision record read from the decisions folder. */
export interface Adr {
  readonly number: string; // leading digits of the file name, as written: '007'
  readonly title: string; // first `# ` heading without its leading `<number>.`
  readonly path: string; // repository-relative, forward slashes
  readonly hash: string; // `sha256:<hex>` of the UTF-8 file content
  readonly status: string; // raw frontmatter value; validation rejects others
  readonly appliesTo: 'all' | readonly string[] | null; // null when missing or invalid
  readonly rule: string; // trimmed; '' when missing
  readonly supersededBy: string | null;
}

/** The parsed decisions folder: ADRs in number order plus ignored files. */
export interface DecisionRecords {
  readonly adrs: readonly Adr[]; // number order
  readonly ignored: readonly string[]; // repository-relative paths, sorted
}

/** Validation errors and warnings for a project's ADRs. */
export interface DecisionProblems {
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

const VALID_STATUSES = new Set(['proposed', 'accepted', 'superseded']);

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

/** `sha256:<hex>` digest of a UTF-8 string, like the manifest's file hasher. */
function hashContent(content: string): string {
  const digest = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  return `sha256:${digest}`;
}

/** Leading digits of a file name, or null when it has none. */
function adrNumber(fileName: string): string | null {
  const match = /^(\d+)/.exec(fileName);
  return match ? match[1] : null;
}

/** First `# ` heading with its leading `<number>.` removed. */
function readTitle(body: string): string {
  const match = /^#\s+(.+?)\s*$/m.exec(body);
  if (!match) return '';
  return match[1]
    .trim()
    .replace(/^\d+\.\s*/, '')
    .trim();
}

function readAppliesTo(value: unknown): 'all' | readonly string[] | null {
  if (value === 'all') return 'all';
  if (!Array.isArray(value) || value.length === 0) return null;
  const names: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim() === '') return null;
    names.push(entry.trim());
  }
  return names;
}

function readRule(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readSupersededBy(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function readStatus(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  return value === null || value === undefined ? '' : String(value);
}

function compareAdr(a: Adr, b: Adr): number {
  const na = Number.parseInt(a.number, 10);
  const nb = Number.parseInt(b.number, 10);
  if (na !== nb) return na - nb;
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

/** Builds an ADR from file content, or null when it carries no `status` key. */
function toAdr(content: string, relativePath: string, number: string): Adr | null {
  const { data, body } = parseFrontmatter(content);
  if (!Object.prototype.hasOwnProperty.call(data, 'status')) return null;
  return {
    number,
    title: readTitle(body),
    path: relativePath,
    hash: hashContent(content),
    status: readStatus(data.status),
    appliesTo: readAppliesTo(data.applies_to),
    rule: readRule(data.rule),
    supersededBy: readSupersededBy(data.superseded_by),
  };
}

/**
 * Reads the markdown files directly under `paths.decisions`. A file whose YAML
 * frontmatter has a `status` key is an ADR; `README.md`, non-markdown files, and
 * files without a numeric file-name prefix are ignored. A missing folder reads
 * as no ADRs.
 */
export async function readDecisions(
  projectRoot: string,
  config: OsqConfig,
): Promise<DecisionRecords> {
  const decisionsDir = path.join(projectRoot, config.paths.decisions);
  let entries: Dirent[];
  try {
    entries = await fs.readdir(decisionsDir, { withFileTypes: true });
  } catch {
    return { adrs: [], ignored: [] };
  }

  const adrs: Adr[] = [];
  const ignored: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name === 'README.md') continue;
    const filePath = path.join(decisionsDir, entry.name);
    const relativePath = toPosix(path.relative(projectRoot, filePath));
    const content = await fs.readFile(filePath, 'utf8').catch(() => null);
    const number = adrNumber(entry.name);
    const adr = content === null || number === null ? null : toAdr(content, relativePath, number);
    if (adr) adrs.push(adr);
    else ignored.push(relativePath);
  }

  adrs.sort(compareAdr);
  ignored.sort();
  return { adrs, ignored };
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
 * Validates the parsed ADRs: status vocabulary, an accepted ADR's applies_to and
 * rule, a superseded ADR's replacement, plus warnings for ignored files and for
 * capability names without a living spec.
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

/** True when two ADR numbers name the same ADR by numeric value: `7` is `007`. */
export function sameAdrNumber(a: string, b: string): boolean {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  if (Number.isNaN(na) || Number.isNaN(nb)) return a === b;
  return na === nb;
}

/** Accepted ADRs applying to `all`, in number order. */
export function systemWideAdrs(records: DecisionRecords): Adr[] {
  return records.adrs.filter((adr) => adr.status === 'accepted' && adr.appliesTo === 'all');
}

/** Accepted ADRs applying to `all` or to any of `capabilities`, in number order. */
export function governingAdrs(records: DecisionRecords, capabilities: readonly string[]): Adr[] {
  const wanted = new Set(capabilities);
  return records.adrs.filter(
    (adr) =>
      adr.status === 'accepted' &&
      (adr.appliesTo === 'all' || adr.appliesTo?.some((name) => wanted.has(name))),
  );
}
