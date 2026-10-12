import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('steering changelog', () => {
  it('CHANGELOG records the steering change under 128', async () => {
    const changelog = await fs.readFile(path.join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
    const entry = changelog.indexOf('(128)');
    assert.ok(entry >= 0, 'CHANGELOG.md must hold an entry ending (128)');
    const start = changelog.lastIndexOf('## [', entry);
    const nextRelease = changelog.indexOf('## [', entry);
    assert.ok(
      start >= 0 && nextRelease > entry,
      'the entry must sit in a section followed by a release',
    );
    const unreleased = changelog.slice(start, nextRelease);

    assert.match(unreleased, /\(128\)/, 'the entry must end (128)');
    assert.match(unreleased, /stuck, blocked, or regressed/i, 'it must name the three triggers');
    assert.match(unreleased, /osq plan <id>/, 'it must name osq plan <id>');
    assert.match(
      unreleased,
      /change's own folder/i,
      "it must say osq plan writes the prompt into the change's own folder",
    );
    assert.match(unreleased, /osq approve/, 'it must name osq approve');
    assert.match(
      unreleased,
      /first task that is not done/i,
      'it must say osq approve continues from the first task that is not done',
    );
  });
});
