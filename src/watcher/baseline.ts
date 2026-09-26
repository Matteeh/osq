import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/foundation/config.js';
import type { Logger } from '../core/foundation/logger.js';
import { runVerificationCommand } from '../core/run/verification.js';
import { getArchiveDir, getChangesDir, isActiveChangeFolderName } from '../core/status/layout.js';
import { selectVcs } from '../core/vcs/select.js';
import { type BaselineRanEventData, appendHarnessEvent } from '../harness/types.js';
import { type BaselineKey, readBaselineKey } from './baseline-key.js';

export interface BaselineOptions {
  readonly projectRoot: string;
  readonly specFolderPath: string;
  readonly taskNumber: string;
  readonly config: OsqConfig;
  readonly logger?: Logger;
}

/** A green baseline the current tree may reuse, or the failure that halts it. */
export type BaselineOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly marker: string; readonly error: string; readonly extra: string };

interface GreenBaseline {
  readonly folder: string;
  readonly timestamp: string;
  readonly data: BaselineRanEventData;
}

const CHANGE_STREAM = 'change.jsonl';
const HALT_LINE = 'tree was red before this change started';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parse every well-formed JSON line of a stream, ignoring malformed lines. */
async function readStream(filePath: string): Promise<unknown[]> {
  const raw = await fs.readFile(filePath, 'utf8').catch(() => '');
  const values: unknown[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      values.push(JSON.parse(line));
    } catch {
      // Malformed lines never hide a later valid event.
    }
  }
  return values;
}

/** True when any of the change's task streams already holds a `started` event. */
async function changeHasStartedTask(specFolderPath: string): Promise<boolean> {
  const eventsDir = path.join(specFolderPath, '.run', 'events');
  let entries: string[] = [];
  try {
    entries = await fs.readdir(eventsDir);
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.jsonl') || entry === CHANGE_STREAM) continue;
    const events = await readStream(path.join(eventsDir, entry));
    if (events.some((event) => isRecord(event) && event.type === 'started')) return true;
  }
  return false;
}

/** The green baseline a `baseline_ran` line records, or null for any other line. */
function greenEvent(value: unknown): BaselineRanEventData | null {
  if (!isRecord(value) || value.type !== 'baseline_ran' || !isRecord(value.data)) return null;
  const data = value.data;
  if (data.outcome !== 'passed' && data.outcome !== 'reused') return null;
  if (typeof data.command !== 'string') return null;
  return data as unknown as BaselineRanEventData;
}

/** Every active and archived change folder, active first. */
async function changeFolders(projectRoot: string, config: OsqConfig): Promise<string[]> {
  const folders: string[] = [];
  const changesDir = getChangesDir(config.paths.openspecRoot, projectRoot);
  const active = await fs.readdir(changesDir, { withFileTypes: true }).catch(() => [] as Dirent[]);
  for (const entry of active) {
    if (entry.isDirectory() && isActiveChangeFolderName(entry.name)) {
      folders.push(path.join(changesDir, entry.name));
    }
  }
  const archiveDir = getArchiveDir(config.paths.openspecRoot, projectRoot);
  const archived = await fs
    .readdir(archiveDir, { withFileTypes: true })
    .catch(() => [] as Dirent[]);
  for (const entry of archived) {
    if (entry.isDirectory()) folders.push(path.join(archiveDir, entry.name));
  }
  return folders;
}

/** The latest passed or reused baseline across every active and archived change. */
async function latestGreenBaseline(
  projectRoot: string,
  config: OsqConfig,
): Promise<GreenBaseline | null> {
  let latest: GreenBaseline | null = null;
  for (const folder of await changeFolders(projectRoot, config)) {
    const events = await readStream(path.join(folder, '.run', 'events', CHANGE_STREAM));
    for (const value of events) {
      const data = greenEvent(value);
      if (data === null) continue;
      const timestamp =
        isRecord(value) && typeof value.timestamp === 'string' ? value.timestamp : '';
      if (latest === null || timestamp > latest.timestamp) {
        latest = { folder: path.basename(folder), timestamp, data };
      }
    }
  }
  return latest;
}

/** True when a green baseline's command and key match the current tree. */
function reusable(green: GreenBaseline, command: string, key: BaselineKey | null): boolean {
  if (key === null) return false;
  return (
    green.data.command === command &&
    green.data.commit === key.commit &&
    green.data.treeDigest === key.treeDigest
  );
}

async function appendBaselineEvent(
  specFolderPath: string,
  data: BaselineRanEventData,
): Promise<void> {
  await appendHarnessEvent(specFolderPath, 'change', {
    type: 'baseline_ran',
    timestamp: new Date().toISOString(),
    data,
  });
}

/** The change's numeric identifier, or its folder name when it has no prefix. */
function specIdOf(specFolderPath: string): string {
  const name = path.basename(specFolderPath);
  return name.match(/^(\d+)/)?.[1] ?? name;
}

/**
 * Dead marker for a red baseline: the halt line first, then the command, its
 * exit code, and the retry that settles it again, then the captured output.
 */
export function formatBaselineDeadMarker(
  command: string,
  exitCode: number,
  specId: string,
  taskNumber: string,
  output: string,
): string {
  return [
    '---',
    'reason: baseline_red',
    `command: "${command}"`,
    `exit_code: ${exitCode}`,
    '---',
    HALT_LINE,
    `baseline command "${command}" exited ${exitCode}; fix the tree, then run osq retry ${specId} ${taskNumber}.`,
    output,
    '',
  ].join('\n');
}

/**
 * Settle a change's baseline before its first task spawns. When
 * `gates.baselineVerify` is set and no task has started, a green baseline for
 * the current key is reused; otherwise the command runs once and is recorded.
 * A red command returns the failure its caller turns into a `baseline_red`
 * death before any pre-spawn verify or agent spawn.
 */
export async function settleBaseline(options: BaselineOptions): Promise<BaselineOutcome> {
  const { projectRoot, specFolderPath, taskNumber, config } = options;
  const command = config.gates?.baselineVerify;
  if (!command) return { ok: true };
  if (await changeHasStartedTask(specFolderPath)) return { ok: true };

  const vcs = await selectVcs(projectRoot, config);
  const key = await readBaselineKey(vcs, projectRoot);
  const green = key === null ? null : await latestGreenBaseline(projectRoot, config);
  if (green !== null && reusable(green, command, key)) {
    await appendBaselineEvent(specFolderPath, {
      outcome: 'reused',
      command,
      commit: key?.commit ?? null,
      treeDigest: key?.treeDigest ?? null,
      exitCode: 0,
      durationSeconds: 0,
      reusedFrom: green.folder,
    });
    return { ok: true };
  }

  const timeoutSeconds = config.timeouts.verifyTimeoutSeconds ?? 600;
  const result = await runVerificationCommand(projectRoot, command, timeoutSeconds, null);
  await appendBaselineEvent(specFolderPath, {
    outcome: result.exitCode === 0 ? 'passed' : 'failed',
    command,
    commit: key?.commit ?? null,
    treeDigest: key?.treeDigest ?? null,
    exitCode: result.exitCode,
    durationSeconds: result.duration,
  });
  if (result.exitCode === 0) return { ok: true };

  return {
    ok: false,
    marker: formatBaselineDeadMarker(
      command,
      result.exitCode,
      specIdOf(specFolderPath),
      taskNumber,
      result.output,
    ),
    error: `Baseline command failed: ${command} (exit code ${result.exitCode})`,
    extra: HALT_LINE,
  };
}
