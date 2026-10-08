import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_GATES_CONFIG, validateGatesConfig } from '../src/core/foundation/config-gates.js';
import { DEFAULT_CONFIG, defineConfig, loadConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORMAT_ERROR = /gates\.formatCommand must be a command containing \{files\}/;
const COMMAND = 'npx prettier --write {files}';
const OWN_COMMAND =
  'pnpm exec biome check --linter-enabled=false --write --no-errors-on-unmatched {files}';
const INIT_COMMENT_LINES = [
  '  // osq formats the files a task changed in its scope before running verify;',
  '  // {files} becomes those files, each quoted.',
  "  // gates: { formatCommand: 'npx prettier --write {files}' },",
];

async function readReadme(): Promise<string> {
  const raw = await fs.readFile(path.join(REPO_ROOT, 'README.md'), 'utf8');
  // Collapse line wrapping so prose phrases match regardless of where they break.
  return raw.replace(/\s+/g, ' ');
}

describe('format command configuration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-format-config-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('is unset by default', () => {
    assert.equal('formatCommand' in DEFAULT_GATES_CONFIG, false);
    assert.equal('formatCommand' in validateGatesConfig({}), false);
    assert.equal(defineConfig({}).gates?.formatCommand, undefined);
    assert.ok(!('formatCommand' in (DEFAULT_CONFIG.gates ?? {})));
  });

  it('keeps a set command trimmed next to the other gate defaults', () => {
    const config = defineConfig({ gates: { formatCommand: ` ${COMMAND} ` } });
    assert.equal(config.gates?.formatCommand, COMMAND);
    assert.deepEqual(config.gates, {
      ...DEFAULT_GATES_CONFIG,
      formatCommand: COMMAND,
    });
    assert.deepEqual(validateGatesConfig({ formatCommand: ` ${COMMAND} ` }), {
      ...DEFAULT_GATES_CONFIG,
      formatCommand: COMMAND,
    });
  });

  it('rejects invalid format commands', () => {
    const invalid = ['', 'npx prettier --write .', 5];
    for (const value of invalid) {
      assert.throws(
        () => defineConfig({ gates: { formatCommand: value } } as never),
        FORMAT_ERROR,
        `defineConfig must reject ${JSON.stringify(value)}`,
      );
      assert.throws(
        () => validateGatesConfig({ formatCommand: value }),
        FORMAT_ERROR,
        `validateGatesConfig must reject ${JSON.stringify(value)}`,
      );
    }
  });

  it('shows the key in the scaffolded config, unset when loaded', async () => {
    await scaffoldProject(tmpDir);
    const text = await fs.readFile(path.join(tmpDir, 'osq.config.ts'), 'utf8');
    const lines = text.split('\n');
    const validator = lines.indexOf(
      "  // validator: { harness: 'claude', model: '<a-different-model>' },",
    );
    assert.ok(validator >= 0, 'the scaffolded config holds the validator example');
    assert.equal(
      lines.slice(validator + 1, validator + 1 + INIT_COMMENT_LINES.length).join('\n'),
      INIT_COMMENT_LINES.join('\n'),
    );

    const config = await loadConfig(tmpDir);
    assert.equal(config.gates?.formatCommand, undefined);
  });

  it("loads osq's own format command", async () => {
    const config = await loadConfig(REPO_ROOT);
    assert.equal(config.gates?.formatCommand, OWN_COMMAND);
  });
});

describe('format command documentation', () => {
  it('Gates and permissions gains a Formatting bullet after change verification', async () => {
    const readme = await readReadme();
    const start = readme.indexOf('## Gates and permissions');
    assert.ok(start >= 0, 'README must contain Gates and permissions');
    const end = readme.indexOf('## Change folder', start);
    const gates = readme.slice(start, end);

    assert.match(gates, /\*\*Formatting\.\*\*/, 'the bullet must be labeled Formatting');
    const formatting = gates.indexOf('**Formatting.**');
    const changeVerify = gates.indexOf('**Change verification after every task.**');
    assert.ok(
      changeVerify >= 0 && formatting > changeVerify,
      'the Formatting bullet must come after change verification',
    );
    assert.ok(gates.includes('gates.formatCommand'), 'the bullet must name the key');
    assert.ok(gates.includes('{files}'), 'the bullet must name the placeholder');
    assert.match(gates, /scope/, 'the bullet must say the files are the task scope');
    assert.match(gates, /format_ran/, 'the bullet must name the format_ran event');
    assert.match(gates, /still decides/i, 'verify must still decide on failure');
    assert.match(gates, /nothing runs without the key/i, 'nothing runs without the key');
  });

  it('Role environments lists the format command among what verify covers', async () => {
    const readme = await readReadme();
    const start = readme.indexOf('**Role environments.**');
    assert.ok(start >= 0, 'README must contain the Role environments bullet');
    const role = readme.slice(start, readme.indexOf('## Change folder', start));
    assert.match(role, /format command/, 'Role environments must list the format command');
  });
});
