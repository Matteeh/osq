import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { initCommand } from '../src/cli/init.js';
import { TEMPLATES_ROOT, scaffoldProject } from '../src/core/foundation/init.js';

/** The six bundled OpenSpec files `--refresh-schema` owns. */
const SCHEMA_FILES = [
  path.join('openspec', 'config.yaml'),
  path.join('openspec', 'schemas', 'osq', 'schema.yaml'),
  path.join('openspec', 'schemas', 'osq', 'README.md'),
  path.join('openspec', 'schemas', 'osq', 'templates', 'proposal.md'),
  path.join('openspec', 'schemas', 'osq', 'templates', 'spec.md'),
  path.join('openspec', 'schemas', 'osq', 'templates', 'tasks.md'),
];

const PROPOSAL = path.join('openspec', 'schemas', 'osq', 'templates', 'proposal.md');

describe('osq init --refresh-schema', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-refresh-schema-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('refreshes a stale schema file and reports it', async () => {
    await scaffoldProject(tmpDir);
    const proposalPath = path.join(tmpDir, PROPOSAL);
    await fs.writeFile(proposalPath, '# stale local proposal\n', 'utf8');

    const result = await scaffoldProject(tmpDir, { refreshSchema: true });

    assert.deepEqual(result.refreshedFiles, [PROPOSAL]);
    assert.equal(result.existingFiles.includes(PROPOSAL), false);
    const expected = await fs.readFile(path.join(TEMPLATES_ROOT, PROPOSAL), 'utf8');
    assert.equal(await fs.readFile(proposalPath, 'utf8'), expected);
    assert.ok(result.currentFiles.includes(path.join('openspec', 'config.yaml')));
  });

  it('leaves a fully current schema untouched and reports it as current', async () => {
    await scaffoldProject(tmpDir);
    const schemaPath = path.join(tmpDir, 'openspec', 'schemas', 'osq', 'schema.yaml');
    const stamp = new Date('2000-01-01T00:00:00Z');
    await fs.utimes(schemaPath, stamp, stamp);

    const result = await scaffoldProject(tmpDir, { refreshSchema: true });

    assert.deepEqual(result.refreshedFiles, []);
    for (const relPath of SCHEMA_FILES) {
      assert.ok(result.currentFiles.includes(relPath), relPath);
      assert.equal(result.existingFiles.includes(relPath), false, relPath);
    }
    const stat = await fs.stat(schemaPath);
    assert.equal(stat.mtimeMs, stamp.getTime());
  });

  it('creates a deleted schema file and reports it as created', async () => {
    await scaffoldProject(tmpDir);
    const specPath = path.join(tmpDir, 'openspec', 'schemas', 'osq', 'templates', 'spec.md');
    await fs.rm(specPath);

    const result = await scaffoldProject(tmpDir, { refreshSchema: true });

    assert.ok(
      result.createdFiles.includes(path.join('openspec', 'schemas', 'osq', 'templates', 'spec.md')),
    );
    assert.equal(
      result.refreshedFiles.includes(
        path.join('openspec', 'schemas', 'osq', 'templates', 'spec.md'),
      ),
      false,
    );
    const expected = await fs.readFile(
      path.join(TEMPLATES_ROOT, 'openspec', 'schemas', 'osq', 'templates', 'spec.md'),
      'utf8',
    );
    assert.equal(await fs.readFile(specPath, 'utf8'), expected);
  });

  it('reports schema files as existing on a plain rerun without rewriting them', async () => {
    await scaffoldProject(tmpDir);
    const proposalPath = path.join(tmpDir, PROPOSAL);
    await fs.writeFile(proposalPath, '# local edit stays\n', 'utf8');

    const result = await scaffoldProject(tmpDir);

    for (const relPath of SCHEMA_FILES) {
      assert.ok(result.existingFiles.includes(relPath), relPath);
    }
    assert.deepEqual(result.refreshedFiles, []);
    assert.deepEqual(result.currentFiles, []);
    assert.equal(await fs.readFile(proposalPath, 'utf8'), '# local edit stays\n');
  });

  it('prints refreshed and current lines after the created and exists lines', async () => {
    await scaffoldProject(tmpDir);
    await fs.writeFile(path.join(tmpDir, PROPOSAL), '# stale local proposal\n', 'utf8');

    const lines: string[] = [];
    const original = console.log;
    console.log = ((...args: unknown[]) => {
      lines.push(args.join(' '));
    }) as typeof console.log;
    try {
      await initCommand({ cwd: tmpDir, refreshSchema: true });
    } finally {
      console.log = original;
    }

    const refreshedIndex = lines.indexOf(`  refreshed ${PROPOSAL}`);
    const currentIndex = lines.findIndex((line) => line.startsWith('  current   '));
    const existsIndex = lines.findIndex((line) => line.startsWith('  exists   '));
    assert.ok(refreshedIndex >= 0, JSON.stringify(lines));
    assert.ok(currentIndex > refreshedIndex, JSON.stringify(lines));
    assert.ok(existsIndex === -1 || refreshedIndex > existsIndex, JSON.stringify(lines));
    assert.equal(
      lines.some((line) => line.startsWith('  exists   ') && line.endsWith(PROPOSAL)),
      false,
    );
  });

  it('prints only exists lines without the flag', async () => {
    await scaffoldProject(tmpDir);

    const lines: string[] = [];
    const original = console.log;
    console.log = ((...args: unknown[]) => {
      lines.push(args.join(' '));
    }) as typeof console.log;
    try {
      await initCommand({ cwd: tmpDir });
    } finally {
      console.log = original;
    }

    assert.equal(
      lines.some((line) => line.startsWith('  refreshed ')),
      false,
    );
    assert.equal(
      lines.some((line) => line.startsWith('  current   ')),
      false,
    );
    assert.ok(lines.includes(`  exists   ${path.join('openspec', 'config.yaml')}`));
  });
});
