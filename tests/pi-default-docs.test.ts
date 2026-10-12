import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const changelogPath = path.join(repoRoot, 'CHANGELOG.md');

function section(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end);
  assert.ok(from >= 0, `missing section ${start}`);
  assert.ok(to > from, `missing section ${end} after ${start}`);
  return text.slice(from, to);
}

function lines(text: string): string[] {
  return text.split('\n');
}

describe('pi default harness: CHANGELOG', () => {
  it('drops the scaffolded Codex claim from the (137) entry but keeps it ending (137).', async () => {
    const changelog = await fs.readFile(changelogPath, 'utf8');
    const entry = lines(changelog).find((line) => /\(137\)\.$/.test(line));
    assert.ok(entry, 'one entry must end (137).');
    assert.ok(
      !/`osq init`.*scaffolds.*Codex/.test(entry),
      'the (137) entry must not say osq init scaffolds Codex',
    );
  });

  it('adds one Unreleased entry saying osq init scaffolds pi, ending (138).', async () => {
    const changelog = await fs.readFile(changelogPath, 'utf8');
    const unreleased = section(changelog, '## [Unreleased]', '## [0.2.3]');
    const entries = lines(unreleased)
      .filter((line) => line.startsWith('- '))
      .filter((line) => /\(138\)\.$/.test(line));
    assert.equal(entries.length, 1, 'exactly one Unreleased entry must end in (138).');
    assert.match(entries[0], /`osq init`[^\n]*scaffolds pi/);
  });

  it('never says osq init scaffolds Codex', async () => {
    const changelog = await fs.readFile(changelogPath, 'utf8');
    assert.ok(
      !/^.*`osq init`.*scaffolds.*Codex.*$/m.test(changelog),
      'no CHANGELOG line may say osq init scaffolds Codex',
    );
  });
});
