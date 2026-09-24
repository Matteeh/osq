import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { writeBriefAndManifest } from '../src/cli/plan-queue.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { createChange, createProject, readManifest } from './planning-observed-helpers.js';

describe('manifest creation time', () => {
  let root = '';

  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = '';
  });

  it('writes a marked creation time and no approval time from osq plan', async () => {
    root = await createProject();
    const change = await createChange(root, 'Planned');
    await writeBriefAndManifest(root, DEFAULT_CONFIG, change.folderPath, null, '# brief\n');

    const manifest = await readManifest(change.folderPath);
    assert.equal(typeof manifest.createdAt, 'string');
    assert.ok(!Number.isNaN(Date.parse(manifest.createdAt as string)));
    assert.equal(manifest.createdAtSource, 'created');
    assert.equal(Object.hasOwn(manifest, 'approvedAt'), false);
  });

  it('keeps the plan-time creation time across approval and reapproval', async () => {
    root = await createProject();
    const change = await createChange(root, 'Approved');
    await writeBriefAndManifest(root, DEFAULT_CONFIG, change.folderPath, null, '# brief\n');
    const planned = await readManifest(change.folderPath);

    await approveSpec(root, change.specId, DEFAULT_CONFIG);
    const first = await readManifest(change.folderPath);
    assert.equal(first.createdAt, planned.createdAt);
    assert.equal(first.createdAtSource, 'created');
    assert.equal(typeof first.approvedAt, 'string');

    // Amend the proposal and approve again; the creation time must not move.
    await fs.appendFile(path.join(change.folderPath, 'proposal.md'), '\n', 'utf8');
    await approveSpec(root, change.specId, DEFAULT_CONFIG);
    const second = await readManifest(change.folderPath);
    assert.equal(second.createdAt, planned.createdAt);
    assert.equal(second.createdAtSource, 'created');
    assert.ok(Date.parse(second.approvedAt as string) >= Date.parse(first.approvedAt as string));
  });

  it('keeps an existing unmarked creation time without adding the marker', async () => {
    root = await createProject();
    const change = await createChange(root, 'Unmarked');
    const createdAt = '2020-05-06T07:08:09.000Z';
    await fs.mkdir(path.join(change.folderPath, '.run'), { recursive: true });
    await fs.writeFile(
      path.join(change.folderPath, '.run', 'manifest.json'),
      `${JSON.stringify({ createdAt })}\n`,
      'utf8',
    );

    await approveSpec(root, change.specId, DEFAULT_CONFIG);
    const manifest = await readManifest(change.folderPath);
    assert.equal(manifest.createdAt, createdAt);
    assert.equal(Object.hasOwn(manifest, 'createdAtSource'), false);
  });

  it("records the folder's marked birth time when approving without a manifest", async (t) => {
    root = await createProject();
    const change = await createChange(root, 'Birth');

    const stat = await fs.stat(change.folderPath);
    if (stat.birthtime.getTime() === 0) {
      t.skip('filesystem reports a zero folder birth time');
      return;
    }

    await approveSpec(root, change.specId, DEFAULT_CONFIG);
    const manifest = await readManifest(change.folderPath);
    assert.equal(manifest.createdAt, stat.birthtime.toISOString());
    assert.equal(manifest.createdAtSource, 'created');
  });
});
