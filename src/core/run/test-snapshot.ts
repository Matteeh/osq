import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { LineRange } from '../../kernel/languages/adapter.js';
import { languageAdapter } from '../../kernel/languages/adapter.js';
import type { LanguageMap } from '../../kernel/languages/language-map.js';
import { readLanguageMap } from '../../kernel/languages/language-map.js';
import type { OsqConfig } from '../foundation/config.js';
import { resolveScope } from './scope.js';
import { TEST_GATE_DIR, gatedTestPathFilter } from './test-gate.js';

/** One source file's test-module lines as they stood before a task ran. */
export type TestModuleLines = readonly string[];

/** The pre-spawn gate state `captureTestGate` builds and `runTask` consults. */
export interface TestGateSnapshot {
  readonly snapshot: Map<string, string>;
  readonly testsModify: boolean;
  readonly authorized: Set<string>;
  readonly moduleSnapshot: Map<string, TestModuleLines>;
  readonly map: LanguageMap;
}

/** The task fields the gate reads. */
export interface TestGateTask {
  readonly scope: readonly string[];
  readonly testsModify: boolean;
}

/** The optional fields `findUndeclaredTestChanges` needs for source modules. */
export interface TestGateOptions {
  readonly testsModify: boolean;
  readonly authorized: ReadonlySet<string>;
  readonly moduleSnapshot?: ReadonlyMap<string, TestModuleLines>;
  readonly map?: LanguageMap;
}

/** A test file's state, a source file's module state, or null when unchanged. */
type ChangeState = 'modified' | 'deleted' | 'test module modified';

function hashFileContent(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Split source into lines, turning `\r\n` into `\n` first. */
function normalizeLines(source: string): string[] {
  return source.replace(/\r\n/g, '\n').split('\n');
}

/** The lines inside `ranges`, in file order, 1-based and inclusive. */
function linesInRanges(source: string, ranges: readonly LineRange[]): string[] {
  const lines = normalizeLines(source);
  const output: string[] = [];
  for (const range of ranges) {
    for (let line = range.start; line <= range.end; line += 1) {
      output.push(lines[line - 1] ?? '');
    }
  }
  return output;
}

/** Whether `before` still appears in `after`, in order, as a subsequence. */
function isSubsequence(before: readonly string[], after: readonly string[]): boolean {
  let index = 0;
  for (const line of after) {
    if (index < before.length && before[index] === line) index += 1;
  }
  return index === before.length;
}

/**
 * Snapshot the preexisting files under the root `tests/` folder and under
 * every given test folder, as project-relative path -> content hash.
 *
 * @scenario watcher-and-harness: Rust tests in a Cargo workspace
 * @adr 017
 */
export async function snapshotTestFiles(
  projectRoot: string,
  testFolders: readonly string[] = [],
): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();
  const walk = async (dir: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const relative = path.relative(projectRoot, full).split(path.sep).join('/');
        snapshot.set(relative, hashFileContent(await fs.readFile(full)));
      }
    }
  };

  for (const root of new Set([TEST_GATE_DIR, ...testFolders])) {
    await walk(path.join(projectRoot, root));
  }
  return snapshot;
}

/** The test-module lines of every map path outside the test-file snapshot. */
async function snapshotTestModules(
  projectRoot: string,
  map: LanguageMap,
  snapshot: ReadonlyMap<string, string>,
): Promise<Map<string, TestModuleLines>> {
  const modules = new Map<string, TestModuleLines>();
  const isGated = gatedTestPathFilter(map);
  for (const relative of map.paths) {
    if (snapshot.has(relative) || isGated(relative)) continue;
    const rangesOf = languageAdapter(map.languageOf(relative) ?? '').testModuleRanges;
    if (rangesOf === null) continue;
    let source: string;
    try {
      source = await fs.readFile(path.join(projectRoot, relative), 'utf8');
    } catch {
      continue;
    }
    const ranges = rangesOf(source);
    if (ranges.length === 0) continue;
    modules.set(relative, linesInRanges(source, ranges));
  }
  return modules;
}

/**
 * Pre-spawn test gate: the language map read once, the test-folder snapshot,
 * the test-module snapshot, and the resolved scope authorization.
 *
 * @scenario watcher-and-harness: Rust tests in a Cargo workspace
 * @adr 017
 */
export async function captureTestGate(
  projectRoot: string,
  task: TestGateTask,
  config: OsqConfig,
): Promise<TestGateSnapshot> {
  const map = await readLanguageMap(projectRoot, config);
  const snapshot = await snapshotTestFiles(projectRoot, map.testFolders);
  const authorized = new Set<string>();
  for (const entry of await resolveScope(projectRoot, task.scope)) {
    if (entry.absolutePath !== null) authorized.add(entry.relativePath);
  }
  const moduleSnapshot = await snapshotTestModules(projectRoot, map, snapshot);
  return { snapshot, testsModify: task.testsModify, authorized, moduleSnapshot, map };
}

/** The state of one snapshotted test file, or null when its content is unchanged. */
async function testFileState(
  projectRoot: string,
  relative: string,
  expectedHash: string,
): Promise<ChangeState | null> {
  try {
    const hash = hashFileContent(await fs.readFile(path.join(projectRoot, relative)));
    return hash !== expectedHash ? 'modified' : null;
  } catch {
    return 'deleted';
  }
}

/** The state of one source file's test modules, or null when they are unchanged. */
async function testModuleState(
  projectRoot: string,
  map: LanguageMap,
  relative: string,
  before: TestModuleLines,
): Promise<ChangeState | null> {
  let source: string;
  try {
    source = await fs.readFile(path.join(projectRoot, relative), 'utf8');
  } catch {
    return 'deleted';
  }
  const rangesOf = languageAdapter(map.languageOf(relative) ?? '').testModuleRanges;
  const after = rangesOf === null ? [] : linesInRanges(source, rangesOf(source));
  return isSubsequence(before, after) ? null : 'test module modified';
}

/** The diagnostic for one unauthorized change, with the literal scope entry. */
function formatDiagnostic(relative: string, state: ChangeState, withScope: boolean): string {
  return withScope
    ? `${relative} (${state}); authorizing scope: ${relative}`
    : `${relative} (${state})`;
}

/**
 * Diagnostics for preexisting test files and source test modules changed or
 * deleted since `snapshot`. The two-argument form reports test files alone.
 *
 * @scenario watcher-and-harness: Rust tests in a Cargo workspace
 * @adr 017
 */
export async function findUndeclaredTestChanges(
  projectRoot: string,
  snapshot: ReadonlyMap<string, string>,
  options?: TestGateOptions,
): Promise<string[]> {
  const changes: string[] = [];
  const authorized = (relative: string): boolean =>
    options?.testsModify === true && options.authorized.has(relative);
  const withScope = options !== undefined;

  for (const [relative, expectedHash] of snapshot) {
    const state = await testFileState(projectRoot, relative, expectedHash);
    if (state === null || authorized(relative)) continue;
    changes.push(formatDiagnostic(relative, state, withScope));
  }

  if (options?.moduleSnapshot && options.map) {
    const map = options.map;
    for (const [relative, before] of options.moduleSnapshot) {
      const state = await testModuleState(projectRoot, map, relative, before);
      if (state === null || authorized(relative)) continue;
      changes.push(formatDiagnostic(relative, state, true));
    }
  }

  return changes.sort();
}
