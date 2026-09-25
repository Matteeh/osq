import fs from 'node:fs/promises';
import path from 'node:path';
import { type Adr, readDecisions } from '../core/foundation/decisions.js';
import { resolveScope } from '../core/run/scope.js';
import { appendHarnessEvent } from '../harness/types.js';
import type { RunTaskResult } from './outcome.js';
import type { FailFn, TaskVerifyOptions } from './task-verify.js';

/** The four manifest sections whose package names count as dependencies. */
const PACKAGE_SECTIONS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

/** One added package and the manifest it was added to. */
export interface AddedDependency {
  readonly file: string;
  readonly name: string;
}

const MANIFEST_FILE_NAME = 'package.json';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The sorted distinct package names a manifest declares across its four
 * dependency sections. Malformed JSON and non-object sections contribute nothing.
 */
export function readManifestPackageNames(content: string): string[] {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return [];
  }
  if (!isRecord(data)) return [];
  const names = new Set<string>();
  for (const section of PACKAGE_SECTIONS) {
    const record = data[section];
    if (!isRecord(record)) continue;
    for (const name of Object.keys(record)) names.add(name);
  }
  return [...names].sort();
}

async function readNamesAt(projectRoot: string, relativeFile: string): Promise<string[]> {
  const content = await fs.readFile(path.join(projectRoot, relativeFile), 'utf8').catch(() => null);
  return content === null ? [] : readManifestPackageNames(content);
}

/**
 * Resolve `scope` and map each scoped `package.json` path to its sorted package
 * names. A missing or unreadable manifest maps to an empty list. Without a
 * scoped manifest the result is empty, and no unscoped file is ever read.
 */
export async function readScopedDependencies(
  projectRoot: string,
  scope: readonly string[],
): Promise<Record<string, string[]>> {
  const dependencies: Record<string, string[]> = {};
  for (const entry of await resolveScope(projectRoot, scope)) {
    if (path.posix.basename(entry.relativePath) !== MANIFEST_FILE_NAME) continue;
    dependencies[entry.relativePath] = entry.absolutePath
      ? readManifestPackageNames(await fs.readFile(entry.absolutePath, 'utf8').catch(() => ''))
      : [];
  }
  return dependencies;
}

/** The `dependencies` of the latest `measures` start event, or null without one. */
async function latestDependencyBaseline(
  specFolderPath: string,
  taskNumber: string,
): Promise<Record<string, string[]> | null> {
  const raw = await fs
    .readFile(path.join(specFolderPath, '.run', 'events', `${taskNumber}.jsonl`), 'utf8')
    .catch(() => '');
  let baseline: Record<string, string[]> | null = null;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const data = event.data;
    if (event.type !== 'measures' || !isRecord(data) || data.phase !== 'start') continue;
    if (!isRecord(data.dependencies)) continue;
    const record: Record<string, string[]> = {};
    for (const [file, names] of Object.entries(data.dependencies)) {
      if (Array.isArray(names))
        record[file] = names.filter((n): n is string => typeof n === 'string');
    }
    baseline = record;
  }
  return baseline;
}

function compareAdded(a: AddedDependency, b: AddedDependency): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  if (a.name === b.name) return 0;
  return a.name < b.name ? -1 : 1;
}

/** Accepted ADRs that deny one added package, in number order. */
function denyingAdrs(adrs: readonly Adr[], name: string): Adr[] {
  return adrs.filter((adr) => adr.status === 'accepted' && adr.denies.includes(name));
}

/** Dead marker body for a task that added packages an accepted ADR denies. */
export function formatDeniedDependencyMarker(lines: readonly string[]): string {
  return [
    '---',
    'reason: denied_dependency',
    '---',
    'The task added packages an accepted ADR denies:',
    ...lines,
    '',
  ].join('\n');
}

/**
 * After the agent exits, compare each baseline manifest with its current names,
 * append one `dependencies_added` event for the new pairs, and fail the task
 * when an accepted ADR denies an added package. Without a baseline the check
 * does not run; a name moved between sections is not new.
 */
export async function checkDependencies(
  options: TaskVerifyOptions,
  fail: FailFn,
): Promise<RunTaskResult | null> {
  const { projectRoot, specFolderPath, taskNumber, config } = options;
  const baseline = await latestDependencyBaseline(specFolderPath, taskNumber);
  if (baseline === null) return null;

  const added: AddedDependency[] = [];
  for (const file of Object.keys(baseline).sort()) {
    const previous = new Set(baseline[file] ?? []);
    for (const name of await readNamesAt(projectRoot, file)) {
      if (!previous.has(name)) added.push({ file, name });
    }
  }
  if (added.length === 0) return null;
  added.sort(compareAdded);

  await appendHarnessEvent(specFolderPath, taskNumber, {
    type: 'dependencies_added',
    timestamp: new Date().toISOString(),
    data: { added },
  });

  const records = await readDecisions(projectRoot, config);
  const lines: string[] = [];
  for (const pair of added) {
    for (const adr of denyingAdrs(records.adrs, pair.name)) {
      lines.push(`- ${pair.name} in ${pair.file}: ADR ${adr.number}: ${adr.rule}`);
    }
  }
  if (lines.length === 0) return null;

  const error = `Added packages an accepted ADR denies: ${added.map((pair) => pair.name).join(', ')}`;
  return fail('denied_dependency', formatDeniedDependencyMarker(lines), error);
}
