import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseFrontmatter } from '../spec/parser.js';
import { compareNumericPrefix } from '../status/state.js';
import { resolveScope } from './scope.js';

export { SCOPE_RESOLVER_VERSION } from './scope.js';

/** Per-file content hashes plus a single combined digest for a task scope. */
export interface ScopeHashResult {
  hash: string;
  fileHashes: Record<string, string | null>;
}

/** One differing path paired with its trustworthy later-editor attribution. */
export interface ScopePathAttribution {
  /** The decorated differing path, e.g. `src/a.ts (modified)`. */
  path: string;
  /** A later done task number, `ambiguous`, or `unknown`. */
  attribution: string;
}

/** One task found stale by the scope recertification audit. */
export interface StaleTaskAudit {
  taskNumber: string;
  differingPaths: string[];
  attribution: ScopePathAttribution[];
  recordedHash: string;
  currentHash: string;
  verifyCommand: string;
  exitCode: number;
  duration: number;
  output: string;
  timedOut: boolean;
  verificationPassed: boolean;
  /** True when a canonical active regression marker already covers this task. */
  alreadyActive: boolean;
}

interface DifferingPath {
  path: string;
  display: string;
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/** Normalize a path to a project-relative POSIX string. */
export function relativePosix(projectRoot: string, filePath: string): string {
  return path.relative(projectRoot, filePath).split(path.sep).join('/');
}

/**
 * Content-address a task scope through the shared deterministic resolver. Each
 * resolved entry's UTF-8 SHA-256 (or `null` when the declared exact file is
 * missing) is keyed by project-relative POSIX path, then folded into one
 * deterministic digest over the sorted `path:hash` entries.
 */
export async function computeTaskScopeHash(
  projectRoot: string,
  scope: string[],
): Promise<ScopeHashResult> {
  const fileHashes: Record<string, string | null> = {};
  const resolved = await resolveScope(projectRoot, scope);
  for (const entry of resolved) {
    if (entry.absolutePath === null) {
      fileHashes[entry.relativePath] = null;
      continue;
    }
    const content = await fs.readFile(entry.absolutePath, 'utf8').catch(() => null);
    fileHashes[entry.relativePath] = content === null ? null : `sha256:${sha256(content)}`;
  }
  const canonical = Object.keys(fileHashes)
    .map((key) => `${key}:${fileHashes[key] ?? ''}`)
    .join('\n');
  return { hash: `sha256:${sha256(canonical)}`, fileHashes };
}

/** Read the recorded per-file hash map out of a done marker's frontmatter. */
export function readRecordedFiles(value: unknown): Record<string, string | null> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  const map: Record<string, string | null> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    map[key] = typeof entry === 'string' ? entry : null;
  }
  return map;
}

/** Classify each scoped path whose recorded hash no longer matches the tree. */
export function findDifferingPaths(
  recorded: Record<string, string | null>,
  current: Record<string, string | null>,
): DifferingPath[] {
  const paths = new Set([...Object.keys(recorded), ...Object.keys(current)]);
  const differing: DifferingPath[] = [];
  for (const key of [...paths].sort()) {
    const before = recorded[key] ?? null;
    const after = current[key] ?? null;
    if (before === after) continue;
    const kind = before === null ? 'added' : after === null ? 'deleted' : 'modified';
    differing.push({ path: key, display: `${key} (${kind})` });
  }
  return differing;
}

/** Normalize a recorded path to a project-relative POSIX form for comparison. */
export function normalizePath(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^(?:\.\/)+/, '');
}

/**
 * Attribute each differing path to a later done task only when a sole typed
 * `file_changed` candidate exists and its recorded completion hash matches the
 * current tree when one is available. Otherwise `ambiguous` or `unknown`.
 */
export function attributeScopePaths(
  staleTaskNumber: string,
  differing: DifferingPath[],
  currentFileHashes: Record<string, string | null>,
  changesByPath: Map<string, Set<string>>,
  completionHashes: Map<string, Record<string, string | null>>,
): ScopePathAttribution[] {
  const staleNumber = Number.parseInt(staleTaskNumber, 10);
  return differing.map((entry) => {
    const candidates = [...(changesByPath.get(entry.path) ?? [])]
      .filter((number) => Number.parseInt(number, 10) > staleNumber)
      .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
    let attribution: string;
    if (candidates.length === 0) {
      attribution = 'unknown';
    } else if (candidates.length > 1) {
      attribution = 'ambiguous';
    } else {
      const completionHash = completionHashes.get(candidates[0])?.[entry.path];
      attribution =
        typeof completionHash === 'string' &&
        completionHash !== (currentFileHashes[entry.path] ?? null)
          ? 'unknown'
          : candidates[0];
    }
    return { path: entry.display, attribution };
  });
}

