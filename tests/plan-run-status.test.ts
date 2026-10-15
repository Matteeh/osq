import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { showCommand } from '../src/cli/show.js';
import { statusCommand } from '../src/cli/status.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { steeringKey, writeAutoSteerRecord } from '../src/core/run/auto-steer-record.js';
import { writePlanRunRecord } from '../src/core/run/plan-run-record.js';
import { hashChangeFolder } from '../src/core/spec/hasher.js';
import { type NextStep, formatNextStep, readNextStep } from '../src/core/status/next-step.js';
import { canStartPlanner } from '../src/core/status/plan-run-eligible.js';
import { deriveSpecState } from '../src/core/status/state.js';
import { getWebChange } from '../src/core/web/web-data.js';

const CHANGES_DIR = path.join('openspec', 'changes');
const SENTINEL = 'node -e "process.exit(0)"';

const VCS_ON: OsqConfig = {
  ...DEFAULT_CONFIG,
  vcs: { enabled: true, author: 'osq <osq@noreply.invalid>' },
};

function proposalMd(title: string, verify: string): string {
  return [
    '---',
    `title: ${title}`,
    'depends_on: []',
    `verify: ${verify}`,
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    `${title} goal.`,
    '',
  ].join('\n');
}

function taskMd(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'verify: node verify.cjs',
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    `- [ ] does ${title}`,
    '',
  ].join('\n');
}

/** Unapproved change 007 with a brief and the given proposal verify. */
async function createDraft(root: string, verify: string): Promise<string> {
  const folderPath = path.join(root, CHANGES_DIR, '007-pricing');
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMd('Pricing', verify), 'utf8');
  await fs.writeFile(path.join(folderPath, 'brief.md'), 'Brief body.\n', 'utf8');
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), taskMd('Pending task'), 'utf8');
  return folderPath;
}

/** Approved change 007 whose task 2 is dead with `reason: blocked`. */
async function createSteeringDraft(root: string): Promise<string> {
  const folderPath = path.join(root, CHANGES_DIR, '007-pricing');
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.mkdir(path.join(folderPath, '.run', 'dead'), { recursive: true });
  await fs.writeFile(
    path.join(folderPath, 'proposal.md'),
    proposalMd('Pricing', 'node verify.cjs'),
    'utf8',
  );
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), taskMd('First task'), 'utf8');
  await fs.writeFile(path.join(folderPath, 'tasks', '2.md'), taskMd('Second task'), 'utf8');
  await fs.writeFile(
    path.join(folderPath, '.run', 'dead', '2.md'),
    '---\nreason: blocked\n---\nNeeds src/b.ts\n',
    'utf8',
  );
  await fs.writeFile(path.join(folderPath, '.run', 'approved'), 'sha256:fixture\n', 'utf8');
  return folderPath;
}

/** The pid of a child that has already exited. */
function deadPid(): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    const pid = child.pid ?? 0;
    child.on('exit', () => resolve(pid));
  });
}

async function capture(run: (stdout: (text: string) => void) => Promise<string>): Promise<string> {
  let captured = '';
  await run((text) => {
    captured = text;
  });
  return captured;
}

