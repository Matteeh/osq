import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseFrontmatter, parseTaskMd } from '../core/parser.js';
import { type HarnessEvent, appendHarnessEvent } from '../harness/types.js';
import { resolveBuildInfo } from './build.js';
import type { DoneMarkerMetadata, RunTaskResult } from './outcome.js';

/** Per-file content hashes plus a single combined digest for a task scope. */
export interface ScopeHashResult {
  hash: string;
  fileHashes: Record<string, string | null>;
}

/** Outcome of comparing a previously completed task's scope to the tree. */
export interface ScopeRegressionResult {
  regressed: true;
  taskNumber: string;
  differingPaths: string[];
  recordedHash: string;
  currentHash: string;
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function relativePosix(projectRoot: string, filePath: string): string {
  return path.relative(projectRoot, filePath).split(path.sep).join('/');
}

/**
 * Content-address a task scope. Every scoped file's UTF-8 SHA-256 (or `null`
 * when missing) is keyed by project-relative POSIX path, then folded into one
 * deterministic digest over the sorted `path:hash` entries.
 */
export async function computeTaskScopeHash(
  projectRoot: string,
  scope: string[],
): Promise<ScopeHashResult> {
  const fileHashes: Record<string, string | null> = {};
  const keys = scope
    .map((entry) => relativePosix(projectRoot, path.resolve(projectRoot, entry)))
    .sort();
  for (const key of keys) {
    const content = await fs.readFile(path.resolve(projectRoot, key), 'utf8').catch(() => null);
    fileHashes[key] = content === null ? null : `sha256:${sha256(content)}`;
  }
  const canonical = Object.keys(fileHashes)
    .map((key) => `${key}:${fileHashes[key] ?? ''}`)
    .join('\n');
  return { hash: `sha256:${sha256(canonical)}`, fileHashes };
}

/** Read the recorded per-file hash map out of a done marker's frontmatter. */
function readRecordedFiles(value: unknown): Record<string, string | null> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const map: Record<string, string | null> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    map[key] = typeof entry === 'string' ? entry : null;
  }
  return map;
}

/** Classify each scoped path whose recorded hash no longer matches the tree. */
function findDifferingPaths(
  recorded: Record<string, string | null>,
  current: Record<string, string | null>,
): string[] {
  const paths = new Set([...Object.keys(recorded), ...Object.keys(current)]);
  const differing: string[] = [];
  for (const key of [...paths].sort()) {
    const before = recorded[key] ?? null;
    const after = current[key] ?? null;
    if (before === after) continue;
    if (before === null) differing.push(`${key} (added)`);
    else if (after === null) differing.push(`${key} (deleted)`);
    else differing.push(`${key} (modified)`);
  }
  return differing;
}

/**
 * Compare every earlier completed task's recorded scope hash against the
 * current tree. Returns the first regression found, or `null` when all match.
 */
export async function checkDoneTasksScopeHashes(
  projectRoot: string,
  specFolderPath: string,
  currentTaskNumber: string,
): Promise<ScopeRegressionResult | null> {
  const currentTask = Number.parseInt(currentTaskNumber, 10);
  if (Number.isNaN(currentTask)) {
    return null;
  }
  const runDir = path.join(specFolderPath, '.run');

  for (let number = 1; number < currentTask; number++) {
    const taskNumber = String(number);
    const marker = await fs
      .readFile(path.join(runDir, 'done', taskNumber), 'utf8')
      .catch(() => null);
    if (marker === null) continue;

    const { data } = parseFrontmatter(marker);
    const recordedHash = typeof data.scope_hash === 'string' ? data.scope_hash : null;
    if (!recordedHash) continue;

    const taskContent = await fs
      .readFile(path.join(specFolderPath, 'tasks', `${taskNumber}.md`), 'utf8')
      .catch(() => null);
    if (taskContent === null) continue;

    const taskData = parseTaskMd(taskContent);
    const current = await computeTaskScopeHash(projectRoot, taskData.scope);
    if (current.hash === recordedHash) continue;

    return {
      regressed: true,
      taskNumber,
      differingPaths: findDifferingPaths(readRecordedFiles(data.scope_files), current.fileHashes),
      recordedHash,
      currentHash: current.hash,
    };
  }

  return null;
}

/** Resolve the metadata written to the done marker after a passing task. */
export async function buildDoneMetadata(
  projectRoot: string,
  scope: string[],
): Promise<DoneMarkerMetadata> {
  const [scopeHash, buildInfo] = await Promise.all([
    computeTaskScopeHash(projectRoot, scope),
    resolveBuildInfo(projectRoot),
  ]);
  return {
    scopeHash: scopeHash.hash,
    buildStamp: buildInfo.commit,
    exitCode: 0,
    fileHashes: scopeHash.fileHashes,
  };
}

/** Record a scope regression under `.run/regressed/` and its typed event. */
export async function recordScopeRegression(
  specFolderPath: string,
  result: ScopeRegressionResult,
): Promise<void> {
  const regressedDir = path.join(specFolderPath, '.run', 'regressed');
  await fs.mkdir(regressedDir, { recursive: true });
  const content = [
    '---',
    'reason: scope_regression',
    `task: ${result.taskNumber}`,
    `recorded_hash: "${result.recordedHash}"`,
    `current_hash: "${result.currentHash}"`,
    '---',
    `Task ${result.taskNumber} scope changed after completion:`,
    ...result.differingPaths.map((entry) => `- ${entry}`),
    '',
  ].join('\n');
  await fs.writeFile(path.join(regressedDir, `${result.taskNumber}.md`), content, 'utf8');

  // `regressed` joins the event union in the sibling regressed-status change;
  // the cast keeps this writer on the single append path until then.
  await appendHarnessEvent(specFolderPath, result.taskNumber, {
    type: 'regressed',
    timestamp: new Date().toISOString(),
    data: {
      task: result.taskNumber,
      differingPaths: result.differingPaths,
      recordedHash: result.recordedHash,
      currentHash: result.currentHash,
    },
  } as unknown as HarnessEvent);
}

/**
 * Pre-spawn guard: detect and record a scope regression for task n+1. Returns a
 * failure result without spawning, or `null` when every earlier scope matches.
 */
export async function guardScopeRegression(
  projectRoot: string,
  specFolderPath: string,
  currentTaskNumber: string,
): Promise<RunTaskResult | null> {
  const regression = await checkDoneTasksScopeHashes(
    projectRoot,
    specFolderPath,
    currentTaskNumber,
  );
  if (!regression) {
    return null;
  }
  await recordScopeRegression(specFolderPath, regression);
  const detail = regression.differingPaths.join(', ');
  return {
    success: false,
    reason: 'regressed',
    error: `Scope of task ${regression.taskNumber} changed: ${detail}`,
  };
}
