import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { hashChangeFolder, verifyFolderHash } from '../src/core/hasher.js';
import { scaffoldProject } from '../src/core/init.js';
import { createNewSpec } from '../src/core/new.js';

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
});
