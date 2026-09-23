import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  listNamedPaths,
  missingNamedPaths,
  tokenizeVerifyCommand,
} from '../src/core/spec/verify-paths.js';

describe('verify path extraction', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-verify-paths-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('keeps a quoted operand as one token', () => {
    assert.deepEqual(tokenizeVerifyCommand('node --test "tests/my test.ts"'), [
      'node',
      '--test',
      'tests/my test.ts',
    ]);
  });

  it('names a quoted path operand', () => {
    assert.deepEqual(listNamedPaths('node --test "tests/my test.ts"'), ['tests/my test.ts']);
  });

  it('ignores --import tsx', () => {
    assert.deepEqual(listNamedPaths('node --import tsx --test tests/a.test.ts'), [
      'tests/a.test.ts',
    ]);
  });

  it('ignores KEY=value assignments', () => {
    assert.deepEqual(listNamedPaths('node --test KEY=value tests/a.test.ts'), ['tests/a.test.ts']);
  });

  it('ignores URLs', () => {
    assert.deepEqual(listNamedPaths('node fetch https://example.com/a.ts'), []);
  });

  it('ignores a bare first token and a pathless command', () => {
    assert.deepEqual(listNamedPaths('pnpm verify'), []);
    assert.deepEqual(listNamedPaths('node verify.cjs'), []);
  });

  it('names a path-shaped first token', () => {
    assert.deepEqual(listNamedPaths('bin/verify.sh --quiet'), ['bin/verify.sh']);
  });

  it('reports a glob operand matching no file as missing', async () => {
    await fs.mkdir(path.join(tmpDir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'tests', 'a.test.ts'), '// a\n', 'utf8');

    assert.deepEqual(await missingNamedPaths(tmpDir, 'node --test tests/*.test.ts'), []);
    assert.deepEqual(await missingNamedPaths(tmpDir, 'node --test tests/none-*.test.ts'), [
      'tests/none-*.test.ts',
    ]);
  });

  it('reports a missing exact operand once and keeps command order', async () => {
    await fs.writeFile(path.join(tmpDir, 'present.cjs'), '// present\n', 'utf8');
    assert.deepEqual(
      await missingNamedPaths(tmpDir, 'node present.cjs tests/one.ts tests/one.ts tests/two.ts'),
      ['tests/one.ts', 'tests/two.ts'],
    );
  });
});
