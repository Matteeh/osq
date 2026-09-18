import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveSpec, findSpecFolder } from '../src/core/approve.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { hashChangeFolder } from '../src/core/hasher.js';
import { scaffoldProject } from '../src/core/init.js';
import { createNewSpec } from '../src/core/new.js';

describe('osq approve', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-approve-test-'));
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Order Flow');
    specFolder = spec.folderPath;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('findSpecFolder resolves spec folder by ID, padded number, or prefix', async () => {
    const specsDir = path.join(tmpDir, DEFAULT_CONFIG.paths.specs);
    const byId = await findSpecFolder(specsDir, '001');
    assert.equal(byId, specFolder);

    const byNum = await findSpecFolder(specsDir, '1');
    assert.equal(byNum, specFolder);

    const byPrefix = await findSpecFolder(specsDir, '001-order');
    assert.equal(byPrefix, specFolder);

    await assert.rejects(async () => {
      await findSpecFolder(specsDir, '999');
    }, /Spec "999" not found/);
  });

  it('approveSpec lints, hashes, and writes .run/approved for valid spec', async () => {
    const result = await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    assert.equal(result.specId, '001');
    assert.ok(result.hash.startsWith('sha256:'));

    const approvedMarkerPath = path.join(specFolder, '.run', 'approved');
    const markerContent = await fs.readFile(approvedMarkerPath, 'utf8');
    assert.equal(markerContent.trim(), result.hash);

    const currentHash = await hashChangeFolder(specFolder);
    assert.equal(markerContent.trim(), currentHash);
  });

  it('approveSpec rejects spec failing lint and does not write approved marker', async () => {
    // Inject invalid verify command
    const taskPath = path.join(specFolder, 'tasks', '1.md');
    await fs.writeFile(
      taskPath,
      `---
title: Broken task
verify: pnpm test && pnpm lint
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] fails`,
    );

    await assert.rejects(async () => {
      await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    }, /Lint failed/);

    const approvedMarkerExists = await fs
      .stat(path.join(specFolder, '.run', 'approved'))
      .then(() => true)
      .catch(() => false);
    assert.equal(approvedMarkerExists, false);
  });

  it('re-approves an existing spec after modifications', async () => {
    const firstResult = await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    // Modify spec cleanly
    const taskPath = path.join(specFolder, 'tasks', '1.md');
    await fs.appendFile(taskPath, '\n<!-- modified -->');

    const secondResult = await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    assert.notEqual(firstResult.hash, secondResult.hash);

    const approvedMarker = await fs.readFile(path.join(specFolder, '.run', 'approved'), 'utf8');
    assert.equal(approvedMarker.trim(), secondResult.hash);
  });
});
