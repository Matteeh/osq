import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, before, describe } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { scenario } from '@matteeh/osq/testing';
import { runCli } from '../src/cli/run.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { NestedRootError, selectVcs } from '../src/core/vcs/select.js';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const GIT_AUTHOR = ['-c', 'user.name=osq', '-c', 'user.email=osq@example.invalid'];
const CONFIG_TEXT = `export default { harness: 'mock', vcs: { enabled: true, author: 'osq <osq@example.com>' } };\n`;
const PROPOSAL_TEXT = '---\ntitle: Alpha\nverify: node verify.cjs\n---\n## Goal\n\nAlpha.\n';
const TASK_TEXT = '---\ntitle: T\nverify: node verify.cjs\nscope:\n  - a.txt\n---\n- [ ] a\n';

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

/** Every file outside `.git`, relative to `root` and sorted. */
async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else files.push(path.relative(root, full));
    }
  };
  await walk(root);
  return files.sort();
}

/** The repository state the scenario compares before and after a command. */
interface RepoState {
  readonly status: string;
  readonly branches: string;
  readonly worktrees: string;
  readonly files: readonly string[];
}

async function repoState(root: string): Promise<RepoState> {
  return {
    status: await git(['status', '--porcelain=v1', '--untracked-files=all'], root),
    branches: await git(['branch', '--list'], root),
    worktrees: await git(['worktree', 'list', '--porcelain'], root),
    files: await listFiles(root),
  };
}

interface Fixture {
  readonly outer: string;
  readonly sub: string;
  readonly config: OsqConfig;
  readonly message: string;
}

/** Create `<outer>` with the committed `sub` project the scenarios describe. */
async function makeFixture(): Promise<Fixture> {
  const raw = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-vcs-root-'));
  tmpDirs.push(raw);
  const outer = await fs.realpath(raw);
  await git(['init', '-q', '-b', 'main'], outer);
  const sub = path.join(outer, 'sub');
  await fs.mkdir(path.join(sub, 'openspec', 'specs'), { recursive: true });
  await fs.mkdir(path.join(sub, 'openspec', 'changes', '001-alpha', 'tasks'), { recursive: true });
  await fs.writeFile(path.join(sub, 'osq.config.ts'), CONFIG_TEXT, 'utf8');
  await fs.writeFile(path.join(sub, 'openspec', 'specs', '.gitkeep'), '', 'utf8');
  await fs.writeFile(
    path.join(sub, 'openspec', 'changes', '001-alpha', 'proposal.md'),
    PROPOSAL_TEXT,
    'utf8',
  );
  await fs.writeFile(
    path.join(sub, 'openspec', 'changes', '001-alpha', 'tasks', '1.md'),
    TASK_TEXT,
    'utf8',
  );
  await git(['add', '-A'], outer);
  await git([...GIT_AUTHOR, 'commit', '-qm', 'init'], outer);
  const config: OsqConfig = {
    ...DEFAULT_CONFIG,
    harness: 'mock',
    vcs: { enabled: true, author: 'osq <osq@example.com>' },
  };
  const message =
    `${sub} is inside the git repository at ${outer} but is not its top level; ` +
    `run osq from ${outer} or set vcs.enabled to false`;
  return { outer, sub, config, message };
}

interface Capture {
  readonly exitCode: number | undefined;
  readonly stdout: string;
  readonly stderr: string;
}

/** Run `work` in `cwd`, capturing both streams and the exit code, then restore. */
async function captured(cwd: string, work: () => Promise<void>): Promise<Capture> {
  const originalCwd = process.cwd();
  const originalExitCode = process.exitCode;
  const originalStdout = process.stdout.write;
  const originalStderr = process.stderr.write;
  const originalExit = process.exit;
  let stdout = '';
  let stderr = '';
  let exitCode: number | undefined;

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stderr.write;
  process.exit = ((_code?: number) => {
    throw new Error('process.exit called');
  }) as unknown as typeof process.exit;

  try {
    process.chdir(cwd);
    process.exitCode = undefined;
    await work();
    exitCode = process.exitCode;
  } finally {
    process.chdir(originalCwd);
    process.exitCode = originalExitCode;
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
    process.exit = originalExit;
  }
  return { exitCode, stdout, stderr };
}

/** A scenario table cell without its markdown code ticks. */
function bare(cell: string): string {
  return cell.replace(/^`|`$/g, '');
}

