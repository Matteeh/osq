import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { scaffoldProject } from '../src/core/foundation/init.js';

describe('planning consumer guidance', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-init-planning-guidance-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('generates a config with no required planner model', async () => {
    await scaffoldProject(tmpDir);
    const config = await fs.readFile(path.join(tmpDir, 'osq.config.ts'), 'utf8');

    assert.equal(config.includes('planner'), false, 'generated config must not require a planner');
    assert.match(config, /harness:/);
  });
});
