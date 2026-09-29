import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('README landing walkthrough', () => {
  it('ends the version control section with a walkthrough that lands only through osq land', async () => {
    const readme = await fs.readFile(path.join(repoRoot, 'README.md'), 'utf8');
    const version = readme.indexOf('## Version control');
    assert.ok(version >= 0, 'README must hold the version control section');

    const harnesses = readme.indexOf('## Harnesses', version);
    assert.ok(harnesses > version, 'the version control section must sit before Harnesses');

    const heading = '### Working with version control on';
    const start = readme.indexOf(heading, version);
    assert.ok(
      start > version && start < harnesses,
      'the walkthrough must follow the other version control text',
    );

    const section = readme.slice(version, harnesses);
    const walkthrough = readme.slice(start, harnesses);
    assert.ok(walkthrough.includes('osq land <id>'), 'the walkthrough must hold osq land <id>');
    assert.ok(!section.includes('git merge --squash'), 'the section must describe no hand squash');
    assert.ok(!section.includes('| git commit -F -'), 'the section must describe no hand commit');
  });
});
