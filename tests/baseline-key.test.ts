import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { validateGatesConfig } from '../src/core/foundation/config-gates.js';
import { DEFAULT_CONFIG, loadConfig } from '../src/core/foundation/config.js';
import { selectVcs } from '../src/core/vcs/select.js';
import { type BaselineKey, readBaselineKey } from '../src/watcher/baseline-key.js';

const execFileAsync = promisify(execFile);

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/** The test's own git calls ignore redirecting variables, like osq's reads. */
function cleanGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE']) {
    Reflect.deleteProperty(env, key);
  }
  return env;
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, env: cleanGitEnv() });
  return stdout.trim();
}

/** Create a temporary repository on `main` with one commit and local identity. */
async function initRepo(dir: string): Promise<void> {
  await git(['init', '-q', '-b', 'main'], dir);
  await git(['config', 'user.name', 'osq'], dir);
  await git(['config', 'user.email', 'osq@example.invalid'], dir);
  await fs.writeFile(path.join(dir, 'seed.txt'), 'seed\n', 'utf8');
  await git(['add', '-A'], dir);
  await git(['commit', '-qm', 'init'], dir);
}

describe('baseline verify configuration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir('osq-baseline-config-');
  });

  it('leaves baselineVerify out of the validated gates when unset', () => {
    const gates = validateGatesConfig({});
    assert.ok(!('baselineVerify' in gates));
    assert.equal(gates.changeVerifyAfterTask, true);
  });

  it('loads a trimmed baseline command from osq.config.ts', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      "export default { gates: { baselineVerify: ' pnpm verify ' } };\n",
      'utf8',
    );
    const config = await loadConfig(tmpDir);
    assert.equal(config.gates?.baselineVerify, 'pnpm verify');
  });

  it('fails loading an empty baseline command', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      "export default { gates: { baselineVerify: '  ' } };\n",
      'utf8',
    );
    await assert.rejects(loadConfig(tmpDir), /gates\.baselineVerify must be a non-empty command/);
  });

  it('keeps baselineVerify absent when the project declares no config', async () => {
    const config = await loadConfig(tmpDir);
    assert.ok(config.gates !== undefined);
    assert.ok(!('baselineVerify' in config.gates));
  });
});

describe('baseline key', () => {
  it('returns no key outside a git repository', async () => {
    const dir = await makeTempDir('osq-baseline-novcs-');
    const vcs = await selectVcs(dir, DEFAULT_CONFIG);
    assert.equal(vcs.kind, 'none');
    assert.equal(await readBaselineKey(vcs, dir), null);
  });

  it('returns no key when HEAD has no commit', async () => {
    const dir = await makeTempDir('osq-baseline-unborn-');
    await git(['init', '-q', '-b', 'main'], dir);
    const vcs = await selectVcs(dir, DEFAULT_CONFIG);
    assert.equal(await readBaselineKey(vcs, dir), null);
  });

  it('reads an equal key when only a .run/ file is written between reads', async () => {
    const dir = await makeTempDir('osq-baseline-same-');
    await initRepo(dir);
    await fs.writeFile(path.join(dir, 'draft.txt'), 'stable\n', 'utf8');
    const vcs = await selectVcs(dir, DEFAULT_CONFIG);
    const first: BaselineKey | null = await readBaselineKey(vcs, dir);
    await fs.mkdir(path.join(dir, '.run', 'events'), { recursive: true });
    await fs.writeFile(path.join(dir, '.run', 'events', '1.jsonl'), '{}\n', 'utf8');
    const second = await readBaselineKey(vcs, dir);
    assert.ok(first);
    assert.ok(second);
    assert.deepEqual(second, first);
  });

  it('changes the digest but not the commit when a tracked file is edited', async () => {
    const dir = await makeTempDir('osq-baseline-tracked-');
    await initRepo(dir);
    const vcs = await selectVcs(dir, DEFAULT_CONFIG);
    const first = await readBaselineKey(vcs, dir);
    await fs.writeFile(path.join(dir, 'seed.txt'), 'changed\n', 'utf8');
    const second = await readBaselineKey(vcs, dir);
    assert.ok(first);
    assert.ok(second);
    assert.notEqual(second.treeDigest, first.treeDigest);
    assert.equal(second.commit, first.commit);
  });

  it('changes the digest but not the commit when an untracked file changes', async () => {
    const dir = await makeTempDir('osq-baseline-untracked-');
    await initRepo(dir);
    await fs.writeFile(path.join(dir, 'draft.txt'), 'one\n', 'utf8');
    const vcs = await selectVcs(dir, DEFAULT_CONFIG);
    const first = await readBaselineKey(vcs, dir);
    await fs.writeFile(path.join(dir, 'draft.txt'), 'two\n', 'utf8');
    const second = await readBaselineKey(vcs, dir);
    assert.ok(first);
    assert.ok(second);
    assert.notEqual(second.treeDigest, first.treeDigest);
    assert.equal(second.commit, first.commit);
  });
});
