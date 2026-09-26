import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { doctorCommand } from '../src/cli/doctor.js';
import { type DoctorReport, runDoctorChecks } from '../src/core/foundation/doctor.js';
import {
  MANAGED_AGENTS_MD_BODY,
  MANAGED_CLAUDE_PLAN_COMMAND,
  MANAGED_PLANNER_BLOCK,
} from '../src/core/foundation/init.js';
import { OPENSPEC_EXPECTED_VERSION } from '../src/core/spec/linter.js';

const execFileAsync = promisify(execFile);
const GIT_ENV_KEYS = ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE'] as const;
const VCS_WARNING_NAMES = ['vcs-prepare', 'git-hooks', 'git-signing'] as const;

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

/** A config whose `vcs` block serializes to the given object. */
async function writeConfig(root: string, vcs: Record<string, unknown>): Promise<void> {
  await fs.writeFile(
    path.join(root, 'osq.config.ts'),
    `export default { harness: 'mock', vcs: ${JSON.stringify(vcs)} };\n`,
    'utf8',
  );
}

async function writeLockfile(root: string, name: string): Promise<void> {
  await fs.writeFile(path.join(root, name), 'lockfile\n', 'utf8');
}

/** An executable `pre-commit` hook that would leave the tree alone. */
async function writePreCommitHook(root: string): Promise<void> {
  const hooks = path.join(root, '.git', 'hooks');
  await fs.mkdir(hooks, { recursive: true });
  const file = path.join(hooks, 'pre-commit');
  await fs.writeFile(file, '#!/bin/sh\nexit 0\n', 'utf8');
  await fs.chmod(file, 0o755);
}

/** The managed planning files, so every non-vcs check can pass. */
async function writeHealthyRepo(root: string): Promise<void> {
  await fs.mkdir(path.join(root, 'openspec', 'changes', 'archive'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'AGENTS.md'),
    `# Instructions\n\n${MANAGED_AGENTS_MD_BODY}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(root, 'PLANNER.md'),
    `# Instructions\n\n${MANAGED_PLANNER_BLOCK}\n`,
    'utf8',
  );
  const commandDir = path.join(root, '.claude', 'commands');
  await fs.mkdir(commandDir, { recursive: true });
  await fs.writeFile(
    path.join(commandDir, 'osq-plan.md'),
    `# Plan a change with osq\n\n${MANAGED_CLAUDE_PLAN_COMMAND}\n`,
    'utf8',
  );
}

/** Run the full doctor report with a hermetic validator probe. */
function doctorReport(root: string): Promise<DoctorReport> {
  return runDoctorChecks(root, {
    probeValidator: async () => OPENSPEC_EXPECTED_VERSION,
  });
}

function find(report: DoctorReport, name: string) {
  return report.checks.find((check) => check.name === name) as
    | { name: string; ok: boolean; message: string; warning?: boolean }
    | undefined;
}

function vcsWarnings(report: DoctorReport) {
  return report.checks.filter((check) =>
    (VCS_WARNING_NAMES as readonly string[]).includes(check.name),
  );
}

describe('doctor version control warnings', () => {
  it('warns about a lockfile without a prepare command', async () => {
    const dir = await makeTempDir('osq-vcs-doctor-lock-');
    await initRepo(dir);
    await writeConfig(dir, { enabled: true, author: 'osq <osq@example.invalid>' });
    await writeLockfile(dir, 'pnpm-lock.yaml');

    const report = await doctorReport(dir);

    const prepare = find(report, 'vcs-prepare');
    assert.equal(prepare?.ok, true);
    assert.equal(prepare?.warning, true);
    assert.match(prepare?.message ?? '', /pnpm-lock\.yaml/);
    assert.ok(
      report.checks.findIndex((check) => check.name === 'vcs-prepare') >
        report.checks.findIndex((check) => check.name === 'git'),
    );
  });

  it('warns naming each active commit hook', async () => {
    const dir = await makeTempDir('osq-vcs-doctor-hooks-');
    await initRepo(dir);
    await writeConfig(dir, { enabled: true, author: 'osq <osq@example.invalid>' });
    await writePreCommitHook(dir);

    const report = await doctorReport(dir);

    const hooks = find(report, 'git-hooks');
    assert.equal(hooks?.ok, true);
    assert.equal(hooks?.warning, true);
    assert.match(hooks?.message ?? '', /pre-commit/);
  });

  it('warns when commit.gpgsign is true in the repository config', async () => {
    const dir = await makeTempDir('osq-vcs-doctor-signing-');
    await initRepo(dir);
    await writeConfig(dir, { enabled: true, author: 'osq <osq@example.invalid>' });
    await execFileAsync('git', ['config', 'commit.gpgsign', 'true'], {
      cwd: dir,
      env: cleanGitEnv(),
    });

    const report = await doctorReport(dir);

    const signing = find(report, 'git-signing');
    assert.equal(signing?.ok, true);
    assert.equal(signing?.warning, true);
    assert.match(signing?.message ?? '', /commit\.gpgsign/);
    assert.match(signing?.message ?? '', /prompt/);
  });

  it('adds none of the warnings when vcs is off', async () => {
    const dir = await makeTempDir('osq-vcs-doctor-off-');
    await initRepo(dir);
    await writeConfig(dir, { enabled: false });
    await writeLockfile(dir, 'pnpm-lock.yaml');
    await writePreCommitHook(dir);
    await execFileAsync('git', ['config', 'commit.gpgsign', 'true'], {
      cwd: dir,
      env: cleanGitEnv(),
    });

    const report = await doctorReport(dir);

    assert.deepEqual(vcsWarnings(report), []);
  });

  it('keeps doctor exit code 0 while printing the warnings', async () => {
    const dir = await makeTempDir('osq-vcs-doctor-exit-');
    await initRepo(dir);
    await writeConfig(dir, { enabled: true, author: 'osq <osq@example.invalid>' });
    await writeHealthyRepo(dir);
    await writeLockfile(dir, 'pnpm-lock.yaml');
    await writePreCommitHook(dir);
    await execFileAsync('git', ['config', 'commit.gpgsign', 'true'], {
      cwd: dir,
      env: cleanGitEnv(),
    });

    const report = await doctorReport(dir);
    assert.equal(report.ok, true, JSON.stringify(report.checks));
    assert.deepEqual(
      vcsWarnings(report).map((check) => check.name),
      ['vcs-prepare', 'git-hooks', 'git-signing'],
    );

    const lines: string[] = [];
    const codes: number[] = [];
    await doctorCommand({
      report,
      stdout: (line) => lines.push(line),
      exit: (code) => codes.push(code),
    });

    assert.deepEqual(codes, []);
    for (const name of VCS_WARNING_NAMES) {
      assert.ok(
        lines.some((line) => line.startsWith(`[warn] ${name}:`)),
        `missing [warn] ${name} line: ${lines.join('\n')}`,
      );
    }
  });
});
