import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { doctorCommand } from '../src/cli/doctor.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { type DoctorReport, runDoctorChecks } from '../src/core/foundation/doctor.js';
import {
  MANAGED_AGENTS_MD_BODY,
  MANAGED_CLAUDE_PLAN_COMMAND,
  MANAGED_PLANNER_BLOCK,
} from '../src/core/foundation/init.js';
import { OPENSPEC_EXPECTED_VERSION } from '../src/core/spec/linter.js';

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

async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync('git', args, { cwd, env: cleanGitEnv() });
}

/** Files staged in every repository: an LF text file and a binary file. */
const BASE_FILES: Record<string, Buffer | string> = {
  'lf.txt': 'ok\n',
  'bin.dat': Buffer.from([0x00, 0x01, 0x0d, 0x0a]),
};

/** A repository with `core.autocrlf` false, staging the base files and `extra`. */
async function stageRepo(extra: Record<string, Buffer | string>): Promise<string> {
  const dir = await makeTempDir('osq-line-endings-doctor-');
  await git(['init', '-q', '-b', 'main'], dir);
  await git(['config', 'core.autocrlf', 'false'], dir);
  for (const [name, content] of Object.entries({ ...BASE_FILES, ...extra })) {
    await fs.writeFile(path.join(dir, name), content);
  }
  await git(['add', '-A'], dir);
  return dir;
}

/** A config whose block serializes to the given object. */
async function writeConfig(root: string, config: Record<string, unknown>): Promise<void> {
  await fs.writeFile(
    path.join(root, 'osq.config.ts'),
    `export default ${JSON.stringify({ harness: 'mock', ...config })};\n`,
    'utf8',
  );
}

const ENABLED = { enabled: true, author: 'osq <osq@example.invalid>' };

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

/** The full doctor report with a hermetic validator probe. */
function doctorReport(root: string): Promise<DoctorReport> {
  return runDoctorChecks(root, { probeValidator: async () => OPENSPEC_EXPECTED_VERSION });
}

function find(report: DoctorReport, name: string) {
  return report.checks.find((check) => check.name === name);
}

/** One row of the cli-foundation "Line endings warning text" table. */
const WARNING_TEXT_ROWS: {
  readonly staged: string;
  readonly files: Record<string, Buffer | string>;
  readonly expected: string | null;
}[] = [
  { staged: 'none other', files: {}, expected: null },
  {
    staged: 'win.txt',
    files: { 'win.txt': 'a\r\nb\r\n' },
    expected:
      '1 tracked file has CRLF or mixed line endings: win.txt; run git add --renormalize . and commit',
  },
  {
    staged: 'a.txt, mix.txt',
    files: { 'a.txt': 'a\r\n', 'mix.txt': 'a\nb\r\n' },
    expected:
      '2 tracked files have CRLF or mixed line endings: a.txt, mix.txt; run git add --renormalize . and commit',
  },
  {
    staged: 'a.txt, b.txt, c.txt',
    files: { 'a.txt': 'a\r\n', 'b.txt': 'a\r\n', 'c.txt': 'a\r\n' },
    expected:
      '3 tracked files have CRLF or mixed line endings: a.txt, b.txt and 1 more; run git add --renormalize . and commit',
  },
];

describe('doctor git line endings warning', () => {
  for (const row of WARNING_TEXT_ROWS) {
    it(`reports the git-line-endings result for ${row.staged}`, async () => {
      const dir = await stageRepo(row.files);
      await writeConfig(dir, { vcs: ENABLED, limits: { maxListedLineEndings: 2 } });

      const report = await doctorReport(dir);

      const check = find(report, 'git-line-endings');
      if (row.expected === null) {
        assert.equal(check, undefined, JSON.stringify(report.checks));
        return;
      }
      assert.ok(check, `missing git-line-endings check: ${JSON.stringify(report.checks)}`);
      assert.equal(check.ok, true);
      assert.equal(check.warning, true);
      assert.equal(check.message, row.expected);
    });
  }

  it('prints no git-line-endings line with vcs off', async () => {
    const dir = await stageRepo({ 'win.txt': 'a\r\nb\r\n' });
    await writeConfig(dir, { vcs: { enabled: false } });

    const report = await doctorReport(dir);

    assert.equal(find(report, 'git-line-endings'), undefined);
  });

  it('keeps doctor exit code 0 while printing the warning', async () => {
    const dir = await stageRepo({ 'win.txt': 'a\r\nb\r\n' });
    await writeConfig(dir, { vcs: ENABLED });
    await writeHealthyRepo(dir);

    const report = await doctorReport(dir);
    assert.equal(report.ok, true, JSON.stringify(report.checks));

    const lines: string[] = [];
    await doctorCommand({ report, stdout: (line) => lines.push(line) });

    assert.ok(
      lines.some((line) => line.startsWith('[warn] git-line-endings:') && line.includes('win.txt')),
      lines.join(''),
    );
  });

  it('defaults maxListedLineEndings to 5', () => {
    assert.equal(DEFAULT_CONFIG.limits.maxListedLineEndings, 5);
  });
});
