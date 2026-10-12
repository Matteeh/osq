import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('default-branch steering changelog', () => {
  it('CHANGELOG records the default-branch change under 129', async () => {
    const changelog = await fs.readFile(path.join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
    const entry = changelog.indexOf('(129)');
    assert.ok(entry >= 0, 'CHANGELOG.md must hold an entry ending (129)');
    const start = changelog.lastIndexOf('## [', entry);
    const nextRelease = changelog.indexOf('## [', entry);
    assert.ok(
      start >= 0 && nextRelease > entry,
      'the entry must sit in a section followed by a release',
    );
    const unreleased = changelog.slice(start, nextRelease);

    assert.match(unreleased, /\(129\)/, 'the entry must end (129)');
    assert.match(unreleased, /default branch/i, 'it must name the default branch');
    assert.match(unreleased, /archived or not/i, 'it must say archived or not');
    assert.match(
      unreleased,
      /osq plan <id>/,
      'it must say the change shows once with osq plan <id>',
    );
    assert.match(unreleased, /conflict/i, 'it must say approval restarts after a conflict');
    assert.match(unreleased, /merge/i, 'it must say approval merges the default branch otherwise');
  });
});
