import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/core/foundation/config.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('osq own version control configuration', () => {
  it('enables version control with osq author and install command', async () => {
    const { vcs } = await loadConfig(repoRoot);
    assert.ok(vcs, 'osq.config.ts must declare a vcs block');
    assert.equal(vcs.enabled, true);
    assert.equal(vcs.author, 'osq <osq@noreply.invalid>');
    assert.equal(vcs.prepare, 'pnpm install --frozen-lockfile');
  });
});
