import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CLI_DIR = path.join(ROOT, 'src', 'cli');

/** Recursively collect every `.ts` file under `dir`. */
async function listTypeScriptFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTypeScriptFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('no command ends the process', () => {
  it('finds no process.exit in any file under src/cli', async () => {
    const offenders: string[] = [];
    for (const file of await listTypeScriptFiles(CLI_DIR)) {
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('process.exit(')) offenders.push(path.relative(ROOT, file));
    }

    assert.deepEqual(
      offenders,
      [],
      `Commands must throw a CommandError instead of ending the process:\n${offenders.join('\n')}`,
    );
  });
});
