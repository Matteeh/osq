import assert from 'node:assert/strict';
import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const SRC_ROOT = fileURLToPath(new URL('../src', import.meta.url));

async function listFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }

  return files;
}

describe('no skipped output in src', () => {
  it('contains zero case-insensitive occurrences of "skipped" under src/', async () => {
    const files = await listFiles(SRC_ROOT);
    assert.ok(files.length > 0, 'expected to discover source files under src/');

    const offenders: string[] = [];
    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      if (/skipped/i.test(content)) {
        offenders.push(path.relative(SRC_ROOT, file));
      }
    }

    assert.deepEqual(offenders, [], `unexpected "skipped" occurrences in: ${offenders.join(', ')}`);
  });
});
