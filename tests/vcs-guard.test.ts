import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import type { Logger } from '../src/core/foundation/logger.js';
import { approveSpec } from '../src/core/spec/approve.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const GIT_AUTHOR = ['-c', 'user.name=osq', '-c', 'user.email=osq@example.invalid'];
const CHANGE_FOLDER = '001-git-guard';
const IN_SCOPE = 'src/in-scope.txt';
const OUT_SCOPE = 'src/out.txt';
const DIRTY = 'dirty.txt';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

/** The test's own git calls ignore redirecting variables, like osq's reads. */
function cleanGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE'])
    Reflect.deleteProperty(env, key);
  return env;
}

async function git(root: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd: root, env: cleanGitEnv() });
}

/** The files every project needs; a git repository commits them, a plain one does not. */
async function writeSeedFiles(root: string): Promise<void> {
  await fs.writeFile(path.join(root, '.gitignore'), '.run/running/\n', 'utf8');
  await fs.writeFile(path.join(root, 'pass.cjs'), 'process.exit(0);\n', 'utf8');
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, IN_SCOPE), 'alpha\n', 'utf8');
  await fs.writeFile(path.join(root, OUT_SCOPE), 'bravo\n', 'utf8');
  await fs.writeFile(path.join(root, DIRTY), 'dirty\n', 'utf8');
}

/** A committed temporary repository whose only differences are the agent's edits. */
async function setupGitRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-vcs-guard-'));
  roots.push(root);
  await git(root, ['init', '-q', '-b', 'main']);
  await writeSeedFiles(root);
  await git(root, ['add', '-A']);
  await git(root, [...GIT_AUTHOR, 'commit', '-qm', 'init']);
  return root;
}

function guardConfig(): OsqConfig {
  return {
    ...DEFAULT_CONFIG,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off' },
  };
}

function proposal(): string {
  return `---
title: Git guard
depends_on: []
verify: node pass.cjs
features:
  reads: []
---
## Goal

Record git moves during a task.

## Surface

None.

## Human steps

None
`;
}

function taskMarkdown(): string {
  return [
    '---',
    'title: When the agent acts, the guard records it',
    'verify: node pass.cjs',
    `scope: ${JSON.stringify([IN_SCOPE])}`,
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] the guard records the act',
    '',
  ].join('\n');
}

const TASKS_MD = '# Tasks\n\n- [ ] 1. When the agent acts, the guard records it\n';

/** Create the change artifacts and approve them, after the repository's commit. */
async function prepareChange(root: string, config: OsqConfig): Promise<string> {
  await installFakeValidator(root);
  await scaffoldProject(root);
  const folder = path.join(root, 'openspec', 'changes', CHANGE_FOLDER);
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folder, 'proposal.md'), proposal(), 'utf8');
  await fs.writeFile(path.join(folder, 'tasks.md'), TASKS_MD, 'utf8');
  await fs.writeFile(path.join(folder, 'tasks', '1.md'), taskMarkdown(), 'utf8');
  await approveSpec(root, '001', config);
  return folder;
}

/** Fake adapter whose spawn performs the scenario's git or file edit, then writes a result. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';

  constructor(private readonly act: (root: string) => Promise<void>) {}

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    await this.act(options.projectRoot);
    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(
      path.join(resultsDir, `${options.taskNumber}.md`),
      '# Agent result\n',
      'utf8',
    );
    return { exitCode: 0 };
  }
}

interface CapturedLogger extends Logger {
  readonly warnings: string[];
}

function collectingLogger(): CapturedLogger {
  const warnings: string[] = [];
  return {
    warnings,
    info: () => {},
    verbose: () => {},
    warn: (msg: string) => warnings.push(msg),
    error: () => {},
    status: () => {},
    clearStatus: () => {},
  };
}

interface ParsedEvent {
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

/** Task events after the watcher archives the completed change. */
async function readEvents(root: string, task = '1'): Promise<ParsedEvent[]> {
  const candidates = [
    path.join(root, 'openspec', 'changes', 'archive', CHANGE_FOLDER, '.run', 'events'),
    path.join(root, 'openspec', 'changes', CHANGE_FOLDER, '.run', 'events'),
  ];
  for (const dir of candidates) {
    const raw = await fs.readFile(path.join(dir, `${task}.jsonl`), 'utf8').catch(() => null);
    if (raw !== null) {
      return raw
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as ParsedEvent);
    }
  }
  return [];
}

function movedOf(events: readonly ParsedEvent[]): string[] {
  const violation = events.find((event) => event.type === 'vcs_violation');
  assert.ok(violation, 'a vcs_violation event is recorded');
  return (violation.data?.moved as string[]) ?? [];
}

function scopeFiles(events: readonly ParsedEvent[]): string[] {
  const violation = events.find((event) => event.type === 'scope_violation');
  return violation ? ((violation.data?.files as string[]) ?? []) : [];
}

