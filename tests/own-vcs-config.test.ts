import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
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

  it('documents the walkthrough under the version control section', async () => {
    const readme = await fs.readFile(path.join(repoRoot, 'README.md'), 'utf8');
    const heading = '### Working with version control on';
    const start = readme.indexOf(heading);
    assert.ok(start >= 0, 'README must hold the working-with-version-control heading');

    const harnesses = readme.indexOf('## Harnesses', start);
    assert.ok(harnesses > start, 'the walkthrough must sit before the Harnesses section');

    const section = readme.slice(start, harnesses);
    assert.ok(section.includes('osq land <id>'), 'the walkthrough must hold the land command');
    assert.ok(
      !section.includes('| git commit -F -'),
      'the walkthrough must not describe landing by hand',
    );
  });
});
