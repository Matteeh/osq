import fs from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from '../core/foundation/logger.js';
import { StaleBuildError, findStaleBuild, newestDistMtimeMs, osqPackageRoot } from './build.js';
import type { StaleCheck } from './stale-pass.js';

/** Exit code of a service worker that found a new osq build. */
export const EXIT_NEW_BUILD = 75;

/** A service worker found a settled new osq build and exits to reload it. */
export class BuildChangedError extends StaleBuildError {}
/** Its message is the reason the worker waits. */
export class BuildWaitError extends StaleBuildError {}

export interface ServiceBuildCheckOptions {
  /** osq's package root; defaults to the running one. */
  readonly packageRoot?: string;
  /** `config.watch.buildSettleSeconds`. */
  readonly settleSeconds: number;
  readonly logger?: Logger;
  readonly onWaiting?: (reason: string | null) => void | Promise<void>;
  readonly now?: () => number;
}

/** The build key's version half: the package root's own `package.json`. */
async function readPackageVersion(packageRoot: string): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === 'string' && parsed.version.trim().length > 0) {
      return parsed.version.trim();
    }
  } catch {
    // Missing or malformed file: treat as no version so a dist change drives.
  }
  return '';
}

/**
 * Build the check a service worker uses in place of the stale checks. It reads
 * the build key once, the package root's `version` plus the newest `dist/`
 * mtime, and each call compares the current key with it: a settled change
 * throws `BuildChangedError`, a younger one waits for the build to finish, an
 * unchanged key without a stale `src/` passes, and an unchanged key whose
 * `src/` outpaced the `dist/` read at start waits the stale line.
 * @scenario watcher-and-harness: Service worker build checks
 */
export async function createServiceBuildCheck(
  options: ServiceBuildCheckOptions,
): Promise<StaleCheck> {
  const root = path.resolve(options.packageRoot ?? osqPackageRoot());
  const startVersion = await readPackageVersion(root);
  const startDistMtimeMs = await newestDistMtimeMs(root);
  const startKey = `${startVersion}\u0000${startDistMtimeMs}`;
  const now = options.now ?? Date.now;
  const settleMs = options.settleSeconds * 1000;

  let lastWaiting: string | null = null;
  let lastLogged: string | null = null;

  const wait = async (reason: string): Promise<string | null> => {
    await options.onWaiting?.(reason);
    if (reason !== lastLogged) {
      options.logger?.info(reason);
      lastLogged = reason;
    }
    lastWaiting = reason;
    throw new BuildWaitError(reason);
  };

  const pass = async (): Promise<null> => {
    if (lastWaiting !== null) {
      lastWaiting = null;
      lastLogged = null;
      await options.onWaiting?.(null);
    }
    return null;
  };

  return async (): Promise<string | null> => {
    const version = await readPackageVersion(root);
    const distMtimeMs = await newestDistMtimeMs(root);
    if (`${version}\u0000${distMtimeMs}` !== startKey) {
      if (now() - distMtimeMs >= settleMs) {
        throw new BuildChangedError('a settled new osq build replaced the running one');
      }
      return wait('a new osq build is being written');
    }

    const staleLine = await findStaleBuild({
      packageRoot: root,
      distMtimeMs: startDistMtimeMs,
    });
    if (staleLine !== null) {
      return wait(staleLine);
    }
    return pass();
  };
}
