import fs from 'node:fs/promises';
import path from 'node:path';
import { refreshRecertifiedDoneMarker } from '../core/lifecycle/recertify.js';
import type {
  DoneMarkerInfo,
  ScopeHashResult,
  ScopePathAttribution,
} from '../core/run/scope-hash.js';
import { scopeCoversPath } from '../core/run/scope.js';
import { parseTaskMd } from '../core/spec/parser.js';
import { compareNumericPrefix } from '../core/status/state.js';
import { appendHarnessEvent } from '../harness/types.js';
import type { VerificationGateResult } from './verify.js';

/** One differing path in both raw and display forms. */
export interface DifferingScopePath {
  readonly path: string;
  readonly display: string;
}

export interface AutomaticRecertificationInput {
  readonly projectRoot: string;
  readonly specFolderPath: string;
  readonly runDir: string;
  readonly taskNumber: string;
  readonly differing: readonly DifferingScopePath[];
  readonly recorded: DoneMarkerInfo;
  readonly current: ScopeHashResult;
  readonly verifyCommand: string;
  readonly verify: VerificationGateResult;
  readonly attribution: ScopePathAttribution[];
}

interface MeasureSegment {
  before: string | null;
  after: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Later-numbered task numbers of one change, numerically ordered. */
async function listLaterTaskNumbers(specFolderPath: string, taskNumber: string): Promise<string[]> {
  const entries = await fs.readdir(path.join(specFolderPath, 'tasks')).catch((): string[] => []);
  const current = Number.parseInt(taskNumber, 10);
  return entries
    .map((entry) => entry.match(/^(\d+)\.md$/)?.[1])
    .filter((number): number is string => number !== undefined)
    .filter((number) => Number.parseInt(number, 10) > current)
    .sort(compareNumericPrefix);
}

/** The per-file before/after segments a task's `measures` end events recorded. */
async function readEndSegments(
  specFolderPath: string,
  taskNumber: string,
  filePath: string,
): Promise<MeasureSegment[]> {
  const raw = await fs
    .readFile(path.join(specFolderPath, '.run', 'events', `${taskNumber}.jsonl`), 'utf8')
    .catch(() => '');
  const segments: MeasureSegment[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(event) || event.type !== 'measures' || !isRecord(event.data)) continue;
    if (event.data.phase !== 'end' || !isRecord(event.data.scopeHashes)) continue;
    const entry = event.data.scopeHashes[filePath];
    if (!isRecord(entry)) continue;
    segments.push({
      before: typeof entry.before === 'string' ? entry.before : null,
      after: typeof entry.after === 'string' ? entry.after : null,
    });
  }
  return segments;
}

/** True when one path's hash travels from the done record to the tree without a gap. */
async function pathCarriedWithoutGap(
  specFolderPath: string,
  laterTasks: readonly { number: string; scope: string[] }[],
  filePath: string,
  expectedStart: string | null,
  expectedEnd: string | null,
): Promise<boolean> {
  const segments: MeasureSegment[] = [];
  for (const task of laterTasks) {
    if (!scopeCoversPath(task.scope, filePath)) continue;
    segments.push(...(await readEndSegments(specFolderPath, task.number, filePath)));
  }
  if (segments.length === 0) return false;
  if (segments[0].before !== expectedStart) return false;
  for (let index = 1; index < segments.length; index++) {
    if (segments[index].before !== segments[index - 1].after) return false;
  }
  return segments[segments.length - 1].after === expectedEnd;
}

/**
 * Recertify one stale done task without a human when a later task that had the
 * file in scope is the only thing that changed it and the recorded hashes carry
 * the file without a gap. Refreshes the done marker and appends the automatic
 * `recertification` event; returns false when any differing path disqualifies.
 */
export async function autoRecertify(input: AutomaticRecertificationInput): Promise<boolean> {
  const { specFolderPath, taskNumber, differing } = input;
  if (differing.length === 0) return false;

  const laterTasks: { number: string; scope: string[] }[] = [];
  for (const number of await listLaterTaskNumbers(specFolderPath, taskNumber)) {
    const content = await fs
      .readFile(path.join(specFolderPath, 'tasks', `${number}.md`), 'utf8')
      .catch(() => null);
    if (content === null) continue;
    laterTasks.push({ number, scope: parseTaskMd(content).scope });
  }

  for (const entry of differing) {
    const carried = await pathCarriedWithoutGap(
      specFolderPath,
      laterTasks,
      entry.path,
      input.recorded.scopeFiles[entry.path] ?? null,
      input.current.fileHashes[entry.path] ?? null,
    );
    if (!carried) return false;
  }

  await refreshRecertifiedDoneMarker(
    input.runDir,
    taskNumber,
    input.recorded.scopeHash,
    input.current,
  );
  await appendHarnessEvent(specFolderPath, taskNumber, {
    type: 'recertification',
    timestamp: new Date().toISOString(),
    data: {
      task: taskNumber,
      outcome: 'passed',
      differingPaths: differing.map((entry) => entry.display),
      attribution: input.attribution,
      command: input.verifyCommand,
      exitCode: input.verify.exitCode,
      output: input.verify.output,
      timedOut: input.verify.timedOut,
      recordedHash: input.recorded.scopeHash,
      currentHash: input.current.hash,
      automatic: true,
    },
  });
  return true;
}
