import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const changelogPath = path.join(repoRoot, 'CHANGELOG.md');

describe('changelog and release documentation', () => {
  it('ships a changelog with a 0.1.0 release entry', async () => {
    const changelog = await fs.readFile(changelogPath, 'utf8');
    assert.match(changelog, /^# Changelog$/m, 'CHANGELOG.md must open with a # Changelog heading');
    assert.ok(
      changelog.includes('## [0.1.0]'),
      'CHANGELOG.md must contain a 0.1.0 release section',
    );
  });

  it('summarises the changes from specs 001 through 012', async () => {
    const changelog = await fs.readFile(changelogPath, 'utf8');
    const releaseStart = changelog.indexOf('## [0.1.0]');
    assert.ok(releaseStart >= 0, 'CHANGELOG.md must contain a 0.1.0 release section');
    const releaseBody = changelog.slice(releaseStart);

    for (let n = 1; n <= 12; n += 1) {
      const id = String(n).padStart(3, '0');
      assert.ok(releaseBody.includes(id), `0.1.0 entry must reference spec ${id}`);
    }
  });
});
