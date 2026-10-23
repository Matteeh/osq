import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { scenario } from '@matteeh/osq/testing';
import { retryCommand } from '../src/cli/retry.js';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { commitArchivedRetry } from '../src/core/lifecycle/retry-archived.js';
import { retrySpec } from '../src/core/lifecycle/retry.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { getEventsPath } from '../src/core/status/layout.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherCycle } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGE_ID = '001-order-flow';
const CHANGE_REL = path.posix.join('openspec', 'changes', CHANGE_ID);
const ARCHIVE_REL = path.posix.join('openspec', 'changes', 'archive', CHANGE_ID);
const IN_SCOPE = 'src/one.txt';
const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHANGE_DIR = '302-archive-commit-recovery';

// The living watcher-and-harness spec repeats a scenario name, so the helper's
// global lookup cannot read it. Prove this change's delta over a clean spec.
const LOOKUP_ROOT = fsSync.mkdtempSync(path.join(os.tmpdir(), 'osq-archive-spec-'));
const livingSpec = path.join(LOOKUP_ROOT, 'openspec', 'specs', 'watcher-and-harness', 'spec.md');
fsSync.mkdirSync(path.dirname(livingSpec), { recursive: true });
fsSync.writeFileSync(
  livingSpec,
  '# watcher-and-harness Specification\n\n## Purpose\n\nArchive commit recovery.\n\n## Requirements\n',
  'utf8',
);
const deltaSource = path.join(
  REPO_ROOT,
  'openspec',
  'changes',
  'archive',
  CHANGE_DIR,
  'specs',
  'watcher-and-harness',
  'spec.md',
);
const deltaTarget = path.join(
  LOOKUP_ROOT,
  'openspec',
  'changes',
  CHANGE_DIR,
  'specs',
  'watcher-and-harness',
  'spec.md',
);
fsSync.mkdirSync(path.dirname(deltaTarget), { recursive: true });
fsSync.copyFileSync(deltaSource, deltaTarget);
process.chdir(LOOKUP_ROOT);
process.env.OSQ_CHANGE = path.join(LOOKUP_ROOT, 'openspec', 'changes', CHANGE_DIR);

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

after(() => {
  process.chdir(REPO_ROOT);
  fsSync.rmSync(LOOKUP_ROOT, { recursive: true, force: true });
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

async function statusLines(cwd: string): Promise<string[]> {
  const output = await git(['status', '--porcelain'], cwd);
  return output.split('\n').filter((line) => line.trim().length > 0);
}

async function commitSubjects(cwd: string): Promise<string[]> {
  const output = await git(['log', '--format=%s'], cwd);
  return output.split('\n').filter((line) => line.trim().length > 0);
}

interface ParsedEvent {
  type: string;
  data?: Record<string, unknown>;
}

async function readEvents(folderPath: string): Promise<ParsedEvent[]> {
  const raw = await fs.readFile(getEventsPath(folderPath, 'change'), 'utf8').catch(() => '');
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

function parseMarker(content: string): { reason: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (!match) return { reason: '', body: content.trim() };
  const reason = /(?:^|\n)reason:\s*(.+)/.exec(match[1] ?? '')?.[1]?.trim() ?? '';
  return { reason, body: (match[2] ?? '').trim() };
}

async function readRegressed(folderPath: string, name = 'change.md'): Promise<string | null> {
  return fs.readFile(path.join(folderPath, '.run', 'regressed', name), 'utf8').catch(() => null);
}

function commitFailedEvents(events: readonly ParsedEvent[]): number {
  return events.filter(
    (event) => event.type === 'regressed' && event.data?.reason === 'commit_failed',
  ).length;
}

const PASSING_VERIFY = 'process.exit(0);\n';

function proposalMarkdown(): string {
  return [
    '---',
    'title: Order Flow',
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    'Run the task.',
    '',
    '## Surface',
    'None.',
    '',
    '## Human steps',
    'None',
    '',
  ].join('\n');
}

function taskMarkdown(): string {
  return [
    '---',
    'title: First task',
    'verify: node verify.cjs',
    `scope: ${JSON.stringify([IN_SCOPE])}`,
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] does the thing',
    '',
  ].join('\n');
}

async function writeChange(folderPath: string): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMarkdown(), 'utf8');
  await fs.writeFile(path.join(folderPath, 'tasks.md'), '# Tasks\n\n- [ ] 1. First task\n', 'utf8');
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), taskMarkdown(), 'utf8');
}

