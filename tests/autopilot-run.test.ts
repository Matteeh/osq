import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { CommandError } from '../src/cli/command-error.js';
import { approveQueue } from '../src/cli/queue.js';
import {
  autopilotStopPath,
  clearAutopilotStop,
  readAutopilotStop,
  writeAutopilotStop,
} from '../src/core/status/autopilot-stop.js';
import { readQueueApproval } from '../src/core/status/queue-approval.js';
import type { AutopilotCommands } from '../src/watcher/autopilot.js';
import { runAutopilotPass } from '../src/watcher/autopilot.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import {
  AutopilotPlanner,
  type AutopilotProject,
  ITEMS,
  LintRedPlanner,
  autopilotCommands,
  createAutopilotProject,
  recordingCommands,
} from './autopilot-run-support.js';
import { ScriptedAdapter, exists, git, subjects } from './recovery-support.js';

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

const CHANGE_REL = (folder: string): string => path.posix.join('openspec', 'changes', folder);
const ARCHIVE_REL = (folder: string): string =>
  path.posix.join('openspec', 'changes', 'archive', folder);

/** Approve the whole queue the way a human runs `osq queue approve`. */
async function approveTheQueue(project: AutopilotProject): Promise<void> {
  await approveQueue({
    cwd: project.repo,
    config: project.config,
    stdout: () => {},
    stderr: () => {},
  });
}

/** Run the watcher once with autopilot on and the test's planner adapter. */
async function runAutopilot(
  project: AutopilotProject,
  planner: AutopilotPlanner | LintRedPlanner,
  taskAdapter = new ScriptedAdapter(),
  commands?: AutopilotCommands,
): Promise<void> {
  const port = commands ?? autopilotCommands(project, planner);
  await runWatcherOnce(project.repo, project.config, taskAdapter, undefined, undefined, {}, port);
}

/** The hash of the commit on `ref` whose subject starts with `prefix`. */
async function commitFor(repo: string, prefix: string): Promise<string> {
  const output = await git(['log', '--format=%H %s', 'main'], repo);
  const line = output.split('\n').find((entry) => entry.includes(prefix));
  assert.ok(line, `no commit with subject starting ${prefix}`);
  return line.split(' ')[0] ?? '';
}

/** One file's text at a commit. */
async function showAt(repo: string, commit: string, relative: string): Promise<string> {
  return git(['show', `${commit}:${relative}`], repo);
}

