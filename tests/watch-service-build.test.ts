import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import type { Logger } from '../src/core/foundation/logger.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { getArchiveDir } from '../src/core/status/layout.js';
import { MockAdapter } from '../src/harness/mock.js';
import type { SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { staleBuildMessage } from '../src/watcher/build.js';
import { runWatcherCycle, startWatcher } from '../src/watcher/loop.js';
import {
  BuildChangedError,
  BuildWaitError,
  EXIT_NEW_BUILD,
  createServiceBuildCheck,
} from '../src/watcher/service-build.js';
import { installFakeValidator } from './helpers.js';

const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

const FRESH_SRC_TIME = new Date('2024-01-01T00:00:00Z');
const FRESH_DIST_TIME = new Date('2024-01-03T00:00:00Z');
const EDITED_SRC_TIME = new Date('2024-01-04T00:00:00Z');
const SETTLED_DIST_TIME = new Date('2024-01-02T00:00:00Z');

const SETTLE_SECONDS = 10;

class CaptureLogger implements Logger {
  readonly errors: string[] = [];
  readonly infos: string[] = [];
  readonly interactive = false;
  readonly symbols = false;

  info(msg: string): void {
    this.infos.push(msg);
  }

  verbose(_msg: string): void {}

  warn(_msg: string): void {}

  error(msg: string): void {
    this.errors.push(msg);
  }

  status(_text: string): void {}

  clearStatus(): void {}
}

class CountingAdapter extends MockAdapter {
  spawnedTasks: string[] = [];

  override async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.spawnedTasks.push(options.taskNumber);
    return super.spawn(options);
  }
}

/** Adapter that lands a settled new `dist/` file while a task runs. */
class RebuildOnSpawnAdapter extends CountingAdapter {
  constructor(
    private readonly distFile: string,
    private readonly settledTime: Date,
  ) {
    super();
  }

  override async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    const result = await super.spawn(options);
    await fs.writeFile(this.distFile, 'recompiled', 'utf8');
    await fs.utimes(this.distFile, this.settledTime, this.settledTime);
    return result;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timed out');
    }
    await delay(10);
  }
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

/** Every file below `dir`, relative and sorted. */
async function listFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (current: string): Promise<void> => {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        files.push(path.relative(dir, full));
      }
    }
  };
  await walk(dir);
  return files.sort();
}

/** A package root with `src/` and `dist/` files, times fixed. */
async function makePackageRoot(root: string): Promise<{ srcFile: string; distFile: string }> {
  const srcFile = path.join(root, 'src', 'index.ts');
  const distFile = path.join(root, 'dist', 'index.js');
  await fs.mkdir(path.dirname(srcFile), { recursive: true });
  await fs.mkdir(path.dirname(distFile), { recursive: true });
  await fs.writeFile(srcFile, 'source', 'utf8');
  await fs.writeFile(distFile, 'compiled', 'utf8');
  await fs.utimes(srcFile, FRESH_SRC_TIME, FRESH_SRC_TIME);
  await fs.utimes(distFile, FRESH_DIST_TIME, FRESH_DIST_TIME);
  return { srcFile, distFile };
}