interface Project {
  readonly repo: string;
  readonly worktree: string;
  readonly worktreeFolder: string;
  readonly archivedFolder: string;
  readonly config: OsqConfig;
}

/** A committed temp repository with one change approved into a linked worktree. */
async function setupProject(commitRetries?: number): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-archive-recovery-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), PASSING_VERIFY, 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, 'src', 'existing.txt'), 'seed\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  await writeChange(path.join(repo, CHANGE_REL));

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  const config = defineConfig({
    vcs,
    gates: {
      ...DEFAULT_GATES_CONFIG,
      preSpawnVerify: 'off',
      ...(commitRetries === undefined ? {} : { commitRetries }),
    },
  });
  const result = await approveSpec(repo, '001', config);
  const worktree = result.worktreePath;
  assert.ok(worktree, 'approval created a worktree');
  return {
    repo,
    worktree,
    worktreeFolder: path.join(worktree, CHANGE_REL),
    archivedFolder: path.join(worktree, ARCHIVE_REL),
    config,
  };
}

async function installHook(repo: string): Promise<void> {
  const hooksDir = path.join(repo, '.git', 'hooks');
  await fs.mkdir(hooksDir, { recursive: true });
  const script = [
    '#!/bin/sh',
    "if git diff --cached --name-only | grep -q 'openspec/changes/archive/'; then",
    '  echo "blocked by hook" >&2',
    '  exit 1',
    'fi',
    'exit 0',
    '',
  ].join('\n');
  await fs.writeFile(path.join(hooksDir, 'pre-commit'), script, { mode: 0o755 });
}

async function removeHook(repo: string): Promise<void> {
  await fs.rm(path.join(repo, '.git', 'hooks', 'pre-commit'), { force: true });
}

/** Fake adapter whose spawn edits the task's scoped file under its project root. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    await fs.writeFile(path.join(options.projectRoot, IN_SCOPE), 'task 1\n', 'utf8');
    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(path.join(resultsDir, '1.md'), '# Agent result\n', 'utf8');
    return { exitCode: 0 };
  }
}

type Cycle = (project: Project) => Promise<unknown>;

async function directCycle(project: Project): Promise<void> {
  await runWatcherCycle(project.repo, project.config, new ActingAdapter());
}

/** Install the hook that refuses archive commits, then run the task and archive cycle. */
async function archiveFails(project: Project, cycle: Cycle): Promise<void> {
  await installHook(project.repo);
  await cycle(project);
}

/** Spend the catch-up budget while the refusing hook stays in place. */
async function spendBudget(project: Project, cycle: Cycle): Promise<void> {
  await archiveFails(project, cycle);
  await cycle(project);
  await cycle(project);
}

function commandResult(): {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
} {
  return { stdout: () => {}, stderr: () => {} };
}

scenario(
  'watcher-and-harness',
  'Archive commit fails on a hook',
  {
    covers: (project: Project) =>
      runWatcherCycle(project.repo, project.config, new ActingAdapter()),
  },
  async ({ run, then }) => {
    const project = await setupProject();
    const cycle: Cycle = (p) => run(p);
    await archiveFails(project, cycle);

    await then(
      "the archived folder's `.run/regressed/change.md` has reason `commit_failed` and holds `blocked by hook`, its `.run/events/change.jsonl` ends with a `regressed` event for task `change` with reason `commit_failed`, and the branch's newest commit is not `osq: <id> archived`",
      async () => {
        const marker = await readRegressed(project.archivedFolder);
        assert.ok(marker, 'the archived folder holds the marker');
        assert.equal(parseMarker(marker).reason, 'commit_failed');
        assert.match(parseMarker(marker).body, /blocked by hook/);
        const last = (await readEvents(project.archivedFolder)).at(-1);
        assert.equal(last?.type, 'regressed');
        assert.equal(last?.data?.task, 'change');
        assert.equal(last?.data?.reason, 'commit_failed');
        assert.notEqual((await commitSubjects(project.worktree))[0], 'osq: 001 archived');
      },
    );
  },
);

