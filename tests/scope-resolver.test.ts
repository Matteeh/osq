import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { computeTaskScopeHash } from '../src/core/scope-hash.js';
import { SCOPE_RESOLVER_VERSION, resolveScope } from '../src/core/scope.js';

const SRC_DIR = path.resolve(fileURLToPath(new URL('../src', import.meta.url)));

describe('resolveScope', () => {
  let tmpDir: string;
  let outsidePath: string;
  let outsideName: string;

  const absolute = (relativePath: string): string => path.join(tmpDir, relativePath);

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-scope-resolver-'));
    await fs.mkdir(path.join(tmpDir, 'src', 'core', 'deep'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, 'tests', 'nested'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, 'docs'), { recursive: true });
    await fs.writeFile(absolute('src/core/queue-report.ts'), 'export const base = 1;\n', 'utf8');
    await fs.writeFile(
      absolute('src/core/queue-report-extra.ts'),
      'export const extra = 2;\n',
      'utf8',
    );
    await fs.writeFile(absolute('src/core/other.ts'), 'export const other = 0;\n', 'utf8');
    await fs.writeFile(absolute('src/core/deep/nested.ts'), 'export const nested = 3;\n', 'utf8');
    await fs.writeFile(absolute('tests/a.test.ts'), 'export const a = 1;\n', 'utf8');
    await fs.writeFile(absolute('tests/nested/b.test.ts'), 'export const b = 2;\n', 'utf8');
    await fs.writeFile(absolute('docs/readme.md'), '# docs\n', 'utf8');

    outsideName = `${path.basename(tmpDir)}-outside.ts`;
    outsidePath = path.join(path.dirname(tmpDir), outsideName);
    await fs.writeFile(outsidePath, 'export const secret = 1;\n', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.rm(outsidePath, { force: true });
  });

  it('resolves an exact path to its readable absolute file path', async () => {
    const result = await resolveScope(tmpDir, ['src/core/other.ts']);

    assert.deepEqual(result, [
      { relativePath: 'src/core/other.ts', absolutePath: absolute('src/core/other.ts') },
    ]);
  });

  it('retains a missing exact path with a null file path', async () => {
    const result = await resolveScope(tmpDir, ['src/core/missing.ts']);

    assert.deepEqual(result, [{ relativePath: 'src/core/missing.ts', absolutePath: null }]);
  });

  it('expands a segment * within a single directory level', async () => {
    const result = await resolveScope(tmpDir, ['src/core/queue-report*.ts']);

    assert.deepEqual(
      result.map((entry) => entry.relativePath),
      ['src/core/queue-report-extra.ts', 'src/core/queue-report.ts'],
    );
    assert.ok(result.every((entry) => entry.absolutePath !== null));
  });

  it('expands ? to a single non-separator character', async () => {
    const result = await resolveScope(tmpDir, ['src/core/?ther.ts']);

    assert.deepEqual(
      result.map((entry) => entry.relativePath),
      ['src/core/other.ts'],
    );
  });

  it('expands ** across nested directories', async () => {
    const result = await resolveScope(tmpDir, ['src/core/**/*.ts']);

    assert.deepEqual(
      result.map((entry) => entry.relativePath),
      [
        'src/core/deep/nested.ts',
        'src/core/other.ts',
        'src/core/queue-report-extra.ts',
        'src/core/queue-report.ts',
      ],
    );
  });

  it('expands a trailing-directory form recursively', async () => {
    const result = await resolveScope(tmpDir, ['src/core/']);

    assert.deepEqual(
      result.map((entry) => entry.relativePath),
      [
        'src/core/deep/nested.ts',
        'src/core/other.ts',
        'src/core/queue-report-extra.ts',
        'src/core/queue-report.ts',
      ],
    );
  });

  it('deduplicates an exact entry also matched by a glob', async () => {
    const result = await resolveScope(tmpDir, [
      'src/core/queue-report.ts',
      'src/core/queue-report*.ts',
    ]);

    assert.deepEqual(
      result.map((entry) => entry.relativePath),
      ['src/core/queue-report-extra.ts', 'src/core/queue-report.ts'],
    );
  });

  it('contributes no entry for an unmatched glob', async () => {
    assert.deepEqual(await resolveScope(tmpDir, ['src/nope/*.ts']), []);
  });

  it('returns empty for an empty scope', async () => {
    assert.deepEqual(await resolveScope(tmpDir, []), []);
  });

  it('normalizes ./ prefixes and platform separators', async () => {
    const dotted = await resolveScope(tmpDir, ['./src/core/other.ts']);
    const backslashed = await resolveScope(tmpDir, ['src\\core\\other.ts']);

    assert.deepEqual(dotted, backslashed);
    assert.deepEqual(
      dotted.map((entry) => entry.relativePath),
      ['src/core/other.ts'],
    );
  });

  it('is independent of declaration order and produces identical bytes', async () => {
    const scope = ['tests/**', 'src/core/other.ts', 'src/core/queue-report*.ts'];
    const first = await resolveScope(tmpDir, scope);
    const second = await resolveScope(tmpDir, [...scope].reverse());

    assert.deepEqual(first, second);
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    const paths = first.map((entry) => entry.relativePath);
    assert.deepEqual(paths, [...paths].sort());
  });

  it('never resolves outside the project tree', async () => {
    const exact = await resolveScope(tmpDir, [`../${outsideName}`]);

    assert.deepEqual(exact, [{ relativePath: `../${outsideName}`, absolutePath: null }]);
    assert.deepEqual(await resolveScope(tmpDir, ['..']), [
      { relativePath: '..', absolutePath: null },
    ]);
  });

  it('does not read a file outside the project root when hashing', async () => {
    const hashed = await computeTaskScopeHash(tmpDir, [`../${outsideName}`]);

    assert.deepEqual(hashed.fileHashes, { [`../${outsideName}`]: null });
  });
});

