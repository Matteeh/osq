import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { scaffoldProject } from '../src/core/foundation/init.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const changelogPath = path.join(repoRoot, 'CHANGELOG.md');
const templateEnvExamplePath = path.join(repoRoot, 'templates', '.env.example');

function section(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end);
  assert.ok(from >= 0, `missing section ${start}`);
  assert.ok(to > from, `missing section ${end} after ${start}`);
  return text.slice(from, to);
}

describe('safer harness defaults: scaffolded project', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-harness-defaults-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('scaffolds pi as the harness selection', async () => {
    await scaffoldProject(tmpDir);
    const config = await fs.readFile(path.join(tmpDir, 'osq.config.ts'), 'utf8');
    assert.match(config, /harness: process\.env\.OSQ_HARNESS \|\| 'pi'/);
  });

  it('starts .env.example with OSQ_HARNESS=pi and keeps Codex guidance plus the agy note', async () => {
    await scaffoldProject(tmpDir);
    const content = await fs.readFile(path.join(tmpDir, '.env.example'), 'utf8');
    const lines = content.split('\n');

    assert.equal(lines[0], 'OSQ_HARNESS=pi');
    assert.match(content, /# Codex CLI \(optional\)/);
    assert.match(content, /CODEX_PATH/);
    assert.match(content, /OSQ_MODEL/);
    assert.match(content, /codex\.effort/);

    const agyNote = lines.find((line) =>
      line.includes('agy: { dangerouslySkipPermissions: true }'),
    );
    assert.ok(agyNote, 'the agy bypass note must be present');
    assert.ok(agyNote.startsWith('#'), 'the agy bypass note must be commented out');
    assert.match(agyNote, /osq\.config\.ts/);
  });

  it('mirrors the scaffolded .env.example in templates byte for byte', async () => {
    await scaffoldProject(tmpDir);
    const generated = await fs.readFile(path.join(tmpDir, '.env.example'), 'utf8');
    assert.equal(await fs.readFile(templateEnvExamplePath, 'utf8'), generated);
  });
});

describe('safer harness defaults: CHANGELOG', () => {
  it('adds one Unreleased entry for this change ending (137)', async () => {
    const changelog = await fs.readFile(changelogPath, 'utf8');
    const unreleased = section(changelog, '## [Unreleased]', '## [0.2.3]');
    const entries = unreleased
      .split('\n')
      .filter((line) => line.startsWith('- '))
      .filter((line) => /\(137\)\.$/.test(line));
    assert.equal(entries.length, 1, 'exactly one Unreleased entry must end in (137).');
  });
});
