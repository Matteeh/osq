import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC_DIR = path.resolve(import.meta.dirname, '..', 'src');
const DEFINITION = 'src/core/spec/parser.ts';
const READER = 'src/core/spec/capability-impact.ts';

/** Every `.ts` file under `directory`, as project-root-relative POSIX paths. */
async function typescriptFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await typescriptFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(path.relative(path.join(SRC_DIR, '..'), full).split(path.sep).join('/'));
    }
  }
  return files;
}

describe('one code ownership reader', () => {
  it('keeps parseCodeOwnership in its definition and its one reader', async () => {
    const files = await typescriptFiles(SRC_DIR);
    const callers: string[] = [];
    for (const file of files) {
      const content = await fs.readFile(path.join(SRC_DIR, '..', file), 'utf8');
      if (content.includes('parseCodeOwnership(')) callers.push(file);
    }

    assert.deepEqual(callers.sort(), [READER, DEFINITION]);
  });
});
