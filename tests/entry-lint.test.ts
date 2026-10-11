import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { CommandError } from '../src/cli/command-error.js';
import { lintCommand } from '../src/cli/lint.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { type LintResult, lintChangeFolder } from '../src/core/spec/linter.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

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

interface LintTask {
  readonly n: number;
  readonly scope: readonly string[];
  readonly entry: readonly string[];
}

function proposalMd(): string {
  return [
    '---',
    'title: Entry lint',
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    'Run the entry lint.',
    '',
    '## Surface',
    'None.',
    '',
  ].join('\n');
}

function taskMd(task: LintTask): string {
  return [
    '---',
    `title: Task ${task.n}`,
    'verify: node verify.cjs',
    `scope: ${JSON.stringify(task.scope)}`,
    `entry: ${JSON.stringify(task.entry)}`,
    'skills: []',
    '---',
    '## Acceptance',
    `- [ ] Task ${task.n} does the thing`,
    '',
  ].join('\n');
}

/** Write an uncommitted change folder with one task per entry. */
async function writeChange(
  repo: string,
  folder: string,
  tasks: readonly LintTask[],
): Promise<string> {
  const dir = path.join(repo, 'openspec', 'changes', folder);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(), 'utf8');
  await fs.writeFile(
    path.join(dir, 'tasks.md'),
    `# Tasks\n\n${tasks.map((task) => `- [ ] ${task.n}. Task ${task.n}`).join('\n')}\n`,
    'utf8',
  );
  for (const task of tasks) {
    await fs.writeFile(path.join(dir, 'tasks', `${task.n}.md`), taskMd(task), 'utf8');
  }
  return dir;
}

/** Write `content` at `relative` under `root`, creating parent folders. */
async function writeAt(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** A temporary git repository with the scaffolded osq project committed. */
async function makeRepo(): Promise<{ repo: string; config: OsqConfig }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-entry-lint-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await writeAt(repo, '.gitignore', 'node_modules/\n.run/running/\n');
  await writeAt(repo, 'verify.cjs', 'process.exit(0);\n');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);
  const config = defineConfig({
    vcs: { enabled: true, author: 'Osq <osq@example.invalid>', worktreeRoot: worktrees },
    gates: { preSpawnVerify: 'off' },
  });
  return { repo, config };
}

/** The lint findings whose message names a task entry. */
function entryFindings(result: LintResult): LintResult['findings'] {
  return result.findings.filter((finding) => /entry names/.test(finding.message));
}

describe('Entry names a file no tree has', () => {
  it('reports an error on the task file and osq lint exits non-zero', async () => {
    const { repo, config } = await makeRepo();
    const changeDir = await writeChange(repo, '001-gone', [
      { n: 1, scope: ['src/one.txt'], entry: ['src/gone.ts'] },
    ]);

    await assert.rejects(lintCommand(['001'], { cwd: repo, config }), (error: unknown) => {
      assert.ok(error instanceof CommandError, String(error));
      assert.equal(error.exitCode, 1);
      return true;
    });

    const result = await lintChangeFolder(repo, changeDir, config);
    assert.equal(result.valid, false);
    assert.deepEqual(
      entryFindings(result).map((finding) => ({
        file: finding.file,
        severity: finding.severity,
        message: finding.message,
      })),
      [
        {
          file: 'openspec/changes/001-gone/tasks/1.md',
          severity: 'error',
          message:
            'Task 1 entry names src/gone.ts, which is not in main and no task up to this one creates',
        },
      ],
    );
  });
});

