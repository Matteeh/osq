import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { scaffoldProject } from '../src/core/init.js';
import { createNewSpec, getNextSpecNumber, slugify } from '../src/core/new.js';

describe('osq new', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-new-test-'));
    await scaffoldProject(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('slugify converts titles to valid kebab-case folder names', () => {
    assert.equal(slugify('Order Cancellation'), 'order-cancellation');
    assert.equal(slugify('Hello, World!'), 'hello-world');
    assert.equal(slugify('  multi   space  '), 'multi-space');
  });

  it('getNextSpecNumber correctly increments existing spec numbers including archive', async () => {
    const specsDir = path.join(tmpDir, 'specs');
    const first = await getNextSpecNumber(specsDir);
    assert.equal(first, '001');

    await fs.mkdir(path.join(specsDir, 'archive', '001-test'), { recursive: true });
    const second = await getNextSpecNumber(specsDir);
    assert.equal(second, '002');

    await fs.mkdir(path.join(specsDir, '042-feature'));
    const next = await getNextSpecNumber(specsDir);
    assert.equal(next, '043');
  });

  it('createNewSpec generates numbered change folder from template with updated title', async () => {
    const result = await createNewSpec(tmpDir, 'Order Cancellation');

    assert.equal(result.specId, '001');
    assert.equal(result.folderName, '001-order-cancellation');
    assert.ok(
      result.folderPath.endsWith(path.join('openspec', 'changes', '001-order-cancellation')),
    );

    const proposalMd = await fs.readFile(path.join(result.folderPath, 'proposal.md'), 'utf8');
    assert.ok(proposalMd.includes('title: Order Cancellation'));

    const tasksMdExists = await fs
      .stat(path.join(result.folderPath, 'tasks.md'))
      .then(() => true)
      .catch(() => false);
    assert.equal(tasksMdExists, true);

    const task1Exists = await fs
      .stat(path.join(result.folderPath, 'tasks', '1.md'))
      .then(() => true)
      .catch(() => false);
    assert.equal(task1Exists, true);
  });

  it('createNewSpec respects options.specsDirName override', async () => {
    const result = await createNewSpec(tmpDir, 'Custom Spec', { specsDirName: 'custom-specs' });
    assert.equal(result.specId, '001');
    assert.ok(result.folderPath.endsWith(path.join('custom-specs', '001-custom-spec')));

    const proposalMd = await fs.readFile(path.join(result.folderPath, 'proposal.md'), 'utf8');
    assert.ok(proposalMd.includes('title: Custom Spec'));

    const task1Exists = await fs
      .stat(path.join(result.folderPath, 'tasks', '1.md'))
      .then(() => true)
      .catch(() => false);
    assert.equal(task1Exists, true);
  });

  it('createNewSpec rejects empty or invalid spec names', async () => {
    await assert.rejects(async () => {
      await createNewSpec(tmpDir, '   ');
    }, /Spec name cannot be empty/);
  });
});
