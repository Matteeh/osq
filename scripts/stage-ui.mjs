#!/usr/bin/env node
/**
 * Stage the production UI build into the package-root `ui/dist` directory used
 * by `files` and `resolveUiDir()`.
 *
 * Default mode removes only `ui/dist`, recreates it, and copies the regular
 * files produced under `packages/ui/dist`. Symbolic links and anything that
 * would resolve outside either root are never followed, so staging can only
 * publish build output.
 *
 * `--clean` removes both generated UI output directories and exits. It is the
 * supported reset path before re-running `pnpm verify`.
 */
import { copyFile, lstat, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceDir = path.join(repoRoot, 'packages', 'ui', 'dist');
const targetDir = path.join(repoRoot, 'ui', 'dist');

const clean = process.argv.includes('--clean');

/** True only for a path that stays below `root` after resolution. */
function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function pathExists(target) {
  return lstat(target)
    .then(() => true)
    .catch(() => false);
}

/** Recursively copy regular files, skipping symlinks and non-regular entries. */
async function copyRegularFiles(from, to) {
  const entries = await readdir(from, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(from, entry.name);
    if (!isInside(sourceDir, sourcePath)) continue;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      await mkdir(path.join(to, entry.name), { recursive: true });
      await copyRegularFiles(sourcePath, path.join(to, entry.name));
    } else if (entry.isFile()) {
      await copyFile(sourcePath, path.join(to, entry.name));
    }
  }
}

async function main() {
  if (clean) {
    await rm(targetDir, { recursive: true, force: true });
    await rm(sourceDir, { recursive: true, force: true });
    process.stdout.write('Removed generated UI output (ui/dist, packages/ui/dist)\n');
    return;
  }

  if (!(await pathExists(sourceDir))) {
    throw new Error(
      `UI build output is missing at ${path.relative(repoRoot, sourceDir)}; run the UI build first`,
    );
  }

  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  await copyRegularFiles(sourceDir, targetDir);
  process.stdout.write(`Staged UI build into ${path.relative(repoRoot, targetDir)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
