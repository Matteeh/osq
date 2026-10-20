import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/core/foundation/config.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe("osq's own change concurrency", () => {
  it('loads maxConcurrency 3 from osq.config.ts', async () => {
    const config = await loadConfig(REPO_ROOT);

    assert.equal(config.maxConcurrency, 3);
  });
});
