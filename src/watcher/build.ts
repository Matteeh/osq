import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
 * Read the `version` field from `package.json`. Prefers the project root the
 * watcher is running against and falls back to the osq package itself, so an
 * installed consumer that carries no `package.json` still reports a version.
 */
async function readVersion(projectRoot: string): Promise<string> {
  const candidates = [
    path.join(projectRoot, 'package.json'),
    path.join(PACKAGE_ROOT, 'package.json'),
  ];

  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(candidate, 'utf8');
      const parsed = JSON.parse(raw) as { version?: unknown };
      if (typeof parsed.version === 'string' && parsed.version.trim().length > 0) {
        return parsed.version.trim();
      }
    } catch {
      // Missing or malformed file: try the next candidate.
    }
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

/** Short git commit for `cwd`, or `null` when git is missing / not a repo. */
function readGitCommit(cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('git', ['rev-parse', '--short', 'HEAD'], { cwd }, (error, stdout) => {
      if (error) {
        resolve(null);
        return;
      }
      const commit = String(stdout).trim();
      resolve(commit.length > 0 ? commit : null);
    });
  });
}

/**
 * Resolve the active osq build identity. Version comes from `package.json`;
 * the commit is the short git SHA when available, otherwise a hash of `dist/`,
 * otherwise `unknown`. The result is cached per resolved root so the watcher
 * pays the git spawn at most once.
 */
export async function resolveBuildInfo(projectRoot?: string): Promise<BuildInfo> {
  const root = path.resolve(projectRoot ?? PACKAGE_ROOT);
  const cached = buildInfoCache.get(root);
  if (cached) {
    return cached;
  }

  const [version, gitCommit] = await Promise.all([readVersion(root), readGitCommit(root)]);
  const commit = gitCommit ?? (await hashDist(root));
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

export interface CheckStaleBuildOptions {
  allowStale?: boolean;
  packageRoot?: string;
}

/**
 * Refuse to run a compiled osq build whose `dist/` is older than `src/` when
 * started from a repository checkout. An installed package carries no `src/`
 * and is never considered stale. Prints exactly one error line and exits with
 * code 1 when stale, so a developer rebuilds instead of debugging a phantom.
 */
export async function checkStaleBuild(options: CheckStaleBuildOptions = {}): Promise<void> {
  if (options.allowStale === true) {
    return;
  }

  // Executing from TypeScript source means the running code *is* the latest
  // source, so there is no compiled output that can be stale. An explicit
  // `packageRoot` (tests, diagnostics) always performs the comparison.
  if (options.packageRoot === undefined && RUNNING_FROM_SOURCE) {
    return;
  }

  const packageRoot = options.packageRoot ? path.resolve(options.packageRoot) : PACKAGE_ROOT;
  const srcDir = path.join(packageRoot, 'src');
  const srcStat = await fs.stat(srcDir).catch(() => null);
  if (!srcStat?.isDirectory()) {
    return;
  }

  const srcNewest = await newestMtimeMs(srcDir);
  const distNewest = await newestMtimeMs(path.join(packageRoot, 'dist'));
  if (srcNewest > distNewest) {
    console.error(
      "osq build is stale: src/ is newer than dist/. Run 'npm run build' or pass --allow-stale.",
    );
    process.exit(1);
  }
}
