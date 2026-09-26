import fs from 'node:fs/promises';
import path from 'node:path';

/** The parsed sections of one executor result file; absent sections are null. */
export interface ResultSections {
  changed: string | null;
  deviated: string | null;
  missingContext: string | null;
  outsideScope: string | null;
  blocked: string | null;
  next: string | null;
  touched: string | null;
}

/** One task's real disclosures, present only when at least one exists. */
export interface TaskDisclosures {
  task: string;
  deviated: string | null;
  missingContext: string | null;
  outsideScope: string | null;
}

/** How many tasks of a change hold each real disclosure section. */
export interface DisclosureCounts {
  deviated: number;
  missingContext: number;
  outsideScope: number;
}

type SectionKey = keyof ResultSections;

/** Normalized heading text to result section key. */
const HEADING_KEYS: Readonly<Record<string, SectionKey>> = {
  changed: 'changed',
  deviated: 'deviated',
  'missing context': 'missingContext',
  'outside scope': 'outsideScope',
  blocked: 'blocked',
  next: 'next',
  touched: 'touched',
};

const RESULTS_DIR = path.join('.run', 'results');
const RESULT_FILE = /^(\d+)\.md$/;

/**
 * Drop leading `#`s, surrounding spaces, and one trailing colon, collapse inner
 * spaces, and ignore case, so `## deviated:` and `##  Outside Scope` match.
 */
function normalizeHeading(text: string): string {
  let value = text.replace(/\s+/g, ' ').trim();
  value = value.replace(/^#+/, '').trim();
  if (value.endsWith(':')) value = value.slice(0, -1);
  return value.trim().toLowerCase();
}

interface HeadingMatch {
  readonly key: SectionKey | null;
  readonly inline: string;
}

/** A heading line, an unknown `#` heading (`key: null`), or null for body text. */
function readHeading(raw: string): HeadingMatch | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('#') && !/^touched\b/i.test(trimmed)) return null;
  const withoutHashes = trimmed.replace(/^#+/, '').trim();
  const inlineTouched = /^touched\s*:\s*(.*)$/i.exec(withoutHashes);
  if (inlineTouched) return { key: 'touched', inline: (inlineTouched[1] ?? '').trim() };
  const key = HEADING_KEYS[normalizeHeading(withoutHashes)] ?? null;
  return { key, inline: '' };
}

/** Section text that is empty or only `None`, any case and optional period, is absent. */
function cleanSection(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0 || /^none\.?$/i.test(trimmed)) return null;
  return trimmed;
}

/** Split a result file into its named sections, tolerating heading drift. */
export function parseResultSections(content: string): ResultSections {
  const buffers = new Map<SectionKey, string[]>();
  let current: SectionKey | null = null;
  let inlineTouched: string | null = null;

  for (const line of content.split(/\r?\n/)) {
    const heading = readHeading(line);
    if (heading) {
      current = heading.key;
      if (current) {
        if (!buffers.has(current)) buffers.set(current, []);
        if (current === 'touched' && heading.inline.length > 0) inlineTouched = heading.inline;
      }
      continue;
    }
    if (current) buffers.get(current)?.push(line);
  }

  const section = (key: SectionKey): string | null => {
    if (key === 'touched' && inlineTouched !== null) return cleanSection(inlineTouched);
    return cleanSection((buffers.get(key) ?? []).join('\n'));
  };

  return {
    changed: section('changed'),
    deviated: section('deviated'),
    missingContext: section('missingContext'),
    outsideScope: section('outsideScope'),
    blocked: section('blocked'),
    next: section('next'),
    touched: section('touched'),
  };
}

function taskNumberOf(fileName: string): number | null {
  const match = RESULT_FILE.exec(fileName);
  return match ? Number(match[1]) : null;
}

/** Every task result file of a change that holds at least one real disclosure. */
export async function readChangeDisclosures(folderPath: string): Promise<TaskDisclosures[]> {
  const resultsDir = path.join(folderPath, RESULTS_DIR);
  const entries = await fs.readdir(resultsDir).catch(() => [] as string[]);
  const tasks = entries
    .map((name) => ({ name, number: taskNumberOf(name) }))
    .filter((entry): entry is { name: string; number: number } => entry.number !== null)
    .sort((a, b) => a.number - b.number);

  const disclosures: TaskDisclosures[] = [];
  for (const entry of tasks) {
    const content = await fs.readFile(path.join(resultsDir, entry.name), 'utf8').catch(() => null);
    if (content === null) continue;
    const sections = parseResultSections(content);
    if (
      sections.deviated === null &&
      sections.missingContext === null &&
      sections.outsideScope === null
    ) {
      continue;
    }
    disclosures.push({
      task: entry.name.replace(/\.md$/, ''),
      deviated: sections.deviated,
      missingContext: sections.missingContext,
      outsideScope: sections.outsideScope,
    });
  }
  return disclosures;
}

/** Counts of tasks of a change holding each real disclosure section. */
export async function countChangeDisclosures(folderPath: string): Promise<DisclosureCounts> {
  const counts: DisclosureCounts = { deviated: 0, missingContext: 0, outsideScope: 0 };
  for (const task of await readChangeDisclosures(folderPath)) {
    if (task.deviated !== null) counts.deviated += 1;
    if (task.missingContext !== null) counts.missingContext += 1;
    if (task.outsideScope !== null) counts.outsideScope += 1;
  }
  return counts;
}
