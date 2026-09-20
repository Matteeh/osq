import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { scaffoldProject } from '../src/core/init.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoEnvExamplePath = path.join(repoRoot, '.env.example');
const readmePath = path.join(repoRoot, 'README.md');

/**
 * Behavioral scaffold coverage plus light README wording checks. The scaffold
 * assertions are the point of this file; the README assertions only confirm the
 * guidance sections the task's acceptance lines require exist.
 */
describe('codex consumer guidance: scaffolded .env.example', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-codex-guidance-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('scaffolds commented Codex selection/binary/model guidance under the agy default', async () => {
    const result = await scaffoldProject(tmpDir);
    assert.ok(result.createdFiles.includes('.env.example'));

    const content = await fs.readFile(path.join(tmpDir, '.env.example'), 'utf8');
    const lines = content.split('\n').map((line) => line.trim());

    assert.ok(lines.includes('OSQ_HARNESS=agy'), 'agy must stay the active default harness');
    assert.equal(
      lines.some((line) => /^OSQ_HARNESS=codex\b/.test(line)),
      false,
      'Codex selection must be commented, not the active default',
    );
    assert.match(content, /codex/i);

    const commented = lines.filter((line) => line.startsWith('#'));
    assert.ok(
      commented.some((line) => /OSQ_HARNESS=codex/.test(line)),
      'Codex selection guidance must be present as a comment',
    );
    assert.ok(
      commented.some((line) => /CODEX_PATH|codex\.bin/.test(line)),
      'Codex binary guidance must be present as a comment',
    );
    assert.ok(
      commented.some((line) => /OSQ_MODEL|codex\.model/.test(line)),
      'Codex model guidance must be present as a comment',
    );

    assert.ok(lines.includes('# GEMINI_API_KEY='));
    assert.ok(lines.includes('# ANTHROPIC_API_KEY='));
  });

  it('contains no credentials or secret values', async () => {
    await scaffoldProject(tmpDir);
    const content = await fs.readFile(path.join(tmpDir, '.env.example'), 'utf8');

    for (const line of content.split('\n')) {
      if (!/API_KEY=/.test(line)) continue;
      assert.ok(line.trim().startsWith('#'), `${line} must be commented out`);
      assert.equal(line.split('=')[1].trim(), '', `${line} must not carry a secret`);
    }
    assert.equal(
      /\bsk-[A-Za-z0-9]/.test(content),
      false,
      'must not contain credential-like tokens',
    );
  });

  it('mirrors the repository .env.example exactly', async () => {
    await scaffoldProject(tmpDir);
    const generated = await fs.readFile(path.join(tmpDir, '.env.example'), 'utf8');
    const repo = await fs.readFile(repoEnvExamplePath, 'utf8');
    assert.equal(repo, generated);
  });

  it('preserves a consumer-edited example across repeated scaffolding', async () => {
    await scaffoldProject(tmpDir);
    const envExamplePath = path.join(tmpDir, '.env.example');
    const custom = '# my custom env\nOSQ_HARNESS=opencode\n';
    await fs.writeFile(envExamplePath, custom, 'utf8');

    const second = await scaffoldProject(tmpDir);
    assert.ok(second.existingFiles.includes('.env.example'));
    assert.equal(await fs.readFile(envExamplePath, 'utf8'), custom);
  });
});

describe('codex consumer guidance: README', () => {
  it('lists codex and documents executor and independent planner examples with precedence', async () => {
    const readme = await fs.readFile(readmePath, 'utf8');

    assert.match(readme, /`codex`[\s:]/i, 'README must list the codex adapter');
    assert.match(readme, /harness:\s*'codex'/, 'README must show Codex as the executor');
    assert.match(readme, /planner:\s*\{/, 'README must show independent planner configuration');
    assert.match(
      readme,
      /planner\.agent[\s\S]{0,160}unsupported/i,
      'README must state Codex planner.agent is unsupported',
    );
    assert.match(
      readme,
      /codex\.bin[\s\S]{0,160}CODEX_PATH/,
      'README must document Codex binary precedence',
    );
    assert.match(
      readme,
      /codex\.model[\s\S]{0,200}OSQ_MODEL/,
      'README must document Codex model precedence',
    );
    assert.match(readme, /codex\.effort|effort/, 'README must document optional effort');
  });

  it('covers installation, authentication, setup, diagnostics, permissions, and scope limits', async () => {
    const readme = await fs.readFile(readmePath, 'utf8');

    assert.match(readme, /authenticat/i);
    assert.match(readme, /same host environment/i);
    assert.match(readme, /osq setup[\s\S]{0,300}no Codex-specific files/i);
    assert.match(readme, /doctor[\s\S]{0,300}--version/i);
    assert.match(readme, /--ask-for-approval never/);
    assert.match(readme, /workspace-write/);
    assert.match(readme, /on-request/);
    assert.match(readme, /scope[\s\S]{0,60}protocol, not hard confinement/i);
  });

  it('covers live smoke, fresh sessions, watcher verification, results, and observed costs', async () => {
    const readme = await fs.readFile(readmePath, 'utf8');

    assert.match(readme, /fresh Codex session/i);
    assert.match(readme, /synthesi[sz]e/i);
    assert.match(readme, /observed/i);
    assert.match(readme, /does not estimate usage or cost/i);
    assert.match(readme, /live/i);
    assert.match(readme, /minimum supported Codex release/i);
  });
});
