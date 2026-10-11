import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { readChangeFolder } from '../src/core/status/state.js';
import { deriveSteering, describeTrigger } from '../src/core/status/steering.js';
import {
  ScriptedAdapter,
  assertOk,
  createRecoveryProject,
  exists,
  git,
} from './recovery-support.js';

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

const CHANGE_REL = path.posix.join('openspec', 'changes', '001-order-flow');

function taskMarkdown(scope: readonly string[], entry: readonly string[]): string {
  return [
    '---',
    'title: First task',
    'verify: node verify.cjs',
    `scope: ${JSON.stringify(scope)}`,
    `entry: ${JSON.stringify(entry)}`,
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] First task does the thing',
    '',
  ].join('\n');
}

/** Rewrite `tasks/1.md` of the change folder at `folderPath` with `entry`. */
async function writeTaskFile(
  folderPath: string,
  entry: readonly string[],
  scope: readonly string[] = ['src/one.txt'],
): Promise<void> {
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), taskMarkdown(scope, entry), 'utf8');
}

async function readIfPresent(target: string): Promise<string> {
  return fs.readFile(target, 'utf8').catch(() => '');
}

describe('Entry names a removed file', () => {
  it('ends the task as entry_missing before the executor starts', async () => {
    const project = await createRecoveryProject(tmpDirs, {
      tasks: [{ title: 'First task', scope: 'src/one.txt' }],
      files: { 'src/gone.ts': 'x\n' },
      autoRetries: 1,
    });
    // A planner names a file a refactor removed, before the human approves.
    await writeTaskFile(path.join(project.repo, CHANGE_REL), ['src/gone.ts']);
    assertOk(await project.approve(), 'approve');
    // The file is committed on main, so lint accepts the entry; remove it in
    // the worktree before the watcher's runtime check runs.
    await git(['rm', 'src/gone.ts'], project.worktree);
    await git(['commit', '-qm', 'remove src/gone.ts'], project.worktree);

    const adapter = new ScriptedAdapter(() => 'good\n');
    await project.watchOnce(adapter);

    // THEN the executor never spawns.
    assert.equal(adapter.calls.length, 0);

    const dead = await fs.readFile(path.join(project.changeFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.match(dead, /reason: entry_missing/);
    assert.match(dead, /- src\/gone\.ts/);
    assert.match(dead, /osq plan 001/);

    // THEN no `started` or `verify_ran` event is written for task 1.
    const events = await readIfPresent(
      path.join(project.changeFolder, '.run', 'events', '1.jsonl'),
    );
    assert.doesNotMatch(events, /"type":"started"/);
    assert.doesNotMatch(events, /"type":"verify_ran"/);
    assert.match(events, /"type":"dead"/);

    // THEN later cycles spawn nothing for the change: it needs steering.
    await project.watchOnce(adapter);
    assert.equal(adapter.calls.length, 0);
  });
});

describe('Steered task runs', () => {
  it('spawns once the entry is revised and the change is approved again', async () => {
    const project = await createRecoveryProject(tmpDirs, {
      tasks: [{ title: 'First task', scope: 'src/one.txt' }],
      files: { 'src/gone.ts': 'x\n' },
      autoRetries: 1,
    });
    await writeTaskFile(path.join(project.repo, CHANGE_REL), ['src/gone.ts']);
    assertOk(await project.approve(), 'approve');
    // Lint accepted the entry because it is on main; the worktree loses it, so
    // the watcher's runtime check kills the task.
    await git(['rm', 'src/gone.ts'], project.worktree);
    await git(['commit', '-qm', 'remove src/gone.ts'], project.worktree);

    const adapter = new ScriptedAdapter(() => 'good\n');
    await project.watchOnce(adapter);
    assert.equal(adapter.calls.length, 0);

    // A planner removes the path from the task's `entry` in the worktree.
    await writeTaskFile(project.changeFolder, []);
    const approval = await project.approve();
    assertOk(approval, 'approve');
    assert.match(approval.stdout, /Continues from task 1/);

    await project.watchOnce(adapter);
    // THEN the task spawns and the dead marker is kept as `.run/dead/1.1.md`.
    assert.equal(adapter.calls.length, 1);
    assert.equal(await exists(path.join(project.archivedFolder, '.run', 'dead', '1.1.md')), true);
  });
});

describe('Entries that count as present', () => {
  const rows: readonly {
    readonly entry: string;
    readonly files: Record<string, string>;
    readonly scope?: readonly string[];
    readonly outcome: 'spawns' | 'entry_missing';
    /** After approval, remove this committed file from the worktree. */
    readonly worktreeRemove?: string;
  }[] = [
    { entry: 'src/a.ts', files: { 'src/a.ts': 'x\n' }, outcome: 'spawns' },
    { entry: 'src/lib/', files: { 'src/lib/b.ts': 'x\n' }, outcome: 'spawns' },
    { entry: 'src/*.ts', files: { 'src/a.ts': 'x\n' }, outcome: 'spawns' },
    {
      entry: 'src/new.ts',
      files: {},
      scope: ['src/one.txt', 'src/new.ts'],
      outcome: 'spawns',
    },
    {
      entry: 'src/*.rs',
      files: { 'src/x.rs': 'x\n' },
      worktreeRemove: 'src/x.rs',
      outcome: 'entry_missing',
    },
  ];

  for (const row of rows) {
    it(`${row.entry} in the tree the task runs in: ${row.outcome}`, async () => {
      const project = await createRecoveryProject(tmpDirs, {
        tasks: [{ title: 'First task', scope: 'src/one.txt' }],
        files: row.files,
        autoRetries: 0,
      });
      await writeTaskFile(
        path.join(project.repo, CHANGE_REL),
        [row.entry],
        row.scope ?? ['src/one.txt'],
      );
      assertOk(await project.approve(), 'approve');
      // The committed `src/x.rs` made lint accept the `src/*.rs` pattern;
      // removing it in the worktree makes the runtime check kill the task.
      if (row.worktreeRemove !== undefined) {
        await git(['rm', row.worktreeRemove], project.worktree);
        await git(['commit', '-qm', `remove ${row.worktreeRemove}`], project.worktree);
      }

      const adapter = new ScriptedAdapter(() => 'good\n');
      await project.watchOnce(adapter);

      if (row.outcome === 'spawns') {
        assert.equal(adapter.calls.length, 1);
      } else {
        assert.equal(adapter.calls.length, 0);
        const dead = await fs.readFile(
          path.join(project.changeFolder, '.run', 'dead', '1.md'),
          'utf8',
        );
        assert.match(dead, /reason: entry_missing/);
        assert.match(dead, /- src\/\*\.rs/);
      }
    });
  }
});

describe('Missing entry file', () => {
  it('is a blocked trigger on a change folder read from disk', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-entry-snap-'));
    tmpDirs.push(root);
    const folder = path.join(root, 'openspec', 'changes', '001-demo');
    await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
    await fs.mkdir(path.join(folder, '.run', 'dead'), { recursive: true });
    await fs.writeFile(
      path.join(folder, 'proposal.md'),
      [
        '---',
        'title: Demo',
        'depends_on: []',
        'verify: node verify.cjs',
        '---',
        '## Goal',
        'Demo.',
        '',
      ].join('\n'),
      'utf8',
    );
    await fs.writeFile(
      path.join(folder, 'tasks', '2.md'),
      taskMarkdown(['src/two.txt'], ['src/two.txt']),
      'utf8',
    );
    await fs.writeFile(path.join(folder, '.run', 'approved'), 'sha256:abc\n', 'utf8');
    await fs.writeFile(
      path.join(folder, '.run', 'dead', '2.md'),
      [
        '---',
        'reason: entry_missing',
        '---',
        "The task's entry names files that do not exist:",
        '- src/gone.ts',
        'Revise the plan with osq plan 001, then approve it again.',
        '',
      ].join('\n'),
      'utf8',
    );

    const snapshot = await readChangeFolder(root, folder);
    const steering = deriveSteering(snapshot);
    assert.deepEqual(steering, [{ target: '2', trigger: 'blocked', reason: 'entry_missing' }]);
    const trigger = steering[0];
    assert.ok(trigger);
    assert.equal(describeTrigger(trigger), 'task 2 blocked (entry_missing)');
  });
});