describe('computeTaskScopeHash resolver projection', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-scope-projection-'));
    await fs.mkdir(path.join(tmpDir, 'src', 'core'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'src', 'core', 'queue-report.ts'), 'base\n', 'utf8');
    await fs.writeFile(
      path.join(tmpDir, 'src', 'core', 'queue-report-extra.ts'),
      'extra\n',
      'utf8',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('keys the aggregate by expanded resolver paths rather than glob text', async () => {
    const before = await computeTaskScopeHash(tmpDir, ['src/core/queue-report*.ts']);

    assert.deepEqual(Object.keys(before.fileHashes).sort(), [
      'src/core/queue-report-extra.ts',
      'src/core/queue-report.ts',
    ]);
    assert.match(before.fileHashes['src/core/queue-report.ts'] ?? '', /^sha256:[0-9a-f]{64}$/);

    await fs.writeFile(path.join(tmpDir, 'src', 'core', 'queue-report-new.ts'), 'new\n', 'utf8');
    const after = await computeTaskScopeHash(tmpDir, ['src/core/queue-report*.ts']);

    assert.notEqual(before.hash, after.hash);
    assert.ok('src/core/queue-report-new.ts' in after.fileHashes);
  });
});

describe('SCOPE_RESOLVER_VERSION', () => {
  it('exposes resolver version 2', () => {
    assert.equal(SCOPE_RESOLVER_VERSION, 2);
  });
});

describe('linter resolver cut-over', () => {
  it('removes the legacy glob matcher and its private tree walker', async () => {
    const source = await fs.readFile(path.join(SRC_DIR, 'core', 'linter.ts'), 'utf8');

    assert.doesNotMatch(source, /globToRegExp/);
    assert.doesNotMatch(source, /listExistingTestFiles/);
    assert.doesNotMatch(source, /touchedTestFiles/);
    assert.match(source, /resolveScope/);
  });
});