scenario(
  'version-control',
  'Folder below the root with git on',
  { covers: selectVcs },
  async ({ run, then }) => {
    const { sub, config, message } = await makeFixture();
    const outcome = await run(sub, config).then(
      (vcs) => ({ vcs, error: undefined }),
      (error: unknown) => ({ vcs: undefined, error }),
    );
    await then(
      'it rejects with a `NestedRootError` whose message is `<outer>/sub is inside the git repository at <outer> but is not its top level; run osq from <outer> or set vcs.enabled to false`, with `<outer>` written as its real path',
      () => {
        assert.ok(outcome.error instanceof NestedRootError, String(outcome.error));
        assert.equal(outcome.error.message, message);
      },
    );
  },
);

scenario(
  'version-control',
  'Commands below the root with git on',
  { covers: runCli },
  async ({ run, each }) => {
    const { outer, sub, message } = await makeFixture();
    await each(
      'the exit code is 1, stderr holds the message of "Folder below the root with git on", and `<outer>`\'s `git status --porcelain=v1 --untracked-files=all`, `git branch --list`, `git worktree list --porcelain` and its list of files outside `.git` are what they were before the command',
      async (row) => {
        const before = await repoState(outer);
        const argv = bare(row.Command ?? '').split(' ');
        const capture = await captured(sub, () => run(['node', 'osq', ...argv]));
        assert.equal(capture.exitCode, 1, `${row.Command}: ${capture.stdout}${capture.stderr}`);
        assert.ok(
          capture.stderr.includes(message),
          `${row.Command} stderr was ${JSON.stringify(capture.stderr)}`,
        );
        assert.deepEqual(await repoState(outer), before, row.Command);
      },
    );
  },
);

/**
 * The living cli-foundation spec has two scenarios named "Explicit settings
 * win", so `lookupScenario` refuses it before a new scenario can run. Use a
 * copy with one name renamed for the duration of this one lookup.
 */
describe('cli-foundation scenario lookup', () => {
  let world: string;
  let previousChange: string | undefined;

  before(async () => {
    world = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-vcs-spec-'));
    tmpDirs.push(world);
    const living = await fs.readFile(
      path.join(REPO_ROOT, 'openspec', 'specs', 'cli-foundation', 'spec.md'),
      'utf8',
    );
    const start = living.indexOf('### Requirement: Config error exit');
    const end = living.indexOf('\n### Requirement:', start + 1);
    if (start === -1) throw new Error('cli-foundation spec has no Config error exit');
    const requirement = end === -1 ? living.slice(start) : living.slice(start, end);
    const deduped = `## Requirements\n\n${requirement}\n`;
    const specsDir = path.join(world, 'openspec', 'specs', 'cli-foundation');
    const changeDir = path.join(
      world,
      'openspec',
      'changes',
      'lookup-change',
      'specs',
      'cli-foundation',
    );
    await fs.mkdir(specsDir, { recursive: true });
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(path.join(specsDir, 'spec.md'), deduped, 'utf8');
    const source = process.env.OSQ_CHANGE
      ? path.resolve(process.env.OSQ_CHANGE)
      : path.join(REPO_ROOT, 'openspec', 'changes', '315-vcs-root-fails-fast');
    await fs.copyFile(
      path.join(source, 'specs', 'cli-foundation', 'spec.md'),
      path.join(changeDir, 'spec.md'),
    );
    previousChange = process.env.OSQ_CHANGE;
    process.env.OSQ_CHANGE = path.join(world, 'openspec', 'changes', 'lookup-change');
  });

  after(() => {
    if (previousChange === undefined) Reflect.deleteProperty(process.env, 'OSQ_CHANGE');
    else process.env.OSQ_CHANGE = previousChange;
  });

  scenario(
    'cli-foundation',
    'Doctor below the repository root with git on',
    { covers: runCli },
    async ({ run, then }) => {
      const { sub, message } = await makeFixture();
      const capture = await captured(sub, () => run(['node', 'osq', 'doctor']));
      await then(
        'stderr is exactly `Error: ` followed by the message of version-control "Folder below the root with git on" and a newline, and the exit code is 1',
        () => {
          assert.equal(capture.stderr, `Error: ${message}\n`);
          assert.equal(capture.exitCode, 1);
        },
      );
    },
  );
});
