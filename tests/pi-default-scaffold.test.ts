import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoEnvExamplePath = path.join(repoRoot, '.env.example');
const templateEnvExamplePath = path.join(repoRoot, 'templates', '.env.example');

/** Run `body` with `OSQ_HARNESS` unset, restoring the prior value afterwards. */
async function withoutHarnessEnv<T>(body: () => Promise<T>): Promise<T> {
  const previous = process.env.OSQ_HARNESS;
  Reflect.deleteProperty(process.env, 'OSQ_HARNESS');
  try {
    return await body();
  } finally {
    if (previous === undefined) Reflect.deleteProperty(process.env, 'OSQ_HARNESS');
    else process.env.OSQ_HARNESS = previous;
  }
}

describe('pi default scaffold', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-pi-default-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("writes harness: process.env.OSQ_HARNESS || 'pi' in osq.config.ts", async () => {
    await scaffoldProject(tmpDir);
    const config = await fs.readFile(path.join(tmpDir, 'osq.config.ts'), 'utf8');
    assert.match(config, /harness: process\.env\.OSQ_HARNESS \|\| 'pi'/);
  });

  it('starts .env.example with OSQ_HARNESS=pi and keeps the Codex guidance commented', async () => {
    await scaffoldProject(tmpDir);
    const content = await fs.readFile(path.join(tmpDir, '.env.example'), 'utf8');
    const lines = content.split('\n');

    assert.equal(lines[0], 'OSQ_HARNESS=pi');
    assert.match(content, /# Codex CLI \(optional\)/);
    assert.match(content, /CODEX_PATH/);
    assert.match(content, /OSQ_MODEL/);
    assert.match(content, /codex\.effort/);

    const commented = lines.filter((line) => line.trim().startsWith('#'));
    assert.ok(
      commented.some((line) => /OSQ_HARNESS=codex/.test(line)),
      'Codex selection must stay in a comment',
    );
    assert.equal(
      lines.some((line) => /^OSQ_HARNESS=codex\b/.test(line.trim())),
      false,
      'Codex must not be the active selection',
    );

    const agyNote = lines.find((line) =>
      line.includes('agy: { dangerouslySkipPermissions: true }'),
    );
    assert.ok(agyNote, 'the agy bypass note must be present');
    assert.ok(agyNote.startsWith('#'), 'the agy bypass note must be commented out');
  });

  it('mirrors the scaffolded .env.example in the repository and templates byte for byte', async () => {
    await scaffoldProject(tmpDir);
    const generated = await fs.readFile(path.join(tmpDir, '.env.example'), 'utf8');
    assert.equal(await fs.readFile(repoEnvExamplePath, 'utf8'), generated);
    assert.equal(await fs.readFile(templateEnvExamplePath, 'utf8'), generated);
  });

  it('loads the scaffolded project as pi when OSQ_HARNESS is unset', async () => {
    await scaffoldProject(tmpDir);
    const config = await withoutHarnessEnv(() => loadConfig(tmpDir));
    assert.equal(config.harness, 'pi');
  });
});
