import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, defineConfig, loadConfig } from '../src/core/config.js';
import type { QueueConfig } from '../src/index.js';

describe('queue configuration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-config-queue-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('accepts a complete finite non-negative queue block', () => {
    const config = defineConfig({
      queue: { maxPlanningSessions: 3, maxPlanningCost: 1.25 },
    });
    assert.deepEqual(config.queue, { maxPlanningSessions: 3, maxPlanningCost: 1.25 });

    const zero = defineConfig({ queue: { maxPlanningSessions: 0, maxPlanningCost: 0 } });
    assert.deepEqual(zero.queue, { maxPlanningSessions: 0, maxPlanningCost: 0 });
  });

  it('leaves queue absent and invents no default ceilings', () => {
    const config = defineConfig({});
    assert.equal(config.queue, undefined);
    assert.equal(DEFAULT_CONFIG.queue, undefined);
    assert.ok(!('queue' in DEFAULT_CONFIG), 'defaults must not invent a queue block');
  });

  it('rejects a partial queue block because both ceilings are required together', () => {
    assert.throws(
      () => defineConfig({ queue: { maxPlanningSessions: 1 } }),
      /queue\.maxPlanningSessions and queue\.maxPlanningCost are both required/,
    );
    assert.throws(
      () => defineConfig({ queue: { maxPlanningCost: 1 } }),
      /queue\.maxPlanningSessions and queue\.maxPlanningCost are both required/,
    );
  });

  it('rejects string, negative, NaN, and infinite values clearly', () => {
    const variants: Array<Record<string, unknown>> = [
      { maxPlanningSessions: '2', maxPlanningCost: 1 },
      { maxPlanningSessions: 2, maxPlanningCost: '1' },
      { maxPlanningSessions: -1, maxPlanningCost: 1 },
      { maxPlanningSessions: 2, maxPlanningCost: -0.5 },
      { maxPlanningSessions: Number.NaN, maxPlanningCost: 1 },
      { maxPlanningSessions: 2, maxPlanningCost: Number.NaN },
      { maxPlanningSessions: Number.POSITIVE_INFINITY, maxPlanningCost: 1 },
      { maxPlanningSessions: 2, maxPlanningCost: Number.NEGATIVE_INFINITY },
    ];
    for (const variant of variants) {
      assert.throws(
        () => defineConfig({ queue: variant as unknown as Partial<QueueConfig> }),
        /queue\.max(PlanningSessions|PlanningCost) must be a finite non-negative number/,
        `expected rejection for ${JSON.stringify(variant)}`,
      );
    }
  });

  it('rejects a non-object queue block', () => {
    for (const bad of [null, [], 5, 'limits']) {
      assert.throws(
        () => defineConfig({ queue: bad as unknown as Partial<QueueConfig> }),
        /queue configuration must be an object/,
      );
    }
  });

  it('loads a queue block from osq.config.ts', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      'export default { queue: { maxPlanningSessions: 4, maxPlanningCost: 2.5 } };\n',
      'utf8',
    );
    const config = await loadConfig(tmpDir);
    assert.deepEqual(config.queue, { maxPlanningSessions: 4, maxPlanningCost: 2.5 });
  });

  it('exposes QueueConfig through the public package surface', () => {
    const value: QueueConfig = { maxPlanningSessions: 1, maxPlanningCost: 0 };
    assert.deepEqual(value, { maxPlanningSessions: 1, maxPlanningCost: 0 });
  });
});
