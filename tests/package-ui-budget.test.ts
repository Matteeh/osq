import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const UI_DIST = path.join(ROOT, 'ui', 'dist');
const INDEX = path.join(UI_DIST, 'index.html');
const MAX_BYTES = 1_000_000;

/** Recursively collect regular files, never following symlinks or listing dirs. */
async function listRegularFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      files.push(...(await listRegularFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

/** Sum the byte size of each regular file. */
async function sumBytes(files: readonly string[]): Promise<number> {
  let total = 0;
  for (const file of files) {
    total += (await fs.stat(file)).size;
  }
  return total;
}

describe('staged dashboard asset budget', () => {
  it('stages the dashboard index below the one-million-byte budget', async () => {
    const stat = await fs.stat(INDEX).catch(() => null);
    assert.ok(
      stat?.isFile(),
      `staged dashboard index is missing at ${path.relative(ROOT, INDEX)}; run pnpm build before verifying`,
    );

    const files = await listRegularFiles(UI_DIST);
    const total = await sumBytes(files);
    assert.ok(
      total <= MAX_BYTES,
      `staged ui/dist regular files total ${total} bytes, exceeding the ${MAX_BYTES}-byte budget`,
    );
  });
});
