import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SRC_DIR = path.join(ROOT, 'src');

/**
 * The files that may still build change directory paths directly. Besides the
 * one resolver, the delta names `layout.ts`, the draft readers, the linter,
 * the migration engine, the CLI lint and plan commands, and the archiver.
 * Every other reader lists changes through `src/core/status/change-locations.ts`.
 */
const ALLOWED = new Set([
  'src/core/status/change-locations.ts',
  'src/core/status/layout.ts',
  'src/core/foundation/new.ts',
  'src/core/spec/migrate.ts',
  'src/core/spec/linter.ts',
  'src/cli/lint.ts',
  'src/cli/plan.ts',
  'src/watcher/archiver.ts',
]);

/** Matches a call to one of the layout path builders, but not a bare import. */
const LAYOUT_CALL = /\bget(?:Changes|Archive)Dir\s*\(/;

/** Recursively collect every non-declaration TypeScript file under `dir`. */
async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('change location readers', () => {
  it('lists changes through the change locations module, not the layout helpers', async () => {
    const violations: string[] = [];
    for (const file of await listSourceFiles(SRC_DIR)) {
      const relative = path.relative(ROOT, file).split(path.sep).join('/');
      if (ALLOWED.has(relative)) continue;
      const source = await fs.readFile(file, 'utf8');
      if (LAYOUT_CALL.test(source)) violations.push(relative);
    }

    assert.deepEqual(
      violations.sort(),
      [],
      `These files call getChangesDir or getArchiveDir instead of the change locations module:\n${violations.sort().join('\n')}`,
    );
  });
});
