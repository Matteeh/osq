import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { acquireLock, releaseLock } from '../src/core/run/lock.js';
import { parseSpecMd } from '../src/core/spec/parser.js';
import {
  type ChangeFolderSnapshot,
  deriveSpecState,
  deriveTaskState,
} from '../src/core/status/state.js';

describe('State Derivation', () => {
  let tmpDir: string;
  let specFolder: string;
  let runDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-state-test-'));
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Order Processing');
    specFolder = spec.folderPath;
    runDir = path.join(specFolder, '.run');
    await fs.mkdir(runDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('deriveTaskState correctly determines pending, running, done, and dead states', async () => {
    // 1. Initially pending
    const initial = await deriveTaskState(specFolder, '1.md');
    assert.equal(initial.taskNumber, '1');
    assert.equal(initial.status, 'pending');

    // 2. Running when locked
    await acquireLock(runDir, '1');
    const running = await deriveTaskState(specFolder, '1.md');
    assert.equal(running.status, 'running');
    await releaseLock(runDir, '1');

    // 3. Dead when .run/dead/1.md exists
    const deadDir = path.join(runDir, 'dead');
    await fs.mkdir(deadDir, { recursive: true });
    await fs.writeFile(
      path.join(deadDir, '1.md'),
      '---\nreason: verify_red\n---\nTests failed\n',
      'utf8',
    );
    const dead = await deriveTaskState(specFolder, '1.md');
    assert.equal(dead.status, 'dead');
    assert.equal(dead.deadReason, 'verify_red');
    await fs.unlink(path.join(deadDir, '1.md'));

    // 4. Done when .run/done/1 exists
    const doneDir = path.join(runDir, 'done');
    await fs.mkdir(doneDir, { recursive: true });
    await fs.writeFile(path.join(doneDir, '1'), '', 'utf8');
    const done = await deriveTaskState(specFolder, '1.md');
    assert.equal(done.status, 'done');
  });

  it('deriveSpecState detects unapproved, pending, running, dead, and done states', async () => {
    // 1. Unapproved
    let state = await deriveSpecState(tmpDir, specFolder);
    assert.equal(state.status, 'unapproved');
    assert.equal(state.approvedHash, null);

    // 2. Approved and pending
    await fs.writeFile(path.join(runDir, 'approved'), 'sha256:abc123\n', 'utf8');
    state = await deriveSpecState(tmpDir, specFolder);
    assert.equal(state.status, 'pending');
    assert.equal(state.approvedHash, 'sha256:abc123');
    assert.ok(state.nextTask);
    assert.equal(state.nextTask.taskNumber, '1');

    // 3. Running
    await acquireLock(runDir, '1');
    state = await deriveSpecState(tmpDir, specFolder);
    assert.equal(state.status, 'running');
    await releaseLock(runDir, '1');

    // 4. Dead
    const deadDir = path.join(runDir, 'dead');
    await fs.mkdir(deadDir, { recursive: true });
    await fs.writeFile(path.join(deadDir, '1.md'), '---\nreason: verify_red\n---\n', 'utf8');
    state = await deriveSpecState(tmpDir, specFolder);
    assert.equal(state.status, 'dead');
    await fs.unlink(path.join(deadDir, '1.md'));

    // 5. Done
    const doneDir = path.join(runDir, 'done');
    await fs.mkdir(doneDir, { recursive: true });
    await fs.writeFile(path.join(doneDir, '1'), '', 'utf8');
    state = await deriveSpecState(tmpDir, specFolder);
    assert.equal(state.status, 'done');
    assert.equal(state.nextTask, null);
  });

  it('deriveSpecState from an in-memory snapshot is synchronous and preserves folderPath', () => {
    const snapshot: ChangeFolderSnapshot = {
      folderName: '042-pure',
      folderPath: '/tmp/042-pure',
      spec: parseSpecMd('---\ntitle: Pure\ndepends_on: []\n---\n'),
      approvedHash: null,
      taskFiles: new Map(),
      doneMarkers: new Set(),
      deadMarkers: new Map(),
      runningPids: new Map(),
      resultFiles: new Set(),
      unmetDependencies: new Set(),
    };

    const state = deriveSpecState(snapshot);
    assert.ok(!(state instanceof Promise), 'snapshot derivation must not return a promise');
    assert.equal(state.folderPath, '/tmp/042-pure');
    assert.equal(state.status, 'unapproved');
  });
});