describe('Entries the change provides', () => {
  it('accepts an entry committed on the default branch', async () => {
    const { repo, config } = await makeRepo();
    await writeAt(repo, 'src/a.ts', 'x\n');
    await git(['add', '-A'], repo);
    await git(['commit', '-qm', 'add src/a.ts'], repo);
    const changeDir = await writeChange(repo, '001-provided', [
      { n: 1, scope: ['src/one.txt'], entry: ['src/a.ts'] },
    ]);

    const result = await lintChangeFolder(repo, changeDir, config);
    assert.deepEqual(entryFindings(result), []);
    assert.equal(result.valid, true);
  });

  it('accepts an entry an earlier task scope names', async () => {
    const { repo, config } = await makeRepo();
    const changeDir = await writeChange(repo, '001-provided', [
      { n: 1, scope: ['src/one.txt', 'src/new.ts'], entry: [] },
      { n: 2, scope: ['src/one.txt'], entry: ['src/new.ts'] },
    ]);

    const result = await lintChangeFolder(repo, changeDir, config);
    assert.deepEqual(entryFindings(result), []);
    assert.equal(result.valid, true);
  });

  it('accepts an entry its own task scope names', async () => {
    const { repo, config } = await makeRepo();
    const changeDir = await writeChange(repo, '001-provided', [
      { n: 1, scope: ['src/one.txt', 'src/new.ts'], entry: ['src/new.ts'] },
    ]);

    const result = await lintChangeFolder(repo, changeDir, config);
    assert.deepEqual(entryFindings(result), []);
    assert.equal(result.valid, true);
  });

  it('accepts an entry an approved change task scope names, and approve stacks it', async () => {
    const { repo, config } = await makeRepo();
    await writeChange(repo, '001-dep', [{ n: 1, scope: ['src/one.txt', 'src/dep.ts'], entry: [] }]);
    const approveDep = await approveSpec(repo, '001-dep', config);
    assert.ok(approveDep.worktreePath, 'expected a worktree for 001-dep');

    const changeDir = await writeChange(repo, '002-dep', [
      { n: 1, scope: ['src/one.txt'], entry: ['src/dep.ts'] },
    ]);
    const result = await lintChangeFolder(repo, changeDir, config);
    assert.deepEqual(entryFindings(result), []);
    assert.equal(result.valid, true);

    const approve = await approveSpec(repo, '002-dep', config);
    assert.ok(approve.worktreePath ?? approve.stackedPath, 'expected 002-dep approved');
  });

  it('reports an entry that exists only as an ignored file in the checkout', async () => {
    const { repo, config } = await makeRepo();
    await writeAt(repo, 'fixture/.osq/.gitignore', 'x\n');
    await writeAt(repo, '.gitignore', 'node_modules/\n.run/running/\nfixture/.osq/\n');
    await git(['add', '-A'], repo);
    await git(['commit', '-qm', 'ignore fixture/.osq'], repo);
    const changeDir = await writeChange(repo, '001-ignored', [
      { n: 1, scope: ['src/one.txt'], entry: ['fixture/.osq/.gitignore'] },
    ]);

    const result = await lintChangeFolder(repo, changeDir, config);
    assert.equal(result.valid, false);
    assert.deepEqual(
      entryFindings(result).map((finding) => finding.message),
      [
        'Task 1 entry names fixture/.osq/.gitignore, which is not in main and no task up to this one creates',
      ],
    );
  });

  it('reports an entry only a later task scope names', async () => {
    const { repo, config } = await makeRepo();
    const changeDir = await writeChange(repo, '001-later', [
      { n: 1, scope: ['src/one.txt'], entry: [] },
      { n: 2, scope: ['src/one.txt'], entry: ['src/later.ts'] },
      { n: 3, scope: ['src/one.txt', 'src/later.ts'], entry: [] },
    ]);

    const result = await lintChangeFolder(repo, changeDir, config);
    assert.equal(result.valid, false);
    assert.deepEqual(
      entryFindings(result).map((finding) => ({
        file: finding.file,
        message: finding.message,
      })),
      [
        {
          file: 'openspec/changes/001-later/tasks/2.md',
          message:
            'Task 2 entry names src/later.ts, which is not in main and no task up to this one creates',
        },
      ],
    );
  });

  it('with version control off reads the project root and names the project', async () => {
    const { repo } = await makeRepo();
    const config = defineConfig({ gates: { preSpawnVerify: 'off' } });
    await writeAt(repo, 'src/local.ts', 'x\n');
    const present = await writeChange(repo, '001-off', [
      { n: 1, scope: ['src/one.txt'], entry: ['src/local.ts'] },
    ]);
    const ok = await lintChangeFolder(repo, present, config);
    assert.deepEqual(entryFindings(ok), []);

    const missing = await writeChange(repo, '002-off', [
      { n: 1, scope: ['src/one.txt'], entry: ['src/gone.ts'] },
    ]);
    const bad = await lintChangeFolder(repo, missing, config);
    assert.equal(bad.valid, false);
    assert.deepEqual(
      entryFindings(bad).map((finding) => finding.message),
      [
        'Task 1 entry names src/gone.ts, which is not in the project and no task up to this one creates',
      ],
    );
  });
});
