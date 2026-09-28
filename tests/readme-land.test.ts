import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('README landing walkthrough', () => {
  it('names osq land before the hand land fallback in the version control section', async () => {
    const readme = await fs.readFile(path.join(repoRoot, 'README.md'), 'utf8');
    const heading = '### Working with version control on';
    const start = readme.indexOf(heading);
    assert.ok(start >= 0, 'README must hold the working-with-version-control heading');

    const harnesses = readme.indexOf('## Harnesses', start);
    assert.ok(harnesses > start, 'the walkthrough must sit before the Harnesses section');

    const section = readme.slice(start, harnesses);
    const land = section.indexOf('osq land <id>');
    const hand = section.indexOf('osq message <id> | git commit -F -');
    assert.ok(land >= 0, 'the walkthrough must name osq land <id>');
    assert.ok(hand >= 0, 'the walkthrough must keep the hand land command');
    assert.ok(land < hand, 'osq land <id> must come before the hand land fallback');
  });
});