/** Render the structured regression marker body for humans and later retries. */
export function buildScopeRegressionMarker(input: Omit<StaleTaskAudit, 'alreadyActive'>): string {
  return [
    '---',
    'reason: scope_regression',
    `task: ${JSON.stringify(input.taskNumber)}`,
    `recorded_hash: ${JSON.stringify(input.recordedHash)}`,
    `current_hash: ${JSON.stringify(input.currentHash)}`,
    `verify_command: ${JSON.stringify(input.verifyCommand)}`,
    `exit_code: ${input.exitCode}`,
    `duration: ${input.duration}`,
    `timed_out: ${input.timedOut}`,
    `verification_passed: ${input.verificationPassed}`,
    `attribution: ${JSON.stringify(input.attribution)}`,
    '---',
    `Task ${input.taskNumber} scope changed after completion:`,
    ...input.differingPaths.map((entry) => `- ${entry}`),
    '',
    input.output.trim() || '(no output)',
    '',
  ].join('\n');
}

/** Recover a stale task's record from an already-active regression marker. */
export function parseActiveStaleTask(
  taskNumber: string,
  content: string,
  base: Pick<StaleTaskAudit, 'differingPaths' | 'attribution' | 'recordedHash' | 'currentHash'>,
): StaleTaskAudit {
  const { data, body } = parseFrontmatter(content);
  return {
    taskNumber,
    ...base,
    verifyCommand: typeof data.verify_command === 'string' ? data.verify_command : '',
    exitCode: typeof data.exit_code === 'number' ? data.exit_code : 1,
    duration: typeof data.duration === 'number' ? data.duration : 0,
    output: body.trim(),
    timedOut: data.timed_out === true,
    verificationPassed: data.verification_passed === true,
    alreadyActive: true,
  };
}

export interface DoneMarkerInfo {
  scopeHash: string;
  scopeFiles: Record<string, string | null>;
  /** Recorded resolver version, or null when absent or malformed. */
  scopeResolver: number | null;
}

/** Canonical done markers are automated; manual and malformed markers are excluded. */
export async function readDoneMarker(
  runDir: string,
  taskNumber: string,
): Promise<DoneMarkerInfo | null> {
  const content = await fs
    .readFile(path.join(runDir, 'done', taskNumber), 'utf8')
    .catch(() => null);
  if (content === null) return null;
  const { data } = parseFrontmatter(content);
  const scopeHash = typeof data.scope_hash === 'string' ? data.scope_hash : null;
  if (!scopeHash) return null;
  const resolver = data.scope_resolver;
  const scopeResolver = typeof resolver === 'number' && Number.isFinite(resolver) ? resolver : null;
  return { scopeHash, scopeFiles: readRecordedFiles(data.scope_files), scopeResolver };
}

/** Active canonical done task numbers, numerically ordered. */
export async function listCanonicalDoneNumbers(runDir: string): Promise<string[]> {
  const entries = await fs.readdir(path.join(runDir, 'done')).catch((): string[] => []);
  return entries.filter((entry) => /^\d+$/.test(entry)).sort(compareNumericPrefix);
}

/** Every typed `file_changed` path recorded in one numbered task stream. */
export async function readFileChangedPaths(
  specFolderPath: string,
  taskNumber: string,
): Promise<string[]> {
  const eventPath = path.join(specFolderPath, '.run', 'events', `${taskNumber}.jsonl`);
  const raw = await fs.readFile(eventPath, 'utf8').catch(() => '');
  const paths: string[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let event: { type?: unknown; data?: { path?: unknown } };
    try {
      event = JSON.parse(line) as typeof event;
    } catch {
      continue;
    }
    if (event.type !== 'file_changed') continue;
    const value = event.data?.path;
    if (typeof value === 'string' && value.trim()) paths.push(normalizePath(value));
  }
  return paths;
}
