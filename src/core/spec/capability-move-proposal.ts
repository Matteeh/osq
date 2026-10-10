/**
 * The proposal edits a generated capability move makes.
 *
 * Frontmatter is edited through the `yaml` document API so every other key and
 * its formatting survive: `generated` records the move, and one `{ name, group }`
 * entry lands in `creates` for each new target. The `## Generated` section is
 * replaced in place and always ends the proposal.
 */

import YAML from 'yaml';
import { parseFrontmatter } from './parser.js';

/** One `{ name, group }` entry the generator writes into `creates`. */
export interface GeneratedCreates {
  readonly name: string;
  readonly group: string;
}

/** Everything the `## Generated` section and frontmatter need. */
export interface GeneratedProposalEdit {
  readonly kind: 'rename' | 'split';
  readonly from: string;
  readonly to: readonly string[];
  readonly creates: readonly GeneratedCreates[];
  readonly written: readonly string[];
  readonly naming: readonly string[];
}

const GENERATED_HEADING = /^##\s+Generated\s*$/;

/** The name of an existing `creates` entry, scalar or `{ name }` mapping. */
function createsEntryName(item: unknown): string | null {
  if (YAML.isScalar(item)) {
    return typeof item.value === 'string' ? item.value.trim() : null;
  }
  if (YAML.isMap(item)) {
    const name = item.get('name');
    return typeof name === 'string' ? name.trim() : null;
  }
  return null;
}

/** Merge the new target entries into `creates`, replacing matching names. */
function applyCreates(doc: YAML.Document, creates: readonly GeneratedCreates[]): void {
  const existing = doc.get('creates');
  const wanted = new Map(creates.map((entry) => [entry.name, entry.group]));
  const used = new Set<string>();
  const seq = new YAML.YAMLSeq();
  if (YAML.isSeq(existing)) {
    for (const item of existing.items) {
      const name = createsEntryName(item);
      if (name !== null && wanted.has(name)) {
        seq.add(doc.createNode({ name, group: wanted.get(name) }));
        used.add(name);
      } else {
        seq.add(item);
      }
    }
  }
  for (const entry of creates) {
    if (!used.has(entry.name)) {
      seq.add(doc.createNode({ name: entry.name, group: entry.group }));
    }
  }
  doc.set('creates', seq);
}

function bulletList(paths: readonly string[]): string {
  return paths.length > 0 ? paths.map((p) => `- \`${p}\``).join('\n') : 'None';
}

/** The full `## Generated` section, ending without a trailing newline. */
function generatedSection(edit: GeneratedProposalEdit): string {
  return [
    '## Generated',
    '',
    `\`osq capability ${edit.kind}\` wrote these files; run it again instead of editing them:`,
    '',
    bulletList(edit.written),
    '',
    `Files outside the specs that name ${edit.from}, for this change's tasks:`,
    '',
    bulletList(edit.naming),
  ].join('\n');
}

/** Replace any earlier `## Generated` section and append the new one last. */
function withGeneratedSection(body: string, section: string): string {
  const lines = body.split('\n');
  const start = lines.findIndex((line) => GENERATED_HEADING.test(line));
  let kept = lines;
  if (start !== -1) {
    let end = lines.length;
    for (let index = start + 1; index < lines.length; index++) {
      if (/^##\s+/.test(lines[index])) {
        end = index;
        break;
      }
    }
    kept = [...lines.slice(0, start), ...lines.slice(end)];
  }
  const text = kept.join('\n').replace(/\s+$/, '');
  return text === '' ? `${section}\n` : `${text}\n\n${section}\n`;
}

/**
 * Read the capability names an earlier `generated` field names, from `from`
 * first then each `to`.
 *
 * @scenario spec-lint-and-approve: Running it again
 * @adr 016
 */
export function readGeneratedNames(content: string): string[] {
  const { data } = parseFrontmatter(content);
  const value = data.generated;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  const record = value as Record<string, unknown>;
  const names: string[] = [];
  if (typeof record.from === 'string') names.push(record.from);
  if (Array.isArray(record.to)) {
    for (const target of record.to) {
      if (typeof target === 'string') names.push(target);
    }
  }
  return names;
}

/**
 * Edit a proposal: set `generated`, merge `creates`, and end with the
 * `## Generated` section.
 *
 * @scenario spec-lint-and-approve: Frontmatter and section
 * @adr 016
 */
export function editGeneratedProposal(content: string, edit: GeneratedProposalEdit): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (!match) {
    throw new Error('proposal.md has no frontmatter');
  }
  const doc = YAML.parseDocument(match[1]);
  doc.set('generated', { kind: edit.kind, from: edit.from, to: [...edit.to] });
  applyCreates(doc, edit.creates);
  const frontmatter = doc.toString({ flowCollectionPadding: false });
  const body = withGeneratedSection(match[2], generatedSection(edit));
  return `---\n${frontmatter}---\n${body}`;
}
