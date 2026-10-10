import fsp from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { runVerificationCommand } from '../run/verification.js';
import { watchStateDir } from '../run/watch-state.js';

/**
 * The record of the last failed after-land command, as the project's
 * `after-land.json` holds it: the change folder, the command, its exit code,
 * and when it failed. A passing run removes the file.
 */
export interface AfterLandFailure {
  readonly change: string;
  readonly command: string;
  readonly exitCode: number;
  readonly failedAt: string;
}

/** Whether an after-land command ran, and whether it passed. */
export interface AfterLandOutcome {
  readonly ran: boolean;
  readonly passed: boolean;
}

/** One after-land run's appended lines, exit code, and outcome. */
export interface AfterLandRun {
  readonly lines: string[];
  readonly code: number;
  readonly outcome: AfterLandOutcome;
}

const AFTER_LAND_FILE = 'after-land.json';

/** The last `limit` non-blank lines of command output. */
function outputTail(output: string, limit: number): string {
  const lines = output.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop();
  return lines.slice(Math.max(0, lines.length - limit)).join('\n');
}

/** The absolute path of the project's `after-land.json`. */
async function afterLandFile(projectRoot: string, home?: string): Promise<string> {
  return path.join(await watchStateDir(projectRoot, home), AFTER_LAND_FILE);
}

/**
 * Read the project's `after-land.json`, or null when it is absent, unreadable,
 * or does not carry a change, command, exit code, and timestamp.
 *
 * @scenario status-inspection: Failed after-land command waiting
 * @scenario status-inspection: No failure recorded
 */
export async function readAfterLandFailure(
  projectRoot: string,
  home?: string,
): Promise<AfterLandFailure | null> {
  const content = await fsp
    .readFile(await afterLandFile(projectRoot, home), 'utf8')
    .catch(() => null);
  if (content === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  if (
    typeof record.change !== 'string' ||
    typeof record.command !== 'string' ||
    typeof record.exitCode !== 'number' ||
    typeof record.failedAt !== 'string'
  ) {
    return null;
  }
  return {
    change: record.change,
    command: record.command,
    exitCode: record.exitCode,
    failedAt: record.failedAt,
  };
}

/** Write `after-land.json` naming a failed run. */
async function writeAfterLandFailure(
  projectRoot: string,
  home: string | undefined,
  failure: AfterLandFailure,
): Promise<void> {
  const dir = await watchStateDir(projectRoot, home);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, AFTER_LAND_FILE), `${JSON.stringify(failure)}\n`, 'utf8');
}

/** Remove the project's `after-land.json` when it exists. */
async function clearAfterLandFailure(projectRoot: string, home?: string): Promise<void> {
  await fsp.rm(await afterLandFile(projectRoot, home), { force: true });
}

/** The numeric id of a change folder, as the retry line names it. */
function landIdOf(folderName: string): string {
  return folderName.split('-')[0] ?? folderName;
}

/** Run `vcs.afterLand` once and record or clear its outcome. */
async function executeAfterLand(
  projectRoot: string,
  config: OsqConfig,
  folderName: string,
  command: string,
  progress: (line: string) => void,
  home: string | undefined,
): Promise<AfterLandRun> {
  progress(`Running after-land command: ${command}`);
  const result = await runVerificationCommand(
    projectRoot,
    command,
    config.timeouts.verifyTimeoutSeconds,
    null,
    { role: 'prepare', config },
  );
  if (result.exitCode === 0) {
    await clearAfterLandFailure(projectRoot, home);
    return {
      lines: [`After-land command passed: ${command}`],
      code: 0,
      outcome: { ran: true, passed: true },
    };
  }
  await writeAfterLandFailure(projectRoot, home, {
    change: folderName,
    command,
    exitCode: result.exitCode,
    failedAt: new Date().toISOString(),
  });
  const tail = outputTail(result.output, config.limits.cardOutputLines);
  return {
    lines: [
      `After-land command failed: ${command}`,
      ...(tail.length > 0 ? tail.split('\n') : []),
      `run osq land ${landIdOf(folderName)} again to retry it`,
    ],
    code: 1,
    outcome: { ran: true, passed: false },
  };
}

/**
 * Run `vcs.afterLand` in the checkout after a land, or null when it is unset,
 * so a land without the key returns exactly what it did before.
 *
 * @scenario version-control: Passing after-land command
 * @scenario version-control: Failing after-land command
 * @scenario version-control: No command configured
 * @adr 003
 */
export async function runAfterLand(
  projectRoot: string,
  config: OsqConfig,
  change: { readonly folderName: string },
  progress: (line: string) => void,
  home?: string,
): Promise<AfterLandRun | null> {
  const command = config.vcs?.afterLand;
  if (command === undefined) return null;
  return executeAfterLand(projectRoot, config, change.folderName, command, progress, home);
}

/**
 * Re-run `vcs.afterLand` for an already landed change only when the recorded
 * failure names that change, so every other re-land runs nothing.
 *
 * @scenario version-control: Retry after a failure
 * @scenario version-control: Already landed without a failure
 * @adr 003
 */
export async function retryAfterLand(
  projectRoot: string,
  config: OsqConfig,
  change: { readonly folderName: string },
  progress: (line: string) => void,
  home?: string,
): Promise<AfterLandRun | null> {
  const command = config.vcs?.afterLand;
  if (command === undefined) return null;
  const record = await readAfterLandFailure(projectRoot, home);
  if (record === null || record.change !== change.folderName) return null;
  return executeAfterLand(projectRoot, config, change.folderName, command, progress, home);
}
