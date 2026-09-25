import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { type ResolvedScopeEntry, resolveScope } from '../run/scope.js';
import { type ParsedDelta, parseDelta } from './delta.js';
import { readLivingCapabilityNames, resemblingCapability } from './digest-capability.js';
import { type ApprovalFlagTask, buildApprovalFlags } from './digest-flags.js';
import { parseHumanSteps } from './human-steps.js';
import {
  type VerifyStarts,
  extractSection,
  parseFrontmatter,
  parseSpecMd,
  parseTaskMd,
  resolveChangeDoc,
} from './parser.js';

/** Approval flag ids, in the fixed order their flags are emitted. */
export type ApprovalFlagId =
  | 'shared_file'
  | 'sensitive_path'
  | 'verify_without_test'
  | 'removed_requirement'
  | 'unknown_capability'
  | 'verify_starts_conflict';

export interface ApprovalFlag {
  readonly id: ApprovalFlagId;
  readonly label: string;
  readonly excerpt: string;
}

export interface ApprovalDigestTask {
  readonly number: string;
  readonly title: string;
  readonly scopeFiles: number;
  readonly testsModify: boolean;
  readonly existingTests: readonly string[];
}

export interface ApprovalDigestCapability {
  readonly name: string;
  readonly added: readonly string[];
  readonly modified: readonly string[];
  readonly removed: readonly string[];
  readonly creates: boolean;
}

export interface ApprovalDigest {
  readonly change: string;
  readonly goal: string;
  readonly tasks: readonly ApprovalDigestTask[];
  readonly capabilities: readonly ApprovalDigestCapability[];
  readonly humanSteps: string;
  readonly beforeApproval: string;
  readonly flags: readonly ApprovalFlag[];
}

interface ResolvedTask {
  readonly number: string;
  readonly title: string;
  readonly verify: string;
  readonly verifyStarts: VerifyStarts;
  readonly scope: readonly string[];
  readonly testsModify: boolean;
  readonly entries: readonly ResolvedScopeEntry[];
}

interface ChangeCapability {
  readonly name: string;
  readonly delta: ParsedDelta;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareTaskNumbers(a: string, b: string): number {
  const numA = Number.parseInt(a, 10);
  const numB = Number.parseInt(b, 10);
  if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) return numA - numB;
  return compareText(a, b);
}

/** Collapse every whitespace run, including newlines, to one space. */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** The first two sentences of a goal, whitespace-collapsed. */
export function firstTwoSentences(goal: string): string {
  const collapsed = collapseWhitespace(goal);
  if (collapsed === '') return '';
  return collapsed
    .split(/(?<=[.!?])\s+/)
    .slice(0, 2)
    .join(' ');
}

function isTestPath(relativePath: string): boolean {
  return relativePath === 'tests' || relativePath.startsWith('tests/');
}

async function resolveTasks(projectRoot: string, changeFolder: string): Promise<ResolvedTask[]> {
  const tasksDir = path.join(changeFolder, 'tasks');
  const files = (await fs.readdir(tasksDir).catch(() => [] as string[]))
    .filter((entry) => entry.endsWith('.md'))
    .sort((a, b) => compareTaskNumbers(a.replace(/\.md$/, ''), b.replace(/\.md$/, '')));
  const tasks: ResolvedTask[] = [];
  for (const file of files) {
    const content = await fs.readFile(path.join(tasksDir, file), 'utf8');
    const task = parseTaskMd(content);
    const entries = task.scope.length > 0 ? await resolveScope(projectRoot, task.scope) : [];
    tasks.push({
      number: file.replace(/\.md$/, ''),
      title: task.title,
      verify: task.verify,
      verifyStarts: task.verifyStarts,
      scope: task.scope,
      testsModify: task.testsModify,
      entries,
    });
  }
  return tasks;
}

async function readCapabilities(changeFolder: string): Promise<ChangeCapability[]> {
  const specsDir = path.join(changeFolder, 'specs');
  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(specsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const names = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareText);
  const capabilities: ChangeCapability[] = [];
  for (const name of names) {
    const content = await fs
      .readFile(path.join(specsDir, name, 'spec.md'), 'utf8')
      .catch(() => null);
    if (content !== null) capabilities.push({ name, delta: parseDelta(content) });
  }
  return capabilities;
}

/** Summarize a change from its authored files into the approval digest. */
export async function buildApprovalDigest(
  projectRoot: string,
  changeFolder: string,
  config: OsqConfig,
): Promise<ApprovalDigest> {
  const resolvedDoc = await resolveChangeDoc(changeFolder);
  const content = resolvedDoc ? await fs.readFile(resolvedDoc.path, 'utf8') : '';
  const spec = parseSpecMd(content);
  const body = resolvedDoc ? parseFrontmatter(content).body : '';
  const humanSteps = parseHumanSteps(body);
  const tasks = await resolveTasks(projectRoot, changeFolder);
  const changeCapabilities = await readCapabilities(changeFolder);
  const living = await readLivingCapabilityNames(projectRoot, config.paths.openspecRoot);
  const capabilities: ApprovalDigestCapability[] = changeCapabilities.map(({ name, delta }) => ({
    name,
    added: delta.added.map((requirement) => requirement.name),
    modified: delta.modified.map((requirement) => requirement.name),
    removed: delta.removed.map((requirement) => requirement.name),
    creates:
      !living.includes(name) && delta.purpose !== '' && resemblingCapability(name, living) === null,
  }));
  const flagTasks: ApprovalFlagTask[] = tasks.map((task) => ({
    number: task.number,
    verify: task.verify,
    verifyStarts: task.verifyStarts,
    scope: task.scope,
    paths: task.entries.map((entry) => entry.relativePath),
  }));
  const flags = await buildApprovalFlags({
    projectRoot,
    openspecRoot: config.paths.openspecRoot,
    proposalVerify: spec.verify,
    tasks: flagTasks,
    capabilities,
    livingCapabilities: living,
  });
  return {
    change: path.basename(changeFolder),
    goal: firstTwoSentences(spec.goal),
    tasks: tasks.map((task) => {
      const existing = task.entries.filter((entry) => entry.absolutePath !== null);
      return {
        number: task.number,
        title: task.title,
        scopeFiles: existing.length,
        testsModify: task.testsModify,
        existingTests: existing
          .map((entry) => entry.relativePath)
          .filter(isTestPath)
          .sort(compareText),
      };
    }),
    capabilities,
    humanSteps: extractSection(body, 'Human steps'),
    beforeApproval: humanSteps.beforeApproval,
    flags,
  };
}

export { formatApprovalDigest } from './digest-format.js';

/** One `Flag: <label> — <excerpt>` line per flag. */
export function formatApprovalFlags(flags: readonly ApprovalFlag[]): string[] {
  return flags.map((flag) => `Flag: ${flag.label} \u2014 ${flag.excerpt}`);
}

/** `<n> flag(s): <label>, <label>`, or an empty string with no flags. */
export function summarizeApprovalFlags(flags: readonly ApprovalFlag[]): string {
  if (flags.length === 0) return '';
  const labels = flags.map((flag) => flag.label).join(', ');
  return `${flags.length} flag${flags.length === 1 ? '' : 's'}: ${labels}`;
}