describe('plan run status', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-plan-run-status-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('Planning format', async () => {
    const folderPath = await createDraft(root, SENTINEL);
    await writePlanRunRecord(folderPath, {
      outcome: 'running',
      changed: [],
      at: '2026-10-14T09:30:00.000Z',
      pid: process.pid,
    });

    const step = await readNextStep(root, folderPath, DEFAULT_CONFIG);
    assert.deepEqual(step, {
      state: 'planning',
      command: 'osq show 007',
      detail: 'since 2026-10-14 09:30 UTC',
    });
    assert.equal(formatNextStep(step), 'planning (since 2026-10-14 09:30 UTC) — osq show 007');

    const show = await capture((stdout) =>
      showCommand('007', { cwd: root, config: DEFAULT_CONFIG, stdout }),
    );
    assert.ok(show.includes('Next: planning (since 2026-10-14 09:30 UTC) — osq show 007'), show);

    const status = await capture((stdout) =>
      statusCommand({ cwd: root, config: DEFAULT_CONFIG, stdout, home: root }),
    );
    assert.ok(
      status.includes('  next: planning (since 2026-10-14 09:30 UTC) — osq show 007'),
      status,
    );
  });

  it('Steering while planning', async () => {
    const folderPath = await createSteeringDraft(root);
    const state = await deriveSpecState(root, folderPath);
    assert.equal(state.approvedHash !== null && (state.steering?.length ?? 0) > 0, true);
    const key = await steeringKey(folderPath, state.approvedHash ?? '', state.steering ?? []);
    await writeAutoSteerRecord(folderPath, {
      key,
      outcome: 'running',
      changed: [],
      at: '2026-10-14T09:30:00.000Z',
      pid: process.pid,
    });

    const step = await readNextStep(root, folderPath, DEFAULT_CONFIG);
    assert.deepEqual(step, {
      state: 'planning',
      command: 'osq show 007',
      detail: 'since 2026-10-14 09:30 UTC',
    });
  });

  it('Planner that stopped', async () => {
    const folderPath = await createDraft(root, SENTINEL);
    await writePlanRunRecord(folderPath, {
      outcome: 'running',
      changed: [],
      at: '2026-10-14T09:30:00.000Z',
      pid: await deadPid(),
    });

    const step = await readNextStep(root, folderPath, DEFAULT_CONFIG);
    assert.deepEqual(step, { state: 'unplanned', command: 'osq plan 007', detail: null });
  });

  it('Who may start a planner', () => {
    const cases: Array<{
      next: NextStep;
      location: Parameters<typeof canStartPlanner>[1];
      config: OsqConfig;
      result: boolean;
    }> = [
      {
        next: { state: 'unplanned', command: 'osq plan 007', detail: null },
        location: 'active',
        config: VCS_ON,
        result: true,
      },
      {
        next: { state: 'ready-for-approval', command: 'osq approve 007', detail: null },
        location: 'active',
        config: VCS_ON,
        result: true,
      },
      {
        next: { state: 'dead', command: 'osq plan 007', detail: 'needs steering' },
        location: 'active',
        config: VCS_ON,
        result: true,
      },
      {
        next: { state: 'dead', command: 'osq approve 007', detail: 'revised plan ready' },
        location: 'active',
        config: VCS_ON,
        result: false,
      },
      {
        next: { state: 'dead', command: null, detail: null },
        location: 'active',
        config: VCS_ON,
        result: false,
      },
      {
        next: { state: 'planning', command: 'osq show 007', detail: 'since 2026-10-14 09:30 UTC' },
        location: 'active',
        config: VCS_ON,
        result: false,
      },
      {
        next: { state: 'running', command: 'osq show 007', detail: null },
        location: 'active',
        config: VCS_ON,
        result: false,
      },
      {
        next: { state: 'dead', command: 'osq plan 007', detail: 'needs steering' },
        location: 'archived',
        config: VCS_ON,
        result: false,
      },
      {
        next: { state: 'unplanned', command: 'osq plan 007', detail: null },
        location: 'active',
        config: DEFAULT_CONFIG,
        result: false,
      },
    ];
    for (const row of cases) {
      assert.equal(
        canStartPlanner(row.next, row.location, row.config),
        row.result,
        `${row.next.state} ${row.location}`,
      );
    }
  });

  it('Running planner in the document', async () => {
    const folderPath = await createDraft(root, SENTINEL);
    await writePlanRunRecord(folderPath, {
      outcome: 'running',
      changed: [],
      at: '2026-10-14T09:30:00.000Z',
      pid: process.pid,
    });

    const change = await getWebChange(root, '007', DEFAULT_CONFIG);
    assert.deepEqual(change.planRun, {
      outcome: 'running',
      startedAt: '2026-10-14T09:30:00.000Z',
      detail: null,
    });
    assert.equal(change.nextStep?.state, 'planning');
  });

  it('Finished planner in the document', async () => {
    const folderPath = await createDraft(root, SENTINEL);
    const hash = await hashChangeFolder(folderPath);
    await writePlanRunRecord(folderPath, {
      outcome: 'lint_red',
      changed: ['tasks/1.md'],
      at: '2026-10-14T09:29:00.000Z',
      hash,
      detail: '- tasks/1.md: verify is the planning sentinel',
    });

    const change = await getWebChange(root, '007', DEFAULT_CONFIG);
    assert.deepEqual(change.planRun, {
      outcome: 'lint_red',
      startedAt: null,
      detail: '- tasks/1.md: verify is the planning sentinel',
    });
  });

  it('No planner run', async () => {
    await createDraft(root, SENTINEL);
    const change = await getWebChange(root, '007', DEFAULT_CONFIG);
    assert.equal(change.planRun, null);
  });
});
