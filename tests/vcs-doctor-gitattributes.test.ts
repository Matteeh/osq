import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { doctorCommand } from '../src/cli/doctor.js';
import { type DoctorReport, runDoctorChecks } from '../src/core/foundation/doctor.js';
import { GITATTRIBUTES_BLOCK } from '../src/core/foundation/gitattributes-block.js';
import {
  MANAGED_AGENTS_MD_BODY,
  MANAGED_CLAUDE_PLAN_COMMAND,
  MANAGED_PLANNER_BLOCK,
} from '../src/core/foundation/init.js';
import { OPENSPEC_EXPECTED_VERSION } from '../src/core/spec/linter.js';

const execFileAsync = promisify(execFile);
const GIT_ENV_KEYS = ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE'] as const;
const B = GITATTRIBUTES_BLOCK;
const MESSAGE = '.gitattributes has no current osq line endings block; run osq init';
const ENABLED = { enabled: true, author: 'osq <osq@example.invalid>' };

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

/** A temporary repository on `main` with one commit and `core.autocrlf` false. */
async function initRepo(dir: string): Promise<void> {
  await git(['init', '-q', '-b', 'main'], dir);
  await git(['config', 'core.autocrlf', 'false'], dir);
  await fs.writeFile(path.join(dir, 'seed.txt'), 'seed\n', 'utf8');
  await git(['add', '-A'], dir);
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

/** Stage a tracked file whose index line ending is CRLF, for the warning trio. */
async function stageCrlfFile(root: string): Promise<void> {
  await fs.writeFile(path.join(root, 'win.txt'), 'a\r\nb\r\n', 'utf8');
  await git(['add', 'win.txt'], root);
}

/** The full doctor report with a hermetic validator probe. */
function doctorReport(root: string): Promise<DoctorReport> {
  return runDoctorChecks(root, { probeValidator: async () => OPENSPEC_EXPECTED_VERSION });
}

function find(report: DoctorReport, name: string) {
  return report.checks.find((check) => check.name === name) as
    | { name: string; ok: boolean; message: string; warning?: boolean }
    | undefined;
}

/** One row of the cli-foundation "Gitattributes warning text" table. */
const WARNING_TEXT_ROWS: {
  readonly label: string;
  readonly contents: string | null;
  readonly expected: string | null;
}[] = [
  { label: 'missing', contents: null, expected: MESSAGE },
  { label: 'no block', contents: '*.png binary\n', expected: MESSAGE },
  {
    label: 'stale block',
    contents: `${B.replace('* text=auto', '* text=auto eol=lf')}\n`,
    expected: MESSAGE,
  },
  { label: 'current block', contents: `${B}\n`, expected: null },
  { label: 'current block below text', contents: `*.png binary\n${B}\n`, expected: null },
];

describe('doctor gitattributes warning', () => {
  it('Gitattributes warning text', async () => {
    for (const row of WARNING_TEXT_ROWS) {
      const dir = await makeTempDir('osq-gitattributes-doctor-');
      await initRepo(dir);
      await writeConfig(dir, ENABLED);
      if (row.contents !== null) {
        await fs.writeFile(path.join(dir, '.gitattributes'), row.contents, 'utf8');
      }

      const report = await doctorReport(dir);

      const check = find(report, 'gitattributes');
      if (row.expected === null) {
        assert.equal(check, undefined, `${row.label}: ${JSON.stringify(report.checks)}`);
        continue;
      }
      assert.ok(check, `${row.label}: missing gitattributes check`);
      assert.equal(check.ok, true, row.label);
      assert.equal(check.warning, true, row.label);
      assert.equal(check.message, row.expected, row.label);
    }
  });

  it('Gitattributes with version control off', async () => {
    const dir = await makeTempDir('osq-gitattributes-doctor-off-');
    await initRepo(dir);
    await writeConfig(dir, { enabled: false });

    const report = await doctorReport(dir);

    assert.equal(find(report, 'gitattributes'), undefined);
  });

  it('Gitattributes warning keeps exit code', async () => {
    const dir = await makeTempDir('osq-gitattributes-doctor-exit-');
    await initRepo(dir);
    await writeConfig(dir, ENABLED);
    await writeHealthyRepo(dir);
    await stageCrlfFile(dir);
    await git(['config', 'commit.gpgsign', 'true'], dir);

    const report = await doctorReport(dir);
    assert.equal(report.ok, true, JSON.stringify(report.checks));

    const attributes = find(report, 'gitattributes');
    assert.ok(attributes, JSON.stringify(report.checks));
    assert.equal(attributes.ok, true);
    assert.equal(attributes.warning, true);
    assert.equal(attributes.message, MESSAGE);

    const names = report.checks.map((check) => check.name);
    assert.ok(names.indexOf('git-signing') < names.indexOf('gitattributes'), names.join(', '));
    assert.ok(names.indexOf('gitattributes') < names.indexOf('git-line-endings'), names.join(', '));

    const lines: string[] = [];
    await doctorCommand({ report, stdout: (line) => lines.push(line) });

    assert.ok(
      lines.some((line) => line.startsWith('[warn] gitattributes:') && line.includes('osq init')),
      lines.join(''),
    );
  });
});
