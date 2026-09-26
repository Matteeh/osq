import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { doctorCommand } from '../src/cli/doctor.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { checkGit } from '../src/core/vcs/doctor-git.js';

const execFileAsync = promisify(execFile);
const GIT_ENV_KEYS = ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE'] as const;

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
  for (const key of GIT_ENV_KEYS) Reflect.deleteProperty(env, key);
  return env;
}

/** The variable's value before a test, so it can be put back exactly. */
function saveGitEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const key of GIT_ENV_KEYS) saved[key] = process.env[key];
  return saved;
}

function restoreGitEnv(saved: Record<string, string | undefined>): void {
  for (const key of GIT_ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
}

/** A temporary repository on `main` with one commit. */
async function initRepo(dir: string): Promise<void> {
  await execFileAsync('git', ['init', '-q', '-b', 'main'], { cwd: dir, env: cleanGitEnv() });
  await fs.writeFile(path.join(dir, 'seed.txt'), 'seed\n', 'utf8');
  await execFileAsync('git', ['add', '-A'], { cwd: dir, env: cleanGitEnv() });
  await execFileAsync(
    'git',
    ['-c', 'user.name=osq', '-c', 'user.email=osq@example.invalid', 'commit', '-qm', 'init'],
    { cwd: dir, env: cleanGitEnv() },
  );
}

function find(checks: Array<{ name: string }>, name: string) {
  return checks.find((check) => check.name === name) as
    | { name: string; ok: boolean; message: string; warning?: boolean }
    | undefined;
}

describe('doctor git check', () => {
  it("passes with git's version at the top of a repository", async () => {
    const dir = await makeTempDir('osq-doctor-git-root-');
    await initRepo(dir);

    const checks = await checkGit(dir, DEFAULT_CONFIG);

    const git = find(checks, 'git');
    assert.equal(git?.ok, true);
    assert.equal(git?.warning, undefined);
    assert.match(git?.message ?? '', /^git version /);
    assert.equal(find(checks, 'git-env'), undefined);
  });

  it('warns that git is not found without failing', async () => {
    const dir = await makeTempDir('osq-doctor-git-missing-');

    const checks = await checkGit(dir, DEFAULT_CONFIG, {
      gitBinary: 'osq-definitely-not-a-real-binary',
    });

    const git = find(checks, 'git');
    assert.equal(git?.ok, true);
    assert.equal(git?.warning, true);
    assert.equal(git?.message, 'git not found; git checks off');
  });

  it('warns that a plain folder is not a git repository', async () => {
    const dir = await makeTempDir('osq-doctor-git-plain-');

    const checks = await checkGit(dir, DEFAULT_CONFIG);

    const git = find(checks, 'git');
    assert.equal(git?.ok, true);
    assert.equal(git?.warning, true);
    assert.equal(git?.message, 'not a git repository; git checks off');
  });

  it('adds a git-env warning naming each variable set', async () => {
    const dir = await makeTempDir('osq-doctor-git-env-');
    const saved = saveGitEnv();
    process.env.GIT_DIR = path.join(dir, 'other.git');
    try {
      const checks = await checkGit(dir, DEFAULT_CONFIG);

      const gitEnv = find(checks, 'git-env');
      assert.equal(gitEnv?.ok, true);
      assert.equal(gitEnv?.warning, true);
      assert.match(gitEnv?.message ?? '', /GIT_DIR is set/);
      assert.match(gitEnv?.message ?? '', /osq's own git reads/);
      assert.match(gitEnv?.message ?? '', /verify commands and hooks do not/);
    } finally {
      restoreGitEnv(saved);
    }
  });

  it('keeps doctor exit code 0 with only the git warnings', async () => {
    const dir = await makeTempDir('osq-doctor-git-exit-');
    const saved = saveGitEnv();
    process.env.GIT_DIR = path.join(dir, 'other.git');
    try {
      const checks = await checkGit(dir, DEFAULT_CONFIG, {
        gitBinary: 'osq-definitely-not-a-real-binary',
      });
      const report = { ok: checks.every((check) => check.ok), checks };
      const lines: string[] = [];
      const codes: number[] = [];

      await doctorCommand({
        stdout: (line) => lines.push(line),
        exit: (code) => codes.push(code),
        report,
      });

      assert.equal(report.ok, true);
      assert.deepEqual(codes, []);
      assert.ok(lines.some((line) => line.startsWith('[warn] git:')));
      assert.ok(lines.some((line) => line.startsWith('[warn] git-env:')));
    } finally {
      restoreGitEnv(saved);
    }
  });
});
