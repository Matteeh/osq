import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { defineConfig } from '../src/core/foundation/config.js';
import {
  type AutoSteerRecord,
  autoSteerRecordPath,
  readAutoSteerRecord,
  steeringKey,
  writeAutoSteerRecord,
} from '../src/core/run/auto-steer-record.js';
import type { LocatedChange } from '../src/core/status/change-locations.js';
import type { SpecState } from '../src/core/status/state.js';
import type { SteeringTrigger } from '../src/core/status/steering.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { type AutoSteerOptions, runAutoSteer } from '../src/watcher/auto-steer.js';

const AT = '2026-10-14T09:30:00.000Z';
const APPROVED = 'sha256:abc';
const PROMPT = 'STEERING PROMPT';

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function tempFolder(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-auto-steer-live-'));
  tmpDirs.push(dir);
  return dir;
}

function blockedTrigger(): SteeringTrigger {
  return { target: '2', trigger: 'blocked', reason: 'blocked' };
}

function locatedChange(projectRoot: string, folderPath: string): LocatedChange {
  const changesDir = path.join(projectRoot, 'openspec', 'changes');
  return {
    folderName: '001-order-flow',
    folderPath,
    location: 'active',
    tree: {
      root: projectRoot,
      changesDir,
      archiveDir: path.join(changesDir, 'archive'),
      rejectedDir: path.join(changesDir, 'rejected'),
    },
  };
}

function specState(folderPath: string, trigger: SteeringTrigger): SpecState {
  return {
    id: '001',
    folderName: '001-order-flow',
    folderPath,
    title: 'Order Flow',
    status: 'dead',
    approvedHash: APPROVED,
    tasks: [],
    nextTask: null,
    steering: [trigger],
  };
}

async function setupFolder(projectRoot: string): Promise<string> {
  const folder = path.join(projectRoot, 'openspec', 'changes', '001-order-flow');
  await fs.mkdir(path.join(folder, '.run', 'dead'), { recursive: true });
  await fs.writeFile(
    path.join(folder, '.run', 'dead', '2.md'),
    '---\nreason: blocked\n---\nNeeds src/three.txt\n',
    'utf8',
  );
  await fs.writeFile(path.join(folder, 'proposal.md'), '# Proposal\n', 'utf8');
  return folder;
}

class RecordingAdapter implements HarnessAdapter {
  readonly name = 'recording';
  readonly calls: SpawnTaskOptions[] = [];

  constructor(private readonly action: (options: SpawnTaskOptions) => Promise<SpawnResult>) {}

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.calls.push({ ...options });
    return this.action(options);
  }
}

function options(planner: RecordingAdapter): AutoSteerOptions {
  return { steeringPrompt: async () => PROMPT, plannerAdapter: planner };
}

describe('Automatic steering live planner', () => {
  it('Planner running elsewhere: a running record whose pid lives spawns nothing', async () => {
    const projectRoot = await tempFolder();
    const folder = await setupFolder(projectRoot);
    const trigger = blockedTrigger();
    const key = await steeringKey(folder, APPROVED, [trigger]);
    await writeAutoSteerRecord(folder, {
      key,
      outcome: 'running',
      changed: [],
      at: AT,
      pid: process.pid,
    });
    const before = await fs.readFile(autoSteerRecordPath(folder));
    const planner = new RecordingAdapter(async () => ({ exitCode: 0 }));

    const result = await runAutoSteer(
      projectRoot,
      locatedChange(projectRoot, folder),
      specState(folder, trigger),
      defineConfig({ autoSteer: { enabled: true } }),
      options(planner),
    );

    assert.equal(result, null);
    assert.equal(planner.calls.length, 0);
    assert.deepEqual(await fs.readFile(autoSteerRecordPath(folder)), before);
  });

  it('Running record names its process: the planner reads its own pid while it runs', async () => {
    const projectRoot = await tempFolder();
    const folder = await setupFolder(projectRoot);
    const trigger = blockedTrigger();
    const seen: (AutoSteerRecord | null)[] = [];
    const planner = new RecordingAdapter(async (spawnOptions) => {
      seen.push(await readAutoSteerRecord(spawnOptions.specFolderPath));
      return { exitCode: 0 };
    });

    const result = await runAutoSteer(
      projectRoot,
      locatedChange(projectRoot, folder),
      specState(folder, trigger),
      defineConfig({ autoSteer: { enabled: true } }),
      options(planner),
    );

    assert.equal(result, 'unchanged');
    assert.equal(planner.calls.length, 1);
    assert.equal(seen[0]?.outcome, 'running');
    assert.equal(seen[0]?.pid, process.pid);
  });
});
