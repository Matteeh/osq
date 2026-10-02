import fs from 'node:fs/promises';
import path from 'node:path';
import type { Command } from 'commander';
import { type OsqConfig, loadConfig } from '../core/foundation/config.js';
import { landChange } from '../core/vcs/land.js';
import { findStaleBuild, osqPackageRoot } from '../watcher/build.js';
import { CommandError } from './command-error.js';

/** The line a land prints when it changed osq's own source. */
export const REBUILD_MESSAGE = "osq's own source changed; run the build and restart the watcher";

export interface LandCommandOptions {
  cwd?: string;
  config?: OsqConfig;
  stdout?: (msg: string) => void;
  stderr?: (msg: string) => void;
  /** Skip the stale-build refusal. */
  allowStale?: boolean;
  /** osq's own package root; defaults to the running package. */
  packageRoot?: string;
}

/** The real path of the nearest directory at or above `target` that exists. */
async function nearestRealDir(target: string): Promise<string | null> {
  let dir = path.dirname(target);
  for (;;) {
    try {
      return await fs.realpath(dir);
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  }
}

/** Whether any changed file lies under `<packageRoot>/src`, through real paths. */
async function changedOwnSource(changed: readonly string[], packageRoot: string): Promise<boolean> {
  let realRoot: string;
  try {
    realRoot = await fs.realpath(packageRoot);
  } catch {
    return false;
  }
  const srcRoot = path.join(realRoot, 'src');
  for (const file of changed) {
    const dir = await nearestRealDir(file);
    if (dir !== null && (dir === srcRoot || dir.startsWith(`${srcRoot}${path.sep}`))) {
      return true;
    }
  }
  return false;
}

/**
 * Land an archived change onto the default branch, after refusing a stale build.
 * Prints each line `landChange` returns to stdout and the progress it reports to
 * stderr, then says to rebuild when the land changed osq's own source. A
 * refusal or a stop throws a `CommandError` carrying its message or exit code;
 * the command prints no error line of its own. A non-zero `landChange` code
 * throws an empty `CommandError` with that code after its lines print.
 */
export async function landCommand(id: string, options: LandCommandOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const stdout = options.stdout ?? ((msg: string) => process.stdout.write(msg));
  const stderr = options.stderr ?? ((msg: string) => process.stderr.write(msg));

  try {
    const stale = await findStaleBuild({
      allowStale: options.allowStale,
      packageRoot: options.packageRoot,
    });
    if (stale !== null) {
      throw new CommandError(stale);
    }
    const config = options.config || (await loadConfig(cwd));
    const { lines, code, changed } = await landChange(cwd, config, id, (line) =>
      stderr(`${line}\n`),
    );
    for (const line of lines) stdout(`${line}\n`);
    if (code === 0 && (await changedOwnSource(changed, options.packageRoot ?? osqPackageRoot()))) {
      stdout(`${REBUILD_MESSAGE}\n`);
    }
    if (code !== 0) {
      throw new CommandError('', { exitCode: code });
    }
  } catch (error) {
    if (error instanceof CommandError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new CommandError(message);
  }
}

/** Register `osq land <id>` on the root program. */
export function registerLandCommand(program: Command): void {
  program
    .command('land <id>')
    .description('land an archived change onto the default branch')
    .option('--allow-stale', 'allow landing when dist/ is older than src/')
    .action(async (id: string, options: { allowStale?: boolean }) => {
      await landCommand(id, { allowStale: options.allowStale });
    });
}
