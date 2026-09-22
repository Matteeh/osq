import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { hashChangeFolder, normalizeTasksMd, verifyFolderHash } from '../src/core/spec/hasher.js';

describe('Folder Hasher', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-hash-test-'));
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Hash Feature');
    specFolder = spec.folderPath;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('produces deterministic SHA-256 hash for identical folder contents', async () => {
    const hash1 = await hashChangeFolder(specFolder);
    const hash2 = await hashChangeFolder(specFolder);

    assert.ok(hash1.startsWith('sha256:'));
    assert.equal(hash1, hash2);
  });

  it('ignores .run directory and its marker files completely', async () => {
    const initialHash = await hashChangeFolder(specFolder);

    // Create markers inside .run/
    const runDir = path.join(specFolder, '.run');
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'approved'), initialHash);
    await fs.writeFile(path.join(runDir, '1.pid'), '12345');

    const hashAfterMarkers = await hashChangeFolder(specFolder);
    assert.equal(initialHash, hashAfterMarkers);
  });

  it('normalizeTasksMd normalizes checked boxes to unchecked boxes', () => {
    const input = '# Tasks\n\n- [x] 1. First\n- [X] 2. Second\n- [ ] 3. Third\n';
    const normalized = normalizeTasksMd(input);
    assert.equal(normalized, '# Tasks\n\n- [ ] 1. First\n- [ ] 2. Second\n- [ ] 3. Third\n');
  });

  it('ticking a task checkbox in tasks.md produces identical hash', async () => {
    const initialHash = await hashChangeFolder(specFolder);

    const tasksMdPath = path.join(specFolder, 'tasks.md');
    const content = await fs.readFile(tasksMdPath, 'utf8');
    const tickedContent = content.replace('- [ ] 1.', '- [x] 1.');
    await fs.writeFile(tasksMdPath, tickedContent, 'utf8');

    const hashAfterTick = await hashChangeFolder(specFolder);
    assert.equal(initialHash, hashAfterTick);
  });

  it('deleting or modifying a task line in tasks.md changes the hash', async () => {
    const initialHash = await hashChangeFolder(specFolder);

    const tasksMdPath = path.join(specFolder, 'tasks.md');
    await fs.appendFile(tasksMdPath, '\n- [ ] 2. Extra task line\n', 'utf8');

    const modifiedHash = await hashChangeFolder(specFolder);
    assert.notEqual(initialHash, modifiedHash);
  });

  it('changes hash when any task or spec file is modified', async () => {
    const initialHash = await hashChangeFolder(specFolder);

    const taskPath = path.join(specFolder, 'tasks', '1.md');
    await fs.appendFile(taskPath, '\n# modification');

    const modifiedHash = await hashChangeFolder(specFolder);
    assert.notEqual(initialHash, modifiedHash);
  });

  it('normalizes CRLF and LF to yield identical hashes across platforms', async () => {
    const taskPath = path.join(specFolder, 'tasks', '1.md');

    await fs.writeFile(taskPath, 'Line 1\nLine 2\n');
    const lfHash = await hashChangeFolder(specFolder);

    await fs.writeFile(taskPath, 'Line 1\r\nLine 2\r\n');
    const crlfHash = await hashChangeFolder(specFolder);

    assert.equal(lfHash, crlfHash);
  });

  it('verifyFolderHash returns true if and only if folder hash matches approved hash', async () => {
    const hash = await hashChangeFolder(specFolder);
    assert.equal(await verifyFolderHash(specFolder, hash), true);
    assert.equal(await verifyFolderHash(specFolder, 'sha256:invalid'), false);
  });

  it('ignores additions, edits, and removals of the root plan-prompt.md', async () => {
    const initialHash = await hashChangeFolder(specFolder);
    const promptPath = path.join(specFolder, 'plan-prompt.md');

    await fs.writeFile(promptPath, 'opening prompt bytes\n', 'utf8');
    assert.equal(
      await hashChangeFolder(specFolder),
      initialHash,
      'adding the prompt leaves the hash',
    );

    await fs.writeFile(promptPath, 'refreshed prompt bytes\n', 'utf8');
    assert.equal(
      await hashChangeFolder(specFolder),
      initialHash,
      'editing the prompt leaves the hash',
    );

    await fs.rm(promptPath);
    assert.equal(
      await hashChangeFolder(specFolder),
      initialHash,
      'removing the prompt leaves the hash',
    );
  });

  it('covers a nested plan-prompt.md as authored content', async () => {
    const initialHash = await hashChangeFolder(specFolder);
    const nested = path.join(specFolder, 'notes', 'plan-prompt.md');
    await fs.mkdir(path.dirname(nested), { recursive: true });
    await fs.writeFile(nested, 'authored note\n', 'utf8');

    assert.notEqual(await hashChangeFolder(specFolder), initialHash);
  });
});
