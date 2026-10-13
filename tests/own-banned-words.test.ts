import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/core/foundation/config.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe("osq's own banned words", () => {
  it('loads the one ban osq keeps from osq.config.ts', async () => {
    const config = await loadConfig(REPO_ROOT);

    assert.deepEqual(config.bannedWords, [{ word: 'skipped', paths: ['src/**'] }]);
  });
});
