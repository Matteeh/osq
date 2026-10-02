import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readmePath = path.join(repoRoot, 'README.md');
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

describe('pi default harness: README Upgrading', () => {
  it('says osq init now scaffolds pi instead of agy and keeps the agy lines', async () => {
    const readme = await fs.readFile(readmePath, 'utf8');
    const upgrading = section(readme, '## Upgrading', '## What it puts in your repo');

    const unreleased = upgrading.indexOf('Unreleased:');
    const to022 = upgrading.indexOf('To 0.2.2:');
    assert.ok(unreleased >= 0, 'Unreleased: must be present');
    assert.ok(unreleased < to022, 'Unreleased: must come before To 0.2.2:');

    const unreleasedList = upgrading.slice(unreleased, to022);
    assert.match(
      unreleasedList,
      /`osq init` now scaffolds pi instead of agy\./,
      'the Unreleased list must say osq init now scaffolds pi instead of agy',
    );

    assert.match(upgrading, /agy no longer bypasses/i);
    assert.match(upgrading, /agy: \{ dangerouslySkipPermissions: true \}/);
    assert.match(upgrading, /switch harness/i);
  });
});

describe('pi default harness: README Pi section', () => {
  it('says osq init scaffolds pi as the default harness', async () => {
    const readme = await fs.readFile(readmePath, 'utf8');
    const pi = section(readme, '### Pi', '### Claude Code');
    assert.match(
      pi,
      /`osq init`[^\n]*scaffolds pi[^\n]*default harness/,
      'the Pi section must say osq init scaffolds pi as the default harness',
    );
  });

  it('says pi has no permission prompts or sandbox, so nothing confines its agent', async () => {
    const readme = await fs.readFile(readmePath, 'utf8');
    const pi = section(readme, '### Pi', '### Claude Code');
    assert.match(pi, /no permission prompts/i);
    assert.match(pi, /no (filesystem )?sandbox/i);
    assert.match(pi, /nothing confines the agent/i);
    assert.match(pi, /`harness-containment`/);
  });

  it('never says osq init scaffolds Codex', async () => {
    const readme = await fs.readFile(readmePath, 'utf8');
    assert.ok(
      !/^.*`osq init`.*scaffolds.*Codex.*$/m.test(readme),
      'no README line may say osq init scaffolds Codex',
    );
  });
});

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
