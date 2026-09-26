import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  DEFAULT_GIT_COMMIT_SECONDS,
  DEFAULT_VCS_CONFIG,
  validateVcsConfig,
} from '../src/core/foundation/config-vcs.js';
import {
  type AgyConfig,
  DEFAULT_CONFIG,
  type OpencodeConfig,
  type OsqTimeouts,
  defineConfig,
  loadConfig,
} from '../src/core/foundation/config.js';
import type { VcsConfig as PublicVcsConfig } from '../src/index.js';

describe('vcs configuration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-vcs-config-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeConfig(source: string): Promise<void> {
    await fs.writeFile(path.join(tmpDir, 'osq.config.ts'), source, 'utf8');
  }

  it('defaults to vcs disabled when the block is unset', async () => {
    assert.deepEqual(DEFAULT_VCS_CONFIG, { enabled: false });
    assert.deepEqual((await loadConfig(tmpDir)).vcs, { enabled: false });
    assert.deepEqual(defineConfig({}).vcs, { enabled: false });
  });

  it('fails when vcs is enabled without an author', async () => {
    await writeConfig('export default { vcs: { enabled: true } };');
    await assert.rejects(loadConfig(tmpDir), /vcs\.author is required when vcs\.enabled is true/);
  });

  it('fails on a malformed author', async () => {
    await writeConfig("export default { vcs: { author: 'osq' } };");
    await assert.rejects(loadConfig(tmpDir), /vcs\.author must look like "Name <email>"/);
  });

  it('keeps worktreeRoot and prepare trimmed', async () => {
    await writeConfig(
      "export default { vcs: { enabled: true, author: 'Osq <osq@example.com>', worktreeRoot: '  .osq/worktrees  ', prepare: '  pnpm install  ' } };",
    );
    assert.deepEqual((await loadConfig(tmpDir)).vcs, {
      enabled: true,
      author: 'Osq <osq@example.com>',
      worktreeRoot: '.osq/worktrees',
      prepare: 'pnpm install',
    });
  });

  it('fails on a blank prepare', async () => {
    await writeConfig("export default { vcs: { prepare: '   ' } };");
    await assert.rejects(loadConfig(tmpDir), /vcs\.prepare must be a non-empty string/);
  });

  it('fails on a non-boolean enabled', async () => {
    await writeConfig("export default { vcs: { enabled: 'yes' } };");
    await assert.rejects(loadConfig(tmpDir), /vcs\.enabled must be a boolean/);
  });
});

describe('vcs configuration values', () => {
  it('exports the commit timeout default and accepts an override', () => {
    assert.equal(DEFAULT_GIT_COMMIT_SECONDS, 120);
    const config = defineConfig({ timeouts: { gitCommitSeconds: 30 } });
    assert.equal(config.timeouts.gitCommitSeconds, 30);
  });

  it('rejects a blank worktreeRoot through validateVcsConfig', () => {
    assert.deepEqual(validateVcsConfig(undefined), DEFAULT_VCS_CONFIG);
    assert.throws(() => validateVcsConfig({ worktreeRoot: '  ' }), /vcs\.worktreeRoot/);
    assert.deepEqual(validateVcsConfig({ worktreeRoot: '  wt  ' }), {
      enabled: false,
      worktreeRoot: 'wt',
    });
  });

  it('re-exports the moved agent types and the public vcs type', () => {
    const agy: AgyConfig = { model: 'gemini' };
    const opencode: OpencodeConfig = { bin: 'opencode' };
    const vcs: PublicVcsConfig = { enabled: true, author: 'Osq <osq@example.com>' };
    const timeouts: OsqTimeouts = { ...DEFAULT_CONFIG.timeouts, gitCommitSeconds: 30 };
    assert.deepEqual(agy, { model: 'gemini' });
    assert.deepEqual(opencode, { bin: 'opencode' });
    assert.equal(vcs.enabled, true);
    assert.equal(timeouts.gitCommitSeconds, 30);
  });
});