async function useLocalVerifier(projectRoot: string, specFolder: string): Promise<void> {
  await fs.writeFile(path.join(projectRoot, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  const proposalPath = path.join(specFolder, 'proposal.md');
  const proposal = await fs.readFile(proposalPath, 'utf8');
  await fs.writeFile(
    proposalPath,
    proposal.replace(/^verify:\s*.*$/m, `verify: ${PASSING_VERIFY}`),
    'utf8',
  );
}

async function writeTask(specFolder: string, number: number): Promise<void> {
  const task = [
    '---',
    `title: Service build check task ${number}`,
    `verify: ${PASSING_VERIFY}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    `- [ ] task ${number} completes`,
  ].join('\n');
  await fs.writeFile(path.join(specFolder, 'tasks', `${number}.md`), `${task}\n`, 'utf8');
}

async function setupApprovedSpec(
  projectRoot: string,
  taskCount = 1,
): Promise<{ folderName: string; folderPath: string }> {
  const spec = await createNewSpec(projectRoot, 'Service Build Check');
  await useLocalVerifier(projectRoot, spec.folderPath);
  await writeTask(spec.folderPath, 1);
  if (taskCount > 1) {
    await writeTask(spec.folderPath, 2);
  }
  await approveSpec(projectRoot, '001', DEFAULT_CONFIG);
  return { folderName: spec.folderName, folderPath: spec.folderPath };
}

function archivePathFor(projectRoot: string, folderName: string): string {
  return path.join(getArchiveDir(DEFAULT_CONFIG.paths.openspecRoot, projectRoot), folderName);
}

describe('Service worker build checks', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-watch-service-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('check table rows, with now injected', () => {
    it('throws BuildChangedError when the key changed and the newest dist file is settled', async () => {
      const packageRoot = path.join(tmpDir, 'osq-package');
      const { distFile } = await makePackageRoot(packageRoot);
      const now = () => Date.parse('2024-01-08T00:00:00Z');
      const check = await createServiceBuildCheck({
        packageRoot,
        settleSeconds: SETTLE_SECONDS,
        now,
      });

      assert.equal(await check(), null, 'a fresh layout passes');

      await fs.writeFile(distFile, 'recompiled', 'utf8');
      await fs.utimes(distFile, SETTLED_DIST_TIME, SETTLED_DIST_TIME);
      await assert.rejects(() => check(), BuildChangedError);
    });

    it('waits while a changed key\u2019s newest dist file is younger than the settle window', async () => {
      const packageRoot = path.join(tmpDir, 'osq-package');
      const { distFile } = await makePackageRoot(packageRoot);
      const young = Date.parse('2024-01-08T00:00:00Z');
      const now = () => young + SETTLE_SECONDS * 500;
      const waits: (string | null)[] = [];
      const check = await createServiceBuildCheck({
        packageRoot,
        settleSeconds: SETTLE_SECONDS,
        now,
        onWaiting: (reason) => {
          waits.push(reason);
        },
      });

      await fs.writeFile(distFile, 'partial', 'utf8');
      await fs.utimes(distFile, new Date(young), new Date(young));
      await assert.rejects(
        () => check(),
        (err: unknown) => {
          return (
            err instanceof BuildWaitError && err.message === 'a new osq build is being written'
          );
        },
      );
      assert.deepEqual(waits, ['a new osq build is being written']);
    });

    it('waits on the stale line when an unchanged key has src/ newer than dist/', async () => {
      const packageRoot = path.join(tmpDir, 'osq-package');
      const { srcFile } = await makePackageRoot(packageRoot);
      const now = () => Date.parse('2024-01-08T00:00:00Z');
      const waits: (string | null)[] = [];
      const check = await createServiceBuildCheck({
        packageRoot,
        settleSeconds: SETTLE_SECONDS,
        now,
        onWaiting: (reason) => {
          waits.push(reason);
        },
      });

      await fs.utimes(srcFile, EDITED_SRC_TIME, EDITED_SRC_TIME);
      await assert.rejects(
        () => check(),
        (err: unknown) => {
          return err instanceof BuildWaitError && err.message === staleBuildMessage(packageRoot);
        },
      );
      assert.deepEqual(waits, [staleBuildMessage(packageRoot)]);
    });

    it('passes when the key is unchanged and src/ is no newer than dist/', async () => {
      const packageRoot = path.join(tmpDir, 'osq-package');
      await makePackageRoot(packageRoot);
      const now = () => Date.parse('2024-01-08T00:00:00Z');
      const check = await createServiceBuildCheck({
        packageRoot,
        settleSeconds: SETTLE_SECONDS,
        now,
      });

      assert.equal(await check(), null);
      assert.equal(await check(), null, 'passing again changes nothing');
    });
  });

  it('calls onWaiting on every wait, null on the first pass after, and logs each reason once', async () => {
    const packageRoot = path.join(tmpDir, 'osq-package');
    const { srcFile } = await makePackageRoot(packageRoot);
    const waits: (string | null)[] = [];
    const logger = new CaptureLogger();
    const check = await createServiceBuildCheck({
      packageRoot,
      settleSeconds: SETTLE_SECONDS,
      logger,
      onWaiting: (reason) => {
        waits.push(reason);
      },
    });

    await fs.utimes(srcFile, EDITED_SRC_TIME, EDITED_SRC_TIME);
    for (let cycle = 0; cycle < 3; cycle++) {
      await assert.rejects(() => check(), BuildWaitError);
    }
    assert.equal(waits.length, 3, 'onWaiting fires on every wait');
    assert.equal(
      waits.every((reason) => reason === staleBuildMessage(packageRoot)),
      true,
    );
    assert.deepEqual(
      logger.infos,
      [staleBuildMessage(packageRoot)],
      'logged once over three cycles',
    );

    await fs.utimes(srcFile, FRESH_SRC_TIME, FRESH_SRC_TIME);
    assert.equal(await check(), null);
    assert.equal(waits.length, 4, 'a null is reported once on the first pass after a wait');
    assert.equal(waits[3], null);
    assert.deepEqual(logger.infos, [staleBuildMessage(packageRoot)], 'no new log on the pass');
  });

  it('waits while a new build is being written, spawning nothing and not exiting', async () => {
    const spec = await setupApprovedSpec(tmpDir);
    const packageRoot = path.join(tmpDir, 'osq-package');
    const { distFile } = await makePackageRoot(packageRoot);
    const waits: (string | null)[] = [];
    const check = await createServiceBuildCheck({
      packageRoot,
      settleSeconds: SETTLE_SECONDS,
      onWaiting: (reason) => {
        waits.push(reason);
      },
    });

    await fs.writeFile(distFile, 'partial', 'utf8');
    const adapter = new CountingAdapter();
    const exits: number[] = [];
    await startWatcher(tmpDir, DEFAULT_CONFIG, adapter, {
      once: true,
      buildCheck: check,
      exit: (code) => exits.push(code),
    });

    assert.deepEqual(waits, ['a new osq build is being written']);
    assert.deepEqual(adapter.spawnedTasks, [], 'no task spawns while the build is being written');
    assert.deepEqual(exits, [], 'the watcher does not exit');
    assert.equal(
      await exists(path.join(spec.folderPath, '.run', 'done', '1')),
      false,
      'no task ran',
    );
  });

  it('exits with 75 on an idle cycle once a settled new build lands, changing no file', async () => {
    await createNewSpec(tmpDir, 'Idle Draft');
    const packageRoot = path.join(tmpDir, 'osq-package');
    const { distFile } = await makePackageRoot(packageRoot);
    const before = await listFiles(path.join(tmpDir, 'openspec'));
    const adapter = new CountingAdapter();
    const exits: number[] = [];
    const controller = new AbortController();
    const check = await createServiceBuildCheck({ packageRoot, settleSeconds: SETTLE_SECONDS });

    const watcherPromise = startWatcher(tmpDir, DEFAULT_CONFIG, adapter, {
      buildCheck: check,
      signal: controller.signal,
      pollIntervalMs: 5,
      exit: (code) => exits.push(code),
    });

    await delay(100);
    await fs.writeFile(distFile, 'recompiled', 'utf8');
    await fs.utimes(distFile, SETTLED_DIST_TIME, SETTLED_DIST_TIME);
    await waitFor(() => exits.length > 0);
    controller.abort();
    await watcherPromise;

    assert.deepEqual(exits, [EXIT_NEW_BUILD], 'the idle watcher exits with 75');
    assert.deepEqual(adapter.spawnedTasks, []);
    assert.deepEqual(
      await listFiles(path.join(tmpDir, 'openspec')),
      before,
      'no change folder gains a file',
    );
  });

  it('waits on the stale line over three cycles without spawning and logs it once', async () => {
    await setupApprovedSpec(tmpDir);
    const packageRoot = path.join(tmpDir, 'osq-package');
    const { srcFile } = await makePackageRoot(packageRoot);
    const waits: (string | null)[] = [];
    const logger = new CaptureLogger();
    const check = await createServiceBuildCheck({
      packageRoot,
      settleSeconds: SETTLE_SECONDS,
      logger,
      onWaiting: (reason) => {
        waits.push(reason);
      },
    });

    await fs.utimes(srcFile, EDITED_SRC_TIME, EDITED_SRC_TIME);
    const adapter = new CountingAdapter();
    const exits: number[] = [];
    const controller = new AbortController();
    const watcherPromise = startWatcher(tmpDir, DEFAULT_CONFIG, adapter, {
      buildCheck: check,
      signal: controller.signal,
      pollIntervalMs: 5,
      exit: (code) => exits.push(code),
      logger,
    });

    await waitFor(() => waits.length >= 3);
    controller.abort();
    await watcherPromise;

    assert.deepEqual(adapter.spawnedTasks, [], 'a pending task never spawns while waiting');
    assert.deepEqual(exits, [], 'the watcher does not exit on the stale line');
    assert.deepEqual(
      logger.infos,
      [staleBuildMessage(packageRoot)],
      'logged once over three cycles',
    );
  });

  it('leaves done/1 and never spawns task 2 when a settled build lands during a task', async () => {
    const spec = await setupApprovedSpec(tmpDir, 2);
    const packageRoot = path.join(tmpDir, 'osq-package');
    const { distFile } = await makePackageRoot(packageRoot);
    const check = await createServiceBuildCheck({ packageRoot, settleSeconds: SETTLE_SECONDS });
    const adapter = new RebuildOnSpawnAdapter(distFile, SETTLED_DIST_TIME);
    const exits: number[] = [];

    await startWatcher(tmpDir, DEFAULT_CONFIG, adapter, {
      once: true,
      buildCheck: check,
      exit: (code) => exits.push(code),
    });

    assert.ok(await exists(path.join(spec.folderPath, '.run', 'done', '1')), 'task 1 finished');
    assert.deepEqual(adapter.spawnedTasks, ['1'], 'task 2 is never spawned');
    assert.deepEqual(exits, [EXIT_NEW_BUILD], 'the watcher exits with 75');
    assert.equal(
      await exists(archivePathFor(tmpDir, spec.folderName)),
      false,
      'the change is not archived',
    );
  });

  it('clears the wait and spawns the pending task once src/ is no newer than dist/', async () => {
    const spec = await setupApprovedSpec(tmpDir);
    const packageRoot = path.join(tmpDir, 'osq-package');
    const { srcFile } = await makePackageRoot(packageRoot);
    const waits: (string | null)[] = [];
    const check = await createServiceBuildCheck({
      packageRoot,
      settleSeconds: SETTLE_SECONDS,
      onWaiting: (reason) => {
        waits.push(reason);
      },
    });

    await fs.utimes(srcFile, EDITED_SRC_TIME, EDITED_SRC_TIME);
    const adapter = new CountingAdapter();
    await assert.rejects(
      () => runWatcherCycle(tmpDir, DEFAULT_CONFIG, adapter, undefined, check),
      BuildWaitError,
    );
    assert.deepEqual(adapter.spawnedTasks, [], 'no spawn while the build is stale');
    assert.deepEqual(waits, [staleBuildMessage(packageRoot)]);

    await fs.utimes(srcFile, FRESH_SRC_TIME, FRESH_SRC_TIME);
    await runWatcherCycle(tmpDir, DEFAULT_CONFIG, adapter, undefined, check);

    assert.deepEqual(adapter.spawnedTasks, ['1'], 'the pending task spawns once the wait clears');
    assert.equal(waits[waits.length - 1], null, 'waiting goes back to null');
    assert.ok(
      await exists(path.join(archivePathFor(tmpDir, spec.folderName), '.run', 'done', '1')),
      'the task finishes and the change archives',
    );
  });
});
