import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveScope } from '../run/scope.js';
import { type ParsedDelta, parseDelta } from './delta.js';
import { type VerifyStarts, extractSection, parseFrontmatter, parseTaskMd } from './parser.js';

/** One task's resolved paths and declared start, as the notice rules need it. */
export interface TaskFacts {
  readonly number: string;
  readonly verifyStarts: VerifyStarts;
  readonly paths: readonly string[];
  /** Scenario bullets as `<capability>\u0000<name>`. */
  readonly scenarios: readonly string[];
}

/** One change capability with its parsed delta. */
export interface ChangeDelta {
  readonly name: string;
  readonly delta: ParsedDelta;
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareTaskNumbers(a: string, b: string): number {
  const numA = Number.parseInt(a, 10);
  const numB = Number.parseInt(b, 10);
  if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) return numA - numB;
  return compareCodeUnits(a, b);
}

/** A task's `## Scenarios` bullets as `<capability>\u0000<name>` pairs. */
function scenarioPairs(section: string): string[] {
  const pairs: string[] = [];
  for (const line of section.split('\n')) {
    const match = /^\s*[-*]\s+([^:]+):\s*(.+)$/.exec(line);
    if (!match) continue;
    pairs.push(`${match[1].trim()}\u0000${match[2].trim()}`);
  }
  return pairs;
}

/** Every task file's resolved paths, declared start, and scenario bullets. */
export async function readTaskFacts(projectRoot: string, folderPath: string): Promise<TaskFacts[]> {
  const tasksDir = path.join(folderPath, 'tasks');
  const files = (await fs.readdir(tasksDir).catch(() => [] as string[]))
    .filter((entry) => entry.endsWith('.md'))
    .sort(compareTaskNumbers);
  const facts: TaskFacts[] = [];
  for (const file of files) {
    const content = await fs.readFile(path.join(tasksDir, file), 'utf8');
    const task = parseTaskMd(content);
    const entries = task.scope.length > 0 ? await resolveScope(projectRoot, task.scope) : [];
    facts.push({
      number: file.replace(/\.md$/, ''),
      verifyStarts: task.verifyStarts,
      paths: entries.map((entry) => entry.relativePath),
      scenarios: scenarioPairs(extractSection(parseFrontmatter(content).body, 'Scenarios')),
    });
  }
  return facts;
}

/** The change document body, from `proposal.md` or the legacy `spec.md`. */
export async function readProposalBody(folderPath: string): Promise<string> {
  const proposal = await fs
    .readFile(path.join(folderPath, 'proposal.md'), 'utf8')
    .catch(() => null);
  if (proposal !== null) return parseFrontmatter(proposal).body;
  const spec = await fs.readFile(path.join(folderPath, 'spec.md'), 'utf8').catch(() => null);
  return spec === null ? '' : parseFrontmatter(spec).body;
}

/** Every change capability delta, in capability name order. */
export async function readChangeDeltas(folderPath: string): Promise<ChangeDelta[]> {
  const specsDir = path.join(folderPath, 'specs');
  const entries = await fs.readdir(specsDir, { withFileTypes: true }).catch(() => []);
  const names = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareCodeUnits);
  const result: ChangeDelta[] = [];
  for (const name of names) {
    const content = await fs
      .readFile(path.join(specsDir, name, 'spec.md'), 'utf8')
      .catch(() => null);
    if (content !== null) result.push({ name, delta: parseDelta(content) });
  }
  return result;
}