describe('autopilot', () => {
  it('Approved queue lands in order', async () => {
    const project = await createAutopilotProject(tmpDirs);
    await approveTheQueue(project);
    const approval = await readQueueApproval(project.repo, project.config);
    assert.ok(approval, 'queue approved');

    await runAutopilot(project, new AutopilotPlanner());

    // THEN the default branch gains one `osq: <id> ` commit per item in queue order.
    const landed = (await subjects(project.repo)).filter((subject) =>
      subject.startsWith('osq: 00'),
    );
    assert.equal(landed.length, ITEMS.length, landed.join('\n'));
    for (const item of ITEMS) {
      assert.ok(
        landed.some((subject) => subject.startsWith(`osq: ${item.change.replace(/-/g, ' ')}`)),
        `missing land commit for ${item.change} in: ${landed.join(' | ')}`,
      );
    }

    // THEN each archived change holds `.run/autopilot.md` with the queue
    // approval's hash and an `approved_at`.
    for (const item of ITEMS) {
      const commit = await commitFor(project.repo, `osq: ${item.change.replace(/-/g, ' ')}`);
      const marker = await showAt(
        project.repo,
        commit,
        `${ARCHIVE_REL(item.change)}/.run/autopilot.md`,
      );
      assert.match(
        marker,
        new RegExp(`queue_approval: ${approval.hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
      );
      assert.match(marker, /approved_at:/);
    }

    // THEN no stop record exists.
    assert.equal(await exists(autopilotStopPath(project.repo, project.config)), false);
  });

  it('cli-foundation: Autopilot runs the command functions', async () => {
    const project = await createAutopilotProject(tmpDirs);
    await approveTheQueue(project);

    await runAutopilot(project, new AutopilotPlanner());

    // THEN each item's change carried `queue_item` and `queue_hash` on its brief,
    // held a `.run/plan-run.md` with outcome `ready`, and landed as one commit.
    for (const item of ITEMS) {
      const commit = await commitFor(project.repo, `osq: ${item.change.replace(/-/g, ' ')}`);
      const brief = await showAt(project.repo, commit, `${ARCHIVE_REL(item.change)}/brief.md`);
      assert.match(brief, new RegExp(`queue_item: ${item.slug}`));
      assert.match(brief, /queue_hash: sha256:/);
      const run = await showAt(
        project.repo,
        commit,
        `${ARCHIVE_REL(item.change)}/.run/plan-run.md`,
      );
      assert.match(run, /outcome: ready/);
    }
  });

  it('Autopilot off', async () => {
    const project = await createAutopilotProject(tmpDirs, { enabled: false });
    await approveTheQueue(project);

    await runAutopilot(project, new AutopilotPlanner());

    // THEN no change folder is created and no file appears under openspec/.run/
    // besides the queue approval.
    assert.equal(await exists(path.join(project.repo, CHANGE_REL(ITEMS[0]?.change ?? ''))), false);
    const runDir = path.join(project.repo, 'openspec', '.run');
    const entries = await fs.readdir(runDir);
    assert.deepEqual(entries, ['queue-approval.md']);
  });

  it('Restart mid-queue', async () => {
    const project = await createAutopilotProject(tmpDirs);
    await approveTheQueue(project);

    // The first watcher stops after the first item lands: the next `plan-next`
    // throws, as a stopped watcher would leave the queue.
    const planner = new AutopilotPlanner();
    const real = autopilotCommands(project, planner);
    let landed = 0;
    const first: AutopilotCommands = {
      planNext: async () => {
        if (landed >= 1) throw new CommandError('simulated restart');
        await real.planNext();
      },
      plan: real.plan,
      approve: real.approve,
      land: async (id) => {
        await real.land(id);
        landed += 1;
      },
    };
    await runAutopilot(project, planner, new ScriptedAdapter(), first);
    assert.equal(landed, 1);

    // A new watcher with new autopilot commands runs.
    await clearAutopilotStop(project.repo, project.config);
    await runAutopilot(project, new AutopilotPlanner(), new ScriptedAdapter());

    // THEN the second and third items land and the first is not planned again.
    const landedCommits = (await subjects(project.repo)).filter((subject) =>
      subject.startsWith('osq: 00'),
    );
    assert.equal(landedCommits.filter((s) => s.startsWith('osq: 001 ')).length, 1);
    assert.ok(landedCommits.some((s) => s.startsWith('osq: 002 ')));
    assert.ok(landedCommits.some((s) => s.startsWith('osq: 003 ')));
  });

  it('Edited item stops the queue', async () => {
    const project = await createAutopilotProject(tmpDirs);
    await approveTheQueue(project);

    // The second item is edited after the approval, before the watcher runs.
    const queuePath = path.join(project.repo, 'openspec', 'queue.md');
    const content = await fs.readFile(queuePath, 'utf8');
    await fs.writeFile(
      queuePath,
      content.replace('Brief body for beta.', 'Edited beta body.'),
      'utf8',
    );

    await runAutopilot(project, new AutopilotPlanner());

    // THEN the first item lands and the stop names the second with
    // `changed_since_approval` and `osq queue approve`.
    assert.equal((await subjects(project.repo)).filter((s) => s.startsWith('osq: 001 ')).length, 1);
    const stop = await readAutopilotStop(project.repo, project.config);
    assert.equal(stop?.reason, 'changed_since_approval');
    assert.equal(stop?.item, 'beta');
    assert.equal(stop?.command, 'osq queue approve');

    // After `osq queue approve` the watcher lands the second and third.
    await approveTheQueue(project);
    await runAutopilot(project, new AutopilotPlanner());
    const landed = (await subjects(project.repo)).filter((s) => s.startsWith('osq: 002 '));
    assert.equal(landed.length, 1);
    assert.equal((await subjects(project.repo)).filter((s) => s.startsWith('osq: 003 ')).length, 1);
  });

  it('Planner not ready stops the queue', async () => {
    const project = await createAutopilotProject(tmpDirs);
    await approveTheQueue(project);
    const planner = new LintRedPlanner();

    await runAutopilot(project, planner);

    // THEN the stop holds the reason, the change's id and `osq plan <id>`.
    const stop = await readAutopilotStop(project.repo, project.config);
    assert.equal(stop?.reason, 'planner_not_ready');
    assert.equal(stop?.change, '001');
    assert.equal(stop?.command, 'osq plan 001');

    // The next watcher run starts no planner.
    const calls = planner.calls.length;
    await runAutopilot(project, planner);
    assert.equal(planner.calls.length, calls);
  });

  it('A stopped land is not retried', async () => {
    const project = await createAutopilotProject(tmpDirs);
    await approveTheQueue(project);
    const planner = new AutopilotPlanner();

    // Run to the archived change, then land with a fake port that throws.
    const real = autopilotCommands(project, planner);
    const failing: AutopilotCommands = {
      ...real,
      land: async () => {
        throw new Error('land refused');
      },
    };
    await runAutopilot(project, planner, new ScriptedAdapter(), failing);

    const stop = await readAutopilotStop(project.repo, project.config);
    assert.equal(stop?.reason, 'land_stopped');
    assert.equal(stop?.detail, 'land refused');
    assert.equal(stop?.command, 'osq land 001');

    // THEN the next pass calls no command.
    const recording = recordingCommands();
    const took = await runAutopilotPass(project.repo, project.config, recording);
    assert.equal(took, false);
    assert.deepEqual(recording.calls, []);
  });

  it('A failed land with an exit code', async () => {
    const project = await createAutopilotProject(tmpDirs);
    await approveTheQueue(project);
    const planner = new AutopilotPlanner();

    const real = autopilotCommands(project, planner);
    const failing: AutopilotCommands = {
      ...real,
      land: async () => {
        throw new CommandError('', { exitCode: 1 });
      },
    };
    await runAutopilot(project, planner, new ScriptedAdapter(), failing);

    const stop = await readAutopilotStop(project.repo, project.config);
    assert.equal(stop?.reason, 'land_stopped');
    assert.equal(stop?.detail, 'exit code 1');
  });

  it("A human's step clears the stop", async () => {
    const project = await createAutopilotProject(tmpDirs);
    await approveTheQueue(project);
    const planner = new AutopilotPlanner();

    // Approve the first item's change and leave a task running, so its next
    // step is `running` and no cycle advances it.
    const real = autopilotCommands(project, planner);
    await real.planNext();
    await real.plan('001');
    await real.approve('001');
    const folder = project.worktreeFolder('001-alpha');
    await fs.mkdir(path.join(folder, '.run', 'running'), { recursive: true });
    await fs.writeFile(
      path.join(folder, '.run', 'running', '1.pid'),
      JSON.stringify({ pid: process.pid, startedAt: Date.now() }),
      'utf8',
    );

    // A human's step is recorded as a `halted` stop by hand.
    await writeAutopilotStop(project.repo, project.config, {
      reason: 'halted',
      item: 'alpha',
      change: '001',
      command: 'osq retry 001 1',
      at: new Date().toISOString(),
    });

    // THEN the next watcher run removes the stop record and takes no step.
    const recording = recordingCommands();
    await runWatcherOnce(
      project.repo,
      project.config,
      new ScriptedAdapter(),
      undefined,
      undefined,
      {},
      recording,
    );
    assert.deepEqual(recording.calls, []);
    assert.equal(await exists(autopilotStopPath(project.repo, project.config)), false);
  });
});
