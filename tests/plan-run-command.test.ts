import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { CommandError } from '../src/cli/command-error.js';
import { type PlanCommandOptions, planCommand } from '../src/cli/plan.js';
import { defineConfig } from '../src/core/foundation/config.js';
import { readPlanRunRecord, writePlanRunRecord } from '../src/core/run/plan-run-record.js';

const VCS_CONFIG = defineConfig({
  vcs: { enabled: true, author: 'osq <osq@noreply.invalid>' },
});

const SENTINEL = 'node -e "process.exit(0)"';

function proposalMd(verify: string): string {
  return [
    '---',
    'title: Demo',
    'depends_on: []',
    `verify: ${verify}`,
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    'Demo goal.',
    '',
    '## Surface',
    'None.',
    '',
    '## Human steps',
    'None',
    '',
  ].join('\n');
}

function taskMd(title: string): string {
  return [
    '---',
    `title: ${title}`,
    `verify: ${SENTINEL}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] does the thing',
    '',
  ].join('\n');
}

/** Unapproved change 001-demo with a brief and the given proposal verify. */
async function createDraft(root: string, verify = SENTINEL): Promise<string> {
  const folder = path.join(root, 'openspec', 'changes', '001-demo');
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folder, 'proposal.md'), proposalMd(verify), 'utf8');
  await fs.writeFile(path.join(folder, 'brief.md'), 'Brief body.\n', 'utf8');
  await fs.writeFile(path.join(folder, 'tasks', '1.md'), taskMd('Demo task'), 'utf8');
  return folder;
}

async function captureStdout(
  run: (stdout: (text: string) => void) => Promise<void>,
): Promise<string> {
  let captured = '';
  await run((text) => {
    captured += text;
  });
  return captured;
}

describe('plan run command', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-plan-run-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('Start for an unplanned change', async () => {
    const folder = await createDraft(root);
    const calls: Array<{ id: string; notes: string | undefined }> = [];

    const stdout = await captureStdout((write) =>
      planCommand('001', {
        cwd: root,
        config: VCS_CONFIG,
        run: true,
        stdout: write,
        spawnPlanWorker: async (id, notes) => {
          calls.push({ id, notes });
          return 4242;
        },
      }),
    );

    assert.deepEqual(calls, [{ id: '001', notes: undefined }]);
    const record = await readPlanRunRecord(folder);
    assert.equal(record?.outcome, 'running');
    assert.equal(record?.pid, 4242);
    assert.equal(
      stdout,
      'Planner started for 001-demo (pid 4242). osq show 001 shows its progress.\n',
    );
  });

  it('Start refused while one runs', async () => {
    const folder = await createDraft(root);
    await writePlanRunRecord(folder, {
      outcome: 'running',
      changed: [],
      at: '2026-10-14T09:30:00.000Z',
      pid: process.pid,
    });
    let spawned = 0;

    await assert.rejects(
      () =>
        planCommand('001', {
          cwd: root,
          config: VCS_CONFIG,
          run: true,
          stdout: () => {},
          spawnPlanWorker: async () => {
            spawned += 1;
            return 1;
          },
        }),
      (error: unknown) =>
        error instanceof CommandError &&
        error.exitCode === 1 &&
        error.message ===
          'Error: a planner is already running for 001-demo since 2026-10-14 09:30 UTC',
    );
    assert.equal(spawned, 0);
  });

  it('Nothing to plan', async () => {
    const folder = await createDraft(root, 'node verify.cjs');
    await fs.mkdir(path.join(folder, '.run'), { recursive: true });
    await fs.writeFile(path.join(folder, '.run', 'approved'), 'sha256:sealed\n', 'utf8');

    await assert.rejects(
      () =>
        planCommand('001', {
          cwd: root,
          config: VCS_CONFIG,
          run: true,
          stdout: () => {},
          spawnPlanWorker: async () => {
            throw new Error('spawnPlanWorker must not run');
          },
        }),
      (error: unknown) =>
        error instanceof CommandError &&
        error.exitCode === 1 &&
        error.message ===
          'Error: 001-demo has nothing for a planner to do; its next step is running — osq show 001',
    );
  });

  it('Run option combinations', async () => {
    const rows: Array<{ options: PlanCommandOptions; message: string }> = [
      {
        options: { run: true, print: true },
        message: 'Error: `--run` cannot be combined with `--print`',
      },
      {
        options: { run: true, session: true },
        message: 'Error: `--run` cannot be combined with `--session`',
      },
      {
        options: { run: true, brief: 'brief.md' },
        message: 'Error: `--run` cannot be combined with `--brief`',
      },
      {
        options: { notes: 'use the cache' },
        message: 'Error: `--notes` is valid only with `--run`',
      },
    ];

    for (const row of rows) {
      await assert.rejects(
        () => planCommand('001', { cwd: root, config: VCS_CONFIG, ...row.options }),
        (error: unknown) =>
          error instanceof CommandError && error.exitCode === 1 && error.message === row.message,
      );
    }
    assert.equal(
      await fs
        .stat(path.join(root, 'openspec'))
        .then(() => true)
        .catch(() => false),
      false,
      'nothing was written',
    );
  });
});