scenario(
  'watcher-and-harness',
  'Archive commit caught up',
  {
    covers: (project: Project) =>
      runWatcherCycle(project.repo, project.config, new ActingAdapter()),
  },
  async ({ run, then }) => {
    const project = await setupProject();
    const cycle: Cycle = (p) => run(p);
    await archiveFails(project, cycle);
    await removeHook(project.repo);
    await cycle(project);

    await then(
      "the branch's newest commit is `osq: <id> archived` with `archived to <archivePath>`, `git status` in the worktree is empty, the archived folder holds no `.run/regressed/change.md`, its `.run/regressed/change.1.md` holds `blocked by hook`, and its `.run/events/change.jsonl` ends with a `retry` event whose target is `change` and whose `automatic` is true",
      async () => {
        assert.equal((await commitSubjects(project.worktree))[0], 'osq: 001 archived');
        const body = await git(['log', '-1', '--format=%B'], project.worktree);
        assert.match(body, /archived to openspec\/changes\/archive\/001-order-flow/);
        assert.deepEqual(await statusLines(project.worktree), []);
        assert.equal(await readRegressed(project.archivedFolder), null);
        const retained = await readRegressed(project.archivedFolder, 'change.1.md');
        assert.ok(retained, 'the failed halt is retained');
        assert.match(parseMarker(retained).body, /blocked by hook/);
        const last = (await readEvents(project.archivedFolder)).at(-1);
        assert.equal(last?.type, 'retry');
        assert.equal(last?.data?.target, 'change');
        assert.equal(last?.data?.automatic, true);
      },
    );
  },
);

scenario(
  'watcher-and-harness',
  'Archive catch-up budget spent',
  {
    covers: (project: Project) =>
      runWatcherCycle(project.repo, project.config, new ActingAdapter()),
  },
  async ({ run, then }) => {
    const project = await setupProject(2);
    const cycle: Cycle = (p) => run(p);
    await archiveFails(project, cycle);
    const headAfterFailure = await git(['rev-parse', 'HEAD'], project.worktree);
    for (let index = 0; index < 5; index += 1) await cycle(project);

    await then(
      "the archived folder's `.run/events/change.jsonl` holds exactly three `regressed` events with reason `commit_failed`, and the branch's newest commit is unchanged",
      async () => {
        assert.equal(commitFailedEvents(await readEvents(project.archivedFolder)), 3);
        assert.equal(await git(['rev-parse', 'HEAD'], project.worktree), headAfterFailure);
      },
    );
  },
);

scenario(
  'watcher-and-harness',
  'Retry commits a failed archive',
  { covers: retryCommand },
  async ({ run, then }) => {
    const project = await setupProject(2);
    await spendBudget(project, directCycle);
    await removeHook(project.repo);
    await run('001', 'change', {
      cwd: project.repo,
      config: project.config,
      ...commandResult(),
    });

    await then(
      "the branch's newest commit is `osq: <id> archived`, `git status` in the worktree is empty, and the archived folder holds no `.run/regressed/change.md`",
      async () => {
        assert.equal((await commitSubjects(project.worktree))[0], 'osq: 001 archived');
        assert.deepEqual(await statusLines(project.worktree), []);
        assert.equal(await readRegressed(project.archivedFolder), null);
      },
    );
  },
);

scenario(
  'watcher-and-harness',
  'Retry while the hook still refuses',
  { covers: commitArchivedRetry },
  async ({ run, then }) => {
    const project = await setupProject(2);
    await spendBudget(project, directCycle);
    const beforeMarker = await readRegressed(project.archivedFolder);
    const beforeEvents = await fs.readFile(getEventsPath(project.archivedFolder, 'change'), 'utf8');
    const result = await retrySpec(project.repo, '001', 'change', project.config);
    let failure: Error | null = null;
    try {
      await run(project.repo, project.config, result);
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
    }

    await then(
      "it fails with a message that starts with `osq could not commit the archive: ` and holds `blocked by hook`, the archived folder's `.run/regressed/change.md` and `.run/events/change.jsonl` hold what they held before, and the archived folder is still in the worktree's archive directory",
      async () => {
        assert.ok(failure, 'the retry commit failed');
        assert.ok(failure.message.startsWith('osq could not commit the archive: '));
        assert.match(failure.message, /blocked by hook/);
        assert.equal(await readRegressed(project.archivedFolder), beforeMarker);
        assert.equal(
          await fs.readFile(getEventsPath(project.archivedFolder, 'change'), 'utf8'),
          beforeEvents,
        );
        assert.equal(await fs.stat(project.archivedFolder).then(() => true), true);
      },
    );
  },
);