describe('Git state recording', () => {
  it('records a head move for a commit and still lands the task', async () => {
    const root = await setupGitRepo();
    const config = guardConfig();
    await prepareChange(root, config);
    const adapter = new ActingAdapter(async (repo) => {
      await fs.writeFile(path.join(repo, IN_SCOPE), 'alpha changed\n', 'utf8');
      await git(repo, ['add', IN_SCOPE]);
      await git(repo, [...GIT_AUTHOR, 'commit', '-qm', 'agent commit']);
    });
    const logger = collectingLogger();

    const summary = await runWatcherOnce(root, config, adapter, logger);

    assert.equal(summary.tasksRun, 1);
    const events = await readEvents(root);
    const violation = events.find((event) => event.type === 'vcs_violation');
    assert.ok(violation, 'the commit is recorded');
    assert.ok(movedOf(events).includes('head'));
    const before = violation.data?.before as { head: string | null };
    const after = violation.data?.after as { head: string | null };
    assert.match(before.head ?? '', /^[0-9a-f]{40}$/);
    assert.notEqual(before.head, after.head);
    assert.ok(events.some((event) => event.type === 'done'));
    assert.ok(logger.warnings.some((warning) => /git state changed/.test(warning)));
  });

  it('records a stash move and leaves HEAD unchanged', async () => {
    const root = await setupGitRepo();
    const config = guardConfig();
    await prepareChange(root, config);
    const adapter = new ActingAdapter(async (repo) => {
      await fs.writeFile(path.join(repo, IN_SCOPE), 'alpha changed\n', 'utf8');
      await git(repo, ['stash', 'push', '-q']);
    });

    await runWatcherOnce(root, config, adapter);

    const events = await readEvents(root);
    assert.ok(movedOf(events).includes('stash'));
    const violation = events.find((event) => event.type === 'vcs_violation');
    const before = violation?.data?.before as { head: string | null };
    const after = violation?.data?.after as { head: string | null };
    assert.equal(before.head, after.head);
    assert.ok(events.some((event) => event.type === 'done'));
  });

  it('records a branch move for a checkout', async () => {
    const root = await setupGitRepo();
    const config = guardConfig();
    await prepareChange(root, config);
    const adapter = new ActingAdapter(async (repo) => {
      await git(repo, ['switch', '-q', '-c', 'other']);
    });

    await runWatcherOnce(root, config, adapter);

    const events = await readEvents(root);
    assert.ok(movedOf(events).includes('branch'));
    assert.ok(events.some((event) => event.type === 'done'));
  });

  it('records an index move for a staged file', async () => {
    const root = await setupGitRepo();
    const config = guardConfig();
    await prepareChange(root, config);
    const adapter = new ActingAdapter(async (repo) => {
      await fs.writeFile(path.join(repo, IN_SCOPE), 'alpha changed\n', 'utf8');
      await git(repo, ['add', IN_SCOPE]);
    });

    await runWatcherOnce(root, config, adapter);

    const events = await readEvents(root);
    assert.ok(movedOf(events).includes('index'));
    assert.ok(events.some((event) => event.type === 'done'));
  });

  it('records neither violation outside git', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-vcs-guard-nogit-'));
    roots.push(root);
    await writeSeedFiles(root);
    const config = guardConfig();
    await prepareChange(root, config);
    const adapter = new ActingAdapter(async (repo) => {
      await fs.writeFile(path.join(repo, OUT_SCOPE), 'bravo changed\n', 'utf8');
    });

    await runWatcherOnce(root, config, adapter);

    const events = await readEvents(root);
    assert.equal(
      events.some((event) => event.type === 'vcs_violation' || event.type === 'scope_violation'),
      false,
    );
    assert.ok(events.some((event) => event.type === 'done'));
  });
});

describe('Scope violation recording', () => {
  it('records an edit outside scope and still lands the task', async () => {
    const root = await setupGitRepo();
    const config = guardConfig();
    await prepareChange(root, config);
    const adapter = new ActingAdapter(async (repo) => {
      await fs.writeFile(path.join(repo, OUT_SCOPE), 'bravo changed\n', 'utf8');
    });

    await runWatcherOnce(root, config, adapter);

    const events = await readEvents(root);
    assert.deepEqual(scopeFiles(events), [OUT_SCOPE]);
    assert.equal(
      events.some((event) => event.type === 'vcs_violation'),
      false,
      'a working-tree edit does not move git state',
    );
    assert.ok(events.some((event) => event.type === 'done'));
  });

  it('leaves a file dirty before spawn alone and records nothing', async () => {
    const root = await setupGitRepo();
    const config = guardConfig();
    await prepareChange(root, config);
    await fs.writeFile(path.join(root, DIRTY), 'human edit\n', 'utf8');
    const adapter = new ActingAdapter(async () => {});

    await runWatcherOnce(root, config, adapter);

    const events = await readEvents(root);
    assert.equal(scopeFiles(events).length, 0);
    assert.ok(events.some((event) => event.type === 'done'));
  });

  it('records a file that was dirty before spawn and edited again', async () => {
    const root = await setupGitRepo();
    const config = guardConfig();
    await prepareChange(root, config);
    await fs.writeFile(path.join(root, DIRTY), 'human edit\n', 'utf8');
    const adapter = new ActingAdapter(async (repo) => {
      await fs.appendFile(path.join(repo, DIRTY), 'agent edit\n', 'utf8');
    });

    await runWatcherOnce(root, config, adapter);

    const events = await readEvents(root);
    assert.deepEqual(scopeFiles(events), [DIRTY]);
    assert.ok(events.some((event) => event.type === 'done'));
  });
});
