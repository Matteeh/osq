import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  DEFAULT_UNGOVERNED,
  validateUngovernedConfig,
} from '../src/core/foundation/config-ungoverned.js';
import { DEFAULT_CONFIG, defineConfig, loadConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';

const UNGOVERNED_ERROR = /ungoverned must be a list of path globs/;
const INIT_COMMENT_LINES = [
  '  // osq governs every path except these; a human edits them directly on the',
  '  // default branch with no change. [] governs everything.',
  "  // ungoverned: ['README*', 'docs/**', 'LICENSE*', '.gitignore', '.env*'],",
];

describe('Ungoverned paths configuration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-ungoverned-config-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('Default ungoverned paths: defineConfig({}) resolves the default list', () => {
    const expected = ['README*', 'docs/**', 'LICENSE*', '.gitignore', '.env*'];
    assert.deepEqual(DEFAULT_UNGOVERNED, expected);
    assert.deepEqual(validateUngovernedConfig(undefined), expected);
    assert.deepEqual(defineConfig({}).ungoverned, expected);
    assert.deepEqual(DEFAULT_CONFIG.ungoverned, expected);
  });

  it('A project list replaces the default: the resolved ungoverned is the row result', () => {
    const rows: Array<{ ungoverned: unknown; result: readonly string[] }> = [
      { ungoverned: ['notes/**'], result: ['notes/**'] },
      { ungoverned: [' notes/** ', 'NOTICE*'], result: ['notes/**', 'NOTICE*'] },
      { ungoverned: [], result: [] },
    ];
    for (const row of rows) {
      assert.deepEqual(
        defineConfig({ ungoverned: row.ungoverned } as never).ungoverned,
        row.result,
        `defineConfig must resolve ${JSON.stringify(row.ungoverned)}`,
      );
      assert.deepEqual(
        validateUngovernedConfig(row.ungoverned),
        row.result,
        `validateUngovernedConfig must resolve ${JSON.stringify(row.ungoverned)}`,
      );
    }
  });

  it('Invalid ungoverned: defineConfig throws for anything but an array of non-empty strings', () => {
    const invalid: unknown[] = ["'notes/**'", ['notes/**', ''], ['notes/**', 5], {}];
    for (const value of invalid) {
      assert.throws(
        () => defineConfig({ ungoverned: value } as never),
        UNGOVERNED_ERROR,
        `defineConfig must reject ${JSON.stringify(value)}`,
      );
      assert.throws(
        () => validateUngovernedConfig(value),
        UNGOVERNED_ERROR,
        `validateUngovernedConfig must reject ${JSON.stringify(value)}`,
      );
    }
  });

  it('Init shows the ungoverned key: the scaffolded config holds the comment lines and loads the default', async () => {
    await scaffoldProject(tmpDir);
    const text = await fs.readFile(path.join(tmpDir, 'osq.config.ts'), 'utf8');
    const lines = text.split('\n');
    const formatCommand = lines.indexOf(
      "  // gates: { formatCommand: 'npx prettier --write {files}' },",
    );
    assert.ok(formatCommand >= 0, 'the scaffolded config holds the format command example');
    assert.equal(
      lines.slice(formatCommand + 1, formatCommand + 1 + INIT_COMMENT_LINES.length).join('\n'),
      INIT_COMMENT_LINES.join('\n'),
    );

    const config = await loadConfig(tmpDir);
    assert.deepEqual(config.ungoverned, DEFAULT_UNGOVERNED);
  });
});
