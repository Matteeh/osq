import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { scaffoldProject } from '../src/core/foundation/init.js';

/**
 * Behavioral scaffold coverage: the scaffolded `.env.example` keeps the Codex
 * guidance as comments while pi stays the active default.
 */
describe('codex consumer guidance: scaffolded .env.example', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-codex-guidance-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('scaffolds pi as the active default with the Codex guidance kept as comments', async () => {
    const result = await scaffoldProject(tmpDir);
    assert.ok(result.createdFiles.includes('.env.example'));

    const content = await fs.readFile(path.join(tmpDir, '.env.example'), 'utf8');
    const lines = content.split('\n').map((line) => line.trim());

    assert.ok(lines.includes('OSQ_HARNESS=pi'), 'pi must be the active default harness');
    assert.equal(
      lines.some((line) => /^OSQ_HARNESS=codex\b/.test(line)),
      false,
      'codex must not be the active default',
    );
    assert.equal(
      lines.some((line) => /^OSQ_HARNESS=agy\b/.test(line)),
      false,
      'agy must not be the active default',
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
