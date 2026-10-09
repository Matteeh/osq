import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_NOTICES_CONFIG,
  type NoticesConfig,
  validateNoticesConfig,
} from '../src/core/foundation/config-notices.js';
import { DEFAULT_CONFIG, defineConfig, loadConfig } from '../src/core/foundation/config.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULTS: NoticesConfig = {
  maxShown: 5,
  maxTasks: 6,
  maxResolvedFiles: 15,
  rulePaths: [],
};

describe('notices configuration', () => {
  it('defaults every key through defineConfig and DEFAULT_CONFIG', () => {
    assert.deepEqual(DEFAULT_NOTICES_CONFIG, DEFAULTS);
    assert.deepEqual(DEFAULT_CONFIG.notices, DEFAULTS);
    assert.deepEqual(defineConfig({}).notices, DEFAULTS);
  });

  it('keeps each missing default for a partial block', () => {
    const config = defineConfig({ notices: { maxShown: 2 } });
    assert.equal(config.notices?.maxShown, 2);
    assert.equal(config.notices?.maxTasks, DEFAULTS.maxTasks);
    assert.equal(config.notices?.maxResolvedFiles, DEFAULTS.maxResolvedFiles);
    assert.deepEqual(config.notices?.rulePaths, DEFAULTS.rulePaths);
  });

  it('throws the documented error for each invalid block', () => {
    const cases: ReadonlyArray<readonly [unknown, string]> = [
      [[], 'notices configuration must be an object'],
      [{ maxShown: 0 }, 'notices.maxShown must be a positive integer'],
      [{ maxTasks: 2.5 }, 'notices.maxTasks must be a positive integer'],
      [{ rulePaths: ['a', ''] }, 'notices.rulePaths must be a list of scope patterns'],
    ];
    for (const [notices, message] of cases) {
      assert.throws(() => defineConfig({ notices } as never), new RegExp(message));
    }
  });

  it('returns the shared defaults for an absent block', () => {
    assert.equal(validateNoticesConfig(undefined), DEFAULT_NOTICES_CONFIG);
  });

  it("loads osq's own rule paths", async () => {
    const config = await loadConfig(REPO_ROOT);
    assert.deepEqual(config.notices?.rulePaths, [
      'src/harness/prompt.ts',
      'src/core/foundation/init-blocks.ts',
    ]);
  });
});
