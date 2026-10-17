import fs from 'node:fs/promises';
import path from 'node:path';
import { type Adr, readDecisions } from '../core/foundation/decisions.js';
import { resolveScope } from '../core/run/scope.js';
import { appendHarnessEvent } from '../harness/types.js';
import { languageAdapter } from '../kernel/languages/adapter.js';
import { LANGUAGE_PRESETS } from '../kernel/languages/presets.js';
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

/** The names a manifest declares now, or the error the reader stopped on. */
type ManifestNames =
  | { readonly ok: true; readonly names: readonly string[] }
  | { readonly ok: false; readonly error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The sorted distinct package names a manifest declares across its four sections. */
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

/**
 * The reader for the manifest `fileName`, or null when no language claims it.
 * `package.json` keeps osq's own reader; every other manifest goes through its
 * language adapter, found by file name through the presets (ADR 017).
 */
function manifestReader(fileName: string): ((content: string) => ManifestNames) | null {
  if (fileName === MANIFEST_FILE_NAME) {
    return (content) => ({ ok: true, names: readManifestPackageNames(content) });
  }
  for (const preset of LANGUAGE_PRESETS) {
    if (!preset.manifests.includes(fileName)) continue;
    const read = languageAdapter(preset.name).manifestDependencies;
    if (read === null) continue;
    return (content) => {
      const result = read(content);
      return result.ok ? { ok: true, names: result.names } : result;
    };
  }
  return null;
}

/**
 * Map each scoped dependency manifest to its sorted names: `package.json` as
 * before, and each file whose name is a manifest of a preset whose adapter
 * reads one. A missing or unreadable manifest maps to an empty list, and no
 * unscoped file is ever read.
 *
 * @scenario watcher-and-harness: Scoped manifest
 * @scenario watcher-and-harness: Manifest outside scope
 * @scenario watcher-and-harness: Scoped Cargo manifest
 * @adr 017
 */
export async function readScopedDependencies(
  projectRoot: string,
  scope: readonly string[],
): Promise<Record<string, string[]>> {
  const dependencies: Record<string, string[]> = {};
  for (const entry of await resolveScope(projectRoot, scope)) {
    const read = manifestReader(path.posix.basename(entry.relativePath));
    if (read === null) continue;
    const content = entry.absolutePath
      ? await fs.readFile(entry.absolutePath, 'utf8').catch(() => null)
      : null;
    const result = content === null ? null : read(content);
    dependencies[entry.relativePath] = result?.ok ? [...result.names] : [];
  }
  return dependencies;
}

/** The names a baseline manifest declares now, or null when the file is missing. */
async function readCurrentNames(projectRoot: string, file: string): Promise<ManifestNames | null> {
  const read = manifestReader(path.posix.basename(file));
  const content = await fs.readFile(path.join(projectRoot, file), 'utf8').catch(() => null);
  return read === null || content === null ? null : read(content);
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

/** The shared `denied_dependency` dead marker around one body heading. */
function dependencyMarker(heading: string, lines: readonly string[]): string {
  return ['---', 'reason: denied_dependency', '---', heading, ...lines, ''].join('\n');
}

/** Dead marker body for a task that added packages an accepted ADR denies. */
export function formatDeniedDependencyMarker(lines: readonly string[]): string {
  return dependencyMarker('The task added packages an accepted ADR denies:', lines);
}

/**
 * Dead marker body for a task whose scoped manifests could not be read.
 *
 * @scenario watcher-and-harness: Unreadable Cargo manifest
 * @adr 017
 */
export function formatUnreadableDependencyMarker(lines: readonly string[]): string {
  return dependencyMarker('osq cannot read the dependency tables of these manifests:', lines);
}

/**
 * After the agent exits, compare each baseline manifest with its current names,
 * append one `dependencies_added` event for the new pairs, and fail the task
 * when an accepted ADR denies an added package. When no added name is denied but
 * a baseline manifest cannot be read while some accepted ADR denies a name, the
 * task fails with the unreadable manifests. Without a baseline the check does
 * not run; a name moved between sections is not new.
 *
 * @scenario watcher-and-harness: Allowed addition
 * @scenario watcher-and-harness: Allowed crate addition
 * @scenario watcher-and-harness: Vue denied
 * @scenario watcher-and-harness: Superseded denial
 * @scenario watcher-and-harness: Crate denied
 * @scenario watcher-and-harness: Renamed crate denied
 * @scenario watcher-and-harness: Unreadable Cargo manifest
 * @scenario watcher-and-harness: Unreadable manifest without denials
 * @adr 017
 */
export async function checkDependencies(
  options: TaskVerifyOptions,
  fail: FailFn,
): Promise<RunTaskResult | null> {
  const { projectRoot, specFolderPath, taskNumber, config } = options;
  const baseline = await latestDependencyBaseline(specFolderPath, taskNumber);
  if (baseline === null) return null;

  const added: AddedDependency[] = [];
  const unreadable: { file: string; error: string }[] = [];
  for (const file of Object.keys(baseline).sort()) {
    const previous = new Set(baseline[file] ?? []);
    const result = await readCurrentNames(projectRoot, file);
    if (result === null) continue;
    if (!result.ok) {
      unreadable.push({ file, error: result.error });
      continue;
    }
    for (const name of result.names) {
      if (!previous.has(name)) added.push({ file, name });
    }
  }
  added.sort(compareAdded);
  if (added.length === 0 && unreadable.length === 0) return null;

  if (added.length > 0) {
    await appendHarnessEvent(specFolderPath, taskNumber, {
      type: 'dependencies_added',
      timestamp: new Date().toISOString(),
      data: { added },
    });
  }

  const records = await readDecisions(projectRoot, config);
  const lines: string[] = [];
  for (const pair of added) {
    for (const adr of denyingAdrs(records.adrs, pair.name)) {
      lines.push(`- ${pair.name} in ${pair.file}: ADR ${adr.number}: ${adr.rule}`);
    }
  }
  if (lines.length > 0) {
    const names = added.map((pair) => pair.name).join(', ');
    const error = `Added packages an accepted ADR denies: ${names}`;
    return fail('denied_dependency', formatDeniedDependencyMarker(lines), error);
  }

  const deniesAnyName = records.adrs.some(
    (adr) => adr.status === 'accepted' && adr.denies.length > 0,
  );
  if (unreadable.length > 0 && deniesAnyName) {
    const files = unreadable.map((entry) => entry.file).join(', ');
    const marker = unreadable.map((entry) => `- ${entry.file}: ${entry.error}`);
    return fail(
      'denied_dependency',
      formatUnreadableDependencyMarker(marker),
      `Cannot read dependency tables: ${files}`,
    );
  }
  return null;
}
