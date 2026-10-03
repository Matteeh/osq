import { StaleBuildError, findStaleBuild, newestDistMtimeMs } from './build.js';

/** A pass-time stale check: resolves to the stale line, or null when fresh. */
export type StaleCheck = () => Promise<string | null>;

/**
 * Throw `StaleBuildError` when the injected pass-time check reports the build
 * stale. A missing check means the caller opted out (allowStale, dev, or a run
 * from source) and nothing is verified.
 */
export async function assertNotStale(check?: StaleCheck): Promise<void> {
  if (!check) {
    return;
  }
  const line = await check();
  if (line !== null) {
    throw new StaleBuildError(line);
  }
}

export interface StaleStartOptions {
  allowStale?: boolean;
  dev?: boolean;
  packageRoot?: string;
}

/**
 * Build the pass-time check for one watcher run. Returns `undefined` when
 * stale checks are disabled, and throws `StaleBuildError` when the start check
 * itself finds a stale build. Otherwise it reads the newest `dist/` mtime once,
 * so every later pass compares against the build the running watcher loaded.
 */
export async function startStaleCheck(options: StaleStartOptions): Promise<StaleCheck | undefined> {
  if (options.allowStale === true || options.dev === true) {
    return undefined;
  }
  const startLine = await findStaleBuild({ packageRoot: options.packageRoot });
  if (startLine !== null) {
    throw new StaleBuildError(startLine);
  }
  const distMtimeMs = await newestDistMtimeMs(options.packageRoot);
  return () => findStaleBuild({ packageRoot: options.packageRoot, distMtimeMs });
}

export interface StaleExitDeps {
  clearStatus?: () => void;
  exit: (code: number) => void;
}

/**
 * Print and exit for a stale build during a run. Returns false when `err` is
 * not a `StaleBuildError`, so the caller can fall through to its normal error
 * path.
 */
export function handleStaleBuild(err: unknown, deps: StaleExitDeps): boolean {
  if (!(err instanceof StaleBuildError)) {
    return false;
  }
  deps.clearStatus?.();
  console.error(err.message);
  deps.exit(1);
  return true;
}
