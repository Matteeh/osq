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

  it('getNextSpecNumber correctly increments existing spec numbers', async () => {
    const specsDir = path.join(tmpDir, 'specs');
    // Initially only _template and archive exist
    const first = await getNextSpecNumber(specsDir);
    assert.equal(first, '001');

    await fs.mkdir(path.join(specsDir, '001-test'));
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
    assert.ok(result.folderPath.endsWith(path.join('specs', '001-order-cancellation')));

    const specMd = await fs.readFile(path.join(result.folderPath, 'spec.md'), 'utf8');
    assert.ok(specMd.includes('title: Order Cancellation'));

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

  it('createNewSpec rejects empty or invalid spec names', async () => {
    await assert.rejects(async () => {
      await createNewSpec(tmpDir, '   ');
    }, /Spec name cannot be empty/);
  });
});
