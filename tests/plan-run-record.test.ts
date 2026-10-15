import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  type AutoSteerState,
  steeringKey,
  writeAutoSteerRecord,
} from '../src/core/run/auto-steer-record.js';
import {
  currentPlanRun,
  planRunRecordPath,
  readLivePlanner,
  writePlanRunRecord,
} from '../src/core/run/plan-run-record.js';
import { hashChangeFolder } from '../src/core/spec/hasher.js';
import type { SteeringTrigger } from '../src/core/status/steering.js';

const AT = '2026-10-14T09:30:00.000Z';
const INTERRUPTED = 'interrupted: the planner process stopped';

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function tempFolder(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-plan-run-'));
  tmpDirs.push(dir);
  return dir;
}

/** A pid whose process has exited. */
async function exitedPid(): Promise<number> {
  const child = spawn(process.execPath, ['-e', '']);
  const pid = child.pid as number;
  await once(child, 'exit');
  return pid;
}

function blockedTrigger(): SteeringTrigger {
  return { target: '2', trigger: 'blocked', reason: 'blocked' };
}

describe('Planner run record', () => {
  it('Live planner: a running record with a live pid reads as running', async () => {
    const folder = await tempFolder();
    await writePlanRunRecord(folder, {
      outcome: 'running',
      changed: [],
      at: AT,
      pid: process.pid,
    });
    const state: AutoSteerState = { folderPath: folder, approvedHash: null };

    const view = await currentPlanRun(state);
    assert.equal(view?.outcome, 'running');
    assert.equal(view?.at, AT);
    assert.deepEqual(view?.changed, []);
    assert.equal(view?.detail, null);
    assert.deepEqual(await readLivePlanner(state), { since: AT });
  });

  it('Planner process gone: a running record with a dead pid reads as failed and the file stays', async () => {
    const folder = await tempFolder();
    const pid = await exitedPid();
    await writePlanRunRecord(folder, { outcome: 'running', changed: [], at: AT, pid });
    const before = await fs.readFile(planRunRecordPath(folder));
    const state: AutoSteerState = { folderPath: folder, approvedHash: null };

    const view = await currentPlanRun(state);
    assert.equal(view?.outcome, 'failed');
    assert.equal(view?.detail, INTERRUPTED);
    assert.equal(await readLivePlanner(state), null);
    assert.deepEqual(await fs.readFile(planRunRecordPath(folder)), before);
  });

  it('Plan edited after the run: a finished record counts only while its hash matches', async () => {
    const folder = await tempFolder();
    await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(folder, 'tasks', '1.md'), 'one\n', 'utf8');
    const hash = await hashChangeFolder(folder);
    const body = '- tasks/1.md: verify is the planning sentinel';
    await writePlanRunRecord(folder, {
      outcome: 'lint_red',
      changed: ['tasks/1.md'],
      at: AT,
      hash,
      detail: body,
    });
    const state: AutoSteerState = { folderPath: folder, approvedHash: null };

    const before = await currentPlanRun(state);
    assert.equal(before?.outcome, 'lint_red');
    assert.equal(before?.detail, body);

    await fs.writeFile(path.join(folder, 'tasks', '1.md'), 'two\n', 'utf8');
    assert.equal(await currentPlanRun(state), null);
  });

  it('Steering run is the planner run: an approved state reads the auto-steer record', async () => {
    const folder = await tempFolder();
    await fs.mkdir(path.join(folder, '.run', 'dead'), { recursive: true });
    await fs.writeFile(
      path.join(folder, '.run', 'dead', '2.md'),
      '---\nreason: blocked\n---\nNeeds src/three.txt\n',
      'utf8',
    );
    const trigger = blockedTrigger();
    const approvedHash = 'sha256:abc';
    const key = await steeringKey(folder, approvedHash, [trigger]);
    await writeAutoSteerRecord(folder, {
      key,
      outcome: 'ready',
      changed: ['tasks/2.md'],
      at: AT,
    });
    const state: AutoSteerState = {
      folderPath: folder,
      approvedHash,
      steering: [trigger],
    };

    const view = await currentPlanRun(state);
    assert.equal(view?.outcome, 'ready');
    assert.deepEqual(view?.changed, ['tasks/2.md']);
    assert.equal(view?.at, AT);
  });
});
