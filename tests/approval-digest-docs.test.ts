import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readReadme(): Promise<string> {
  const raw = await fs.readFile(path.join(REPO_ROOT, 'README.md'), 'utf8');
  // Collapse line wrapping so prose phrases match regardless of where they break.
  return raw.replace(/\s+/g, ' ');
}

describe('approval digest documentation', () => {
  it('README adds an Approval digest bullet after the approval gate', async () => {
    const readme = await readReadme();

    assert.match(readme, /\*\*Approval digest\.\*\*/, 'README must add an Approval digest bullet');
    assert.ok(
      readme.indexOf('**Approval digest.**') > readme.indexOf('**Approval gate.**'),
      'the Approval digest bullet must follow the approval gate',
    );
    assert.match(readme, /the goal/i, 'README must say the digest shows the goal');
    assert.match(
      readme,
      /resolved-scope file count/i,
      'README must say each task shows its scope file count',
    );
    assert.match(
      readme,
      /adds, modifies, or removes/i,
      'README must say the digest shows delta changes',
    );
  });

  it('README names the five flags in plain words and that they never block', async () => {
    const readme = await readReadme();

    for (const flag of [
      'shared_file',
      'sensitive_path',
      'verify_without_test',
      'removed_requirement',
      'unknown_capability',
    ]) {
      assert.ok(readme.includes(flag), `README must name the ${flag} flag`);
    }
    assert.match(
      readme,
      /flags never block by default/i,
      'README must say flags never block by default',
    );
    assert.match(
      readme,
      /approval line names them/i,
      'README must say the approval line names the flags',
    );
  });

  it('README lists the confirm and show JSON commands and their behavior', async () => {
    const readme = await readReadme();

    assert.ok(
      readme.includes('osq approve <id> --confirm'),
      'README must list osq approve <id> --confirm',
    );
    assert.ok(readme.includes('osq show <id> --json'), 'README must list osq show <id> --json');
    assert.match(
      readme,
      /asks only when flags fire/i,
      'README must say --confirm asks only when flags fire',
    );
    assert.match(readme, /defaults to no/i, 'README must say --confirm defaults to no');
    assert.match(
      readme,
      /refuses without a terminal/i,
      'README must say --confirm refuses without a terminal',
    );
  });

  it('README describes the Approval flags report section and its cutoff', async () => {
    const readme = await readReadme();

    assert.ok(
      readme.includes('Approval flags'),
      'README must name the Approval flags report section',
    );
    assert.match(
      readme,
      /only changes approved after this release/i,
      'README must say the section counts only changes approved after this release',
    );
  });
});
