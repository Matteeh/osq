import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkLineBudget } from './line-budget-check.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SRC_DIR = path.join(ROOT, 'src');
const UI_SRC_DIR = path.join(ROOT, 'packages', 'ui', 'src');
const MAX_LINES = 250;

/** Authored UI source files, including CSS, that must stay within the budget. */
const UI_SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.css']);

/**
 * Explicit allow list of oversized legacy modules, keyed by their path under
 * `src/`. This list only shrinks: remove an entry once its file is split back
 * within the budget. A path that no longer exists, or whose file is within
 * the budget, fails the source line budget case below.
 */
const ALLOW_LIST = [
  'core/report/report.ts',
  'core/spec/linter.ts',
  'core/status/show.ts',
  'core/spec/delta.ts',
  'harness/opencode/opencode.ts',
  'harness/types.ts',
  'watcher/loop.ts',
  'harness/agy/agy.ts',
  'core/spec/migrate.ts',
  'cli/report.ts',
  'core/spec/parser.ts',
];

/** Recursively collect authored `.ts`, `.tsx`, and `.css` files under `dir`. */
async function listUiSourceFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listUiSourceFiles(fullPath)));
    } else if (
      entry.isFile() &&
      UI_SOURCE_EXTENSIONS.has(path.extname(entry.name)) &&
      !entry.name.endsWith('.d.ts')
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('source line budget', () => {
  it('keeps every non-allow-listed source file at or under 250 lines', async () => {
    const violations = await checkLineBudget(SRC_DIR, ALLOW_LIST, MAX_LINES);

    assert.deepEqual(
      violations,
      [],
      `Source files exceed the ${MAX_LINES}-line budget:\n${violations.join('\n')}`,
    );
  });
});

describe('UI source line budget', () => {
  it('keeps every authored UI source file at or under 250 lines', async () => {
    const files = await listUiSourceFiles(UI_SRC_DIR);
    const violations: string[] = [];

    for (const file of files) {
      const source = await fs.readFile(file, 'utf8');
      const lineCount = source.split('\n').length;
      if (lineCount > MAX_LINES) {
        violations.push(`${path.relative(ROOT, file)} has ${lineCount} lines (max ${MAX_LINES})`);
      }
    }

    assert.deepEqual(
      violations,
      [],
      `UI source files exceed the ${MAX_LINES}-line budget:\n${violations.join('\n')}`,
    );
  });
});
