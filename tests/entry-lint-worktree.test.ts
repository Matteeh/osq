import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { lintCommand } from '../src/cli/lint.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { type LintResult, lintChangeFolder } from '../src/core/spec/linter.js';
import { getChangesDir } from '../src/core/status/layout.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGES = getChangesDir('openspec').split(path.sep).join('/');
const FOLDER = '001-steer';

const tmpDirs: string[] = [];

const silentLogger = {
  info: () => {},
  verbose: () => {},
  warn: () => {},
  error: () => {},
};

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

/** Write `content` at `relative` under `root`, creating parent folders. */
async function writeAt(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

function proposalMd(): string {
  return [
    '---',
    'title: Steer',
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    'Prove the change folder is read where it lives.',
    '',
    '## Surface',
    'None',
    '',
  ].join('\n');
}

function taskMd(entry: string): string {
  return [
    '---',
    'title: Steer',
    'verify: node verify.cjs',
    'scope: []',
    `entry: ${JSON.stringify([entry])}`,
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] Task 1 does the thing',
    '',
  ].join('\n');
}

function deltaMd(): string {
  return [
    '# Spec Delta',
    '',
    '## ADDED Requirements',
    '',
    '### Requirement: Alpha',
    '',
    'The alpha capability SHALL exist.',
    '',
    '#### Scenario: Alpha runs',
    '- **WHEN** alpha runs',
    '- **THEN** it exists',
    '',
  ].join('\n');
}

/** Write the uncommitted change folder into the checkout. */
async function writeChange(repo: string, entry: string): Promise<string> {
  const dir = path.join(repo, CHANGES, FOLDER);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(), 'utf8');
  await fs.writeFile(path.join(dir, 'tasks.md'), '# Tasks\n\n- [ ] 1. Steer\n', 'utf8');
  await fs.writeFile(path.join(dir, 'tasks', '1.md'), taskMd(entry), 'utf8');
  await writeAt(dir, 'specs/alpha/spec.md', deltaMd());
  return dir;
}

/** A temporary git repository with the scaffolded osq project committed. */
async function makeRepo(): Promise<{ repo: string; config: OsqConfig; worktrees: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-entry-lint-worktree-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await fs.mkdir(worktrees, { recursive: true });
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
  return { repo, config, worktrees };
}

/** Cut the branch's worktree, then move the uncommitted change folder into it. */
async function moveChangeToWorktree(
  repo: string,
  worktrees: string,
  changeDir: string,
): Promise<string> {
  const worktree = path.join(worktrees, FOLDER);
  await git(['worktree', 'add', '-q', '-b', `osq/${FOLDER}`, worktree], repo);
  const folderPath = path.join(worktree, CHANGES, FOLDER);
  await fs.mkdir(path.dirname(folderPath), { recursive: true });
  await fs.rename(changeDir, folderPath);
  return folderPath;
}

/** The lint findings whose message names a task entry. */
function entryFindings(result: LintResult): LintResult['findings'] {
  return result.findings.filter((finding) => /entry names/.test(finding.message));
}

interface Row {
  readonly name: string;
  readonly entry: string;
  readonly worktree: boolean;
  readonly missing: boolean;
}

const ROWS: readonly Row[] = [
  {
    name: 'accepts a plain entry naming the delta that exists only in the worktree',
    entry: `${CHANGES}/${FOLDER}/specs/alpha/spec.md`,
    worktree: true,
    missing: false,
  },
  {
    name: 'accepts a pattern entry matching only in the worktree',
    entry: `${CHANGES}/${FOLDER}/specs/**`,
    worktree: true,
    missing: false,
  },
  {
    name: 'reports an entry absent from the worktree change folder',
    entry: `${CHANGES}/${FOLDER}/notes/gone.md`,
    worktree: true,
    missing: true,
  },
  {
    name: 'accepts a plain entry naming the delta that exists only in the checkout',
    entry: `${CHANGES}/${FOLDER}/specs/alpha/spec.md`,
    worktree: false,
    missing: false,
  },
  {
    name: 'reports an entry absent from the checkout change folder',
    entry: `${CHANGES}/${FOLDER}/notes/gone.md`,
    worktree: false,
    missing: true,
  },
];

describe('Entries inside the change folder', () => {
  for (const row of ROWS) {
    it(row.name, async () => {
      const { repo, config, worktrees } = await makeRepo();
      const changeDir = await writeChange(repo, row.entry);
      const folderPath = row.worktree
        ? await moveChangeToWorktree(repo, worktrees, changeDir)
        : changeDir;

      const result = await lintChangeFolder(repo, folderPath, config);

      if (!row.missing) {
        assert.deepEqual(entryFindings(result), []);
        return;
      }
      const findings = entryFindings(result);
      assert.equal(findings.length, 1, JSON.stringify(findings));
      assert.ok(findings[0].message.includes(row.entry), findings[0].message);
    });
  }
});

describe('Steered change linted from main', () => {
  it('reports no entry error for a done task naming its own delta in the worktree', async () => {
    const { repo, config, worktrees } = await makeRepo();
    const changeDir = await writeChange(repo, `${CHANGES}/${FOLDER}/specs/alpha/spec.md`);
    const folderPath = await moveChangeToWorktree(repo, worktrees, changeDir);
    await writeAt(folderPath, '.run/approved', 'hash\n');
    await writeAt(folderPath, '.run/done/1', 'hash\n');

    const result = await lintCommand(['001'], {
      cwd: repo,
      config,
      logger: silentLogger,
    });

    assert.equal(result.valid, true, JSON.stringify(result.entries));
    assert.equal(result.entries.length, 1, JSON.stringify(result.entries));
    const entry = result.entries[0];
    assert.ok(entry !== undefined, JSON.stringify(result.entries));
    assert.deepEqual(entryFindings(entry.result), []);
  });
});
