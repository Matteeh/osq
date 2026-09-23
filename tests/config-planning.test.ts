import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  DEFAULT_PLANNING_CONFIG,
  validatePlanningConfig,
} from '../src/core/foundation/config-planning.js';
import { DEFAULT_CONFIG, defineConfig, loadConfig } from '../src/core/foundation/config.js';
import type { PlanningConfig, PlanningPrice } from '../src/index.js';

const OPUS: PlanningPrice = { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 };

describe('planning configuration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-config-planning-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('defaults the idle gap to ten minutes and ships no price table', () => {
    assert.deepEqual(DEFAULT_PLANNING_CONFIG, { idleGapMinutes: 10 });
    assert.deepEqual(DEFAULT_CONFIG.planning, { idleGapMinutes: 10 });
    assert.deepEqual(defineConfig({}).planning, { idleGapMinutes: 10 });
    assert.equal(validatePlanningConfig(undefined).idleGapMinutes, 10);
  });

  it('keeps a price entry and the default idle gap from a partial block', () => {
    const config = defineConfig({ planning: { prices: { 'claude-opus-5-5': OPUS } } });
    assert.deepEqual(config.planning, {
      idleGapMinutes: 10,
      prices: { 'claude-opus-5-5': OPUS },
    });
  });

  it('merges an idle gap override over the defaults', () => {
    assert.deepEqual(defineConfig({ planning: { idleGapMinutes: 3 } }).planning, {
      idleGapMinutes: 3,
    });
  });

  it('rejects a non-object planning block', () => {
    for (const bad of [null, [], 42, 'planning']) {
      assert.throws(
        () => defineConfig({ planning: bad as unknown as Partial<PlanningConfig> }),
        /planning configuration must be an object/,
      );
    }
  });

  it('rejects a non-positive or non-numeric idle gap naming the key', () => {
    const variants: unknown[] = [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '10'];
    for (const idleGapMinutes of variants) {
      assert.throws(
        () => defineConfig({ planning: { idleGapMinutes } } as never),
        /planning\.idleGapMinutes/,
        `expected rejection for ${String(idleGapMinutes)}`,
      );
    }
  });

  it('rejects a non-object prices map naming the key', () => {
    for (const prices of [5, 'free', []]) {
      assert.throws(
        () => defineConfig({ planning: { prices } } as never),
        /planning\.prices/,
        `expected rejection for ${JSON.stringify(prices)}`,
      );
    }
  });

  it('rejects a price entry missing a kind naming the exact key', () => {
    assert.throws(
      () =>
        defineConfig({
          planning: { prices: { 'claude-opus-5-5': { input: 5, output: 25, cacheRead: 0.5 } } },
        } as never),
      /planning\.prices\.claude-opus-5-5\.cacheWrite/,
    );
  });

  it('rejects negative and non-numeric price values naming the exact key', () => {
    assert.throws(
      () =>
        defineConfig({
          planning: { prices: { 'claude-opus-5-5': { ...OPUS, output: -1 } } },
        } as never),
      /planning\.prices\.claude-opus-5-5\.output/,
    );
    assert.throws(
      () =>
        defineConfig({
          planning: { prices: { 'claude-opus-5-5': { ...OPUS, cacheRead: '0.5' } } },
        } as never),
      /planning\.prices\.claude-opus-5-5\.cacheRead/,
    );
  });

  it('loads a planning block from osq.config.ts', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      'export default { planning: { idleGapMinutes: 4, prices: { m: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 } } } };\n',
      'utf8',
    );
    const config = await loadConfig(tmpDir);
    assert.deepEqual(config.planning, {
      idleGapMinutes: 4,
      prices: { m: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 } },
    });
  });

  it('exposes PlanningConfig and PlanningPrice through the public surface', () => {
    const config: PlanningConfig = { idleGapMinutes: 10, prices: { m: OPUS } };
    assert.equal(config.prices?.m.cacheWrite, 6.25);
  });
});
