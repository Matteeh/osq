import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGitCommit, readGitTopLevel } from './build-project.js';

/** Identity of the osq build currently executing: package version plus commit. */
export interface BuildInfo {
  version: string;
  commit: string;
}

const UNKNOWN = 'unknown';

/**
 * Package root of the running osq build: `src/watcher/` when executed through
 * `tsx`, `dist/watcher/` once compiled. Both resolve two levels up.
 */
const PACKAGE_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

/**
 * Whether this module is being executed from TypeScript source (via `tsx`)
 * rather than from compiled output. Source execution always reflects the
 * latest code, so there is no compiled build that could be stale.
 */
const RUNNING_FROM_SOURCE = fileURLToPath(import.meta.url).endsWith('.ts');

const buildInfoCache = new Map<string, BuildInfo>();

/**
 * Read the `version` field from the osq package root's own `package.json`.
 * The project being watched is never consulted: an installed osq must report
 * its own version, not the consumer's.
 */
async function readVersion(packageRoot: string): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === 'string' && parsed.version.trim().length > 0) {
      return parsed.version.trim();
    }
  } catch {
    // Missing or malformed file: report unknown.
  }

  return UNKNOWN;
}

/**
 * SHA-256 over every file under `dist/`, first 8 hex characters. Paths are
 * sorted so the hash is stable across filesystems; the relative path is folded
 * in so a rename changes the hash even when contents do not. Returns `unknown`
 * when `dist/` is absent or empty.
 */
async function hashDist(projectRoot: string): Promise<string> {
  const distDir = path.join(projectRoot, 'dist');
  const files: string[] = [];

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
        files.push(full);
      }
    }
  };

  await walk(distDir);
  if (files.length === 0) {
    return UNKNOWN;
  }

  files.sort();
  const hash = createHash('sha256');
  for (const file of files) {
    const relative = path.relative(distDir, file).split(path.sep).join('/');
    hash.update(relative);
    hash.update('\0');
    hash.update(await fs.readFile(file));
    hash.update('\0');
  }

  return hash.digest('hex').slice(0, 8);
}

/** Whether two paths resolve to the same real location on disk. */
async function sameRealPath(a: string, b: string): Promise<boolean> {
  try {
    const [realA, realB] = await Promise.all([fs.realpath(a), fs.realpath(b)]);
    return realA === realB;
  } catch {
    return false;
  }
}

/**
 * Resolve the active osq build identity from an optional osq package root,
 * defaulting to the running package. Version comes from that root's
 * `package.json`; the commit is the short git SHA only when the root is the top
 * of a git work tree, otherwise a hash of that root's `dist/`, otherwise
 * `unknown`. The project's `package.json` and HEAD are never consulted here;
 * an installed osq must not report the consumer's identity. The result is
 * cached per resolved root so the watcher pays the git spawn at most once.
 */
export async function resolveBuildInfo(packageRoot?: string): Promise<BuildInfo> {
  const root = path.resolve(packageRoot ?? PACKAGE_ROOT);
  const cached = buildInfoCache.get(root);
  if (cached) {
    return cached;
  }

  const [version, gitTopLevel] = await Promise.all([readVersion(root), readGitTopLevel(root)]);
  const commit =
    gitTopLevel && (await sameRealPath(gitTopLevel, root))
      ? ((await readGitCommit(root)) ?? (await hashDist(root)))
      : await hashDist(root);
  const info: BuildInfo = { version, commit };
  buildInfoCache.set(root, info);
  return info;
}

/** Newest `mtimeMs` among every file below `dir`, or 0 when none exist. */
async function newestMtimeMs(dir: string): Promise<number> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  let newest = 0;
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, await newestMtimeMs(full));
    } else if (entry.isFile()) {
      const stat = await fs.stat(full).catch(() => null);
      if (stat) {
        newest = Math.max(newest, stat.mtimeMs);
      }
    }
  }
  return newest;
}

/** The one line every stale-build refusal prints, byte for byte. */
export const STALE_BUILD_MESSAGE =
  "osq build is stale: src/ is newer than dist/. Run 'npm run build' or pass --allow-stale.";

/** Thrown by the in-run stale check so the watcher stops without an error line. */
export class StaleBuildError extends Error {
  constructor() {
    super(STALE_BUILD_MESSAGE);
    this.name = 'StaleBuildError';
  }
}

export interface FindStaleBuildOptions {
  allowStale?: boolean;
  packageRoot?: string;
  /** Newest `dist/` mtime read at watcher start; walks `dist/` when omitted. */
  distMtimeMs?: number;
}

/** Package root of the running osq build, for callers outside this module. */
export function osqPackageRoot(): string {
  return PACKAGE_ROOT;
}

/** Newest `mtimeMs` under a package root's `dist/`, or 0 when it has none. */
export async function newestDistMtimeMs(packageRoot?: string): Promise<number> {
  const root = packageRoot ? path.resolve(packageRoot) : PACKAGE_ROOT;
  return newestMtimeMs(path.join(root, 'dist'));
}

/**
 * The stale line when the package root's `src/` is newer than its `dist/`,
 * otherwise null. Skips an installed package with no `src/`, a run from
 * TypeScript source, and any call with `allowStale`. Compares against
 * `distMtimeMs` when supplied so an in-run pass keeps using the build the
 * watcher loaded at start. Prints nothing and exits nothing.
 */
export async function findStaleBuild(options: FindStaleBuildOptions = {}): Promise<string | null> {
  if (options.allowStale === true) {
    return null;
  }

  // Executing from TypeScript source means the running code *is* the latest
  // source, so there is no compiled output that can be stale. An explicit
  // `packageRoot` (tests, diagnostics) always performs the comparison.
  if (options.packageRoot === undefined && RUNNING_FROM_SOURCE) {
    return null;
  }

  const packageRoot = options.packageRoot ? path.resolve(options.packageRoot) : PACKAGE_ROOT;
  const srcDir = path.join(packageRoot, 'src');
  const srcStat = await fs.stat(srcDir).catch(() => null);
  if (!srcStat?.isDirectory()) {
    return null;
  }

  const srcNewest = await newestMtimeMs(srcDir);
  const distNewest = options.distMtimeMs ?? (await newestDistMtimeMs(packageRoot));
  return srcNewest > distNewest ? STALE_BUILD_MESSAGE : null;
}

/**
 * Refuse to run a compiled osq build whose `dist/` is older than `src/` when
 * started from a repository checkout. An installed package carries no `src/`
 * and is never considered stale. Prints exactly one error line and exits with
 * code 1 when stale, so a developer rebuilds instead of debugging a phantom.
 */
export async function checkStaleBuild(options: FindStaleBuildOptions = {}): Promise<void> {
  const stale = await findStaleBuild(options);
  if (stale !== null) {
    console.error(stale);
    process.exit(1);
  }
}
