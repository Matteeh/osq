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
import {
  StaleBuildError,
  findStaleBuild,
  newestDistMtimeMs,
  staleBuildMessage,
} from '../src/watcher/build.js';
import { runWatcherCycle, startWatcher } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

const FRESH_DIST_TIME = new Date('2024-01-03T00:00:00Z');
const STALE_SRC_TIME = new Date('2024-01-01T00:00:00Z');
const EDITED_SRC_TIME = new Date('2024-01-04T00:00:00Z');
const REBUILT_DIST_TIME = new Date('2024-01-05T00:00:00Z');

/** Adapter that ages the package's `src/` past its `dist/` during one spawn. */
class StaleOnSpawnAdapter extends MockAdapter {
  spawnCount = 0;

  constructor(
    private readonly srcFile: string,
    private readonly editedTime: Date,
  ) {
    super();
  }

  override async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.spawnCount++;
    const result = await super.spawn(options);
    await fs.utimes(this.srcFile, this.editedTime, this.editedTime);
    return result;
  }
}

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

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
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

async function writeTask1(specFolder: string): Promise<void> {
  const task = [
    '---',
    'title: When a stale build stops the watcher',
    `verify: ${PASSING_VERIFY}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] completes',
  ].join('\n');
  await fs.writeFile(path.join(specFolder, 'tasks', '1.md'), `${task}\n`, 'utf8');
}

async function setupApprovedSpec(
  projectRoot: string,
): Promise<{ folderName: string; folderPath: string }> {
  const spec = await createNewSpec(projectRoot, 'Stale Every Pass');
  await useLocalVerifier(projectRoot, spec.folderPath);
  await writeTask1(spec.folderPath);
  await approveSpec(projectRoot, '001', DEFAULT_CONFIG);
  return { folderName: spec.folderName, folderPath: spec.folderPath };
}

/** Write a `src/` and `dist/` file under a package root, times fixed. */
async function makePackageRoot(root: string, srcTime: Date, distTime: Date): Promise<string> {
  const srcFile = path.join(root, 'src', 'index.ts');
  const distFile = path.join(root, 'dist', 'index.js');
  await fs.mkdir(path.dirname(srcFile), { recursive: true });
  await fs.mkdir(path.dirname(distFile), { recursive: true });
  await fs.writeFile(srcFile, 'source', 'utf8');
  await fs.writeFile(distFile, 'compiled', 'utf8');
  await fs.utimes(srcFile, srcTime, srcTime);
  await fs.utimes(distFile, distTime, distTime);
  return srcFile;
}

/** Every file below `dir`, relative and sorted, for a no-new-file assertion. */
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

function archivePathFor(projectRoot: string, folderName: string): string {
  return path.join(getArchiveDir(DEFAULT_CONFIG.paths.openspecRoot, projectRoot), folderName);
}

describe('Watcher stale build every pass', () => {
  let tmpDir: string;
  let originalError: typeof console.error;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-stale-every-pass-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    originalError = console.error;
  });

  afterEach(async () => {
    console.error = originalError;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('stops with the stale line when src/ is edited while task 1 runs', async () => {
    const spec = await setupApprovedSpec(tmpDir);
    const packageRoot = path.join(tmpDir, 'osq-package');
    const srcFile = await makePackageRoot(packageRoot, STALE_SRC_TIME, FRESH_DIST_TIME);

    const adapter = new StaleOnSpawnAdapter(srcFile, EDITED_SRC_TIME);
    const logger = new CaptureLogger();
    const exits: number[] = [];
    const errorLines: string[] = [];
    console.error = (...args: unknown[]) => {
      errorLines.push(args.map(String).join(' '));
    };

    await startWatcher(tmpDir, DEFAULT_CONFIG, adapter, {
      once: true,
      packageRoot,
      exit: (code) => exits.push(code),
      logger,
    });

    assert.equal(adapter.spawnCount, 1, 'the running task still spawned');
    assert.ok(
      await exists(path.join(spec.folderPath, '.run', 'done', '1')),
      'the running task finished and wrote its done marker',
    );
    assert.deepEqual(
      errorLines,
      [staleBuildMessage(packageRoot)],
      'exactly the stale line on stderr',
    );
    assert.deepEqual(exits, [1], 'the watcher exits 1');
    assert.equal(logger.errors.length, 0, 'no watcher error is logged');
    assert.equal(
      await exists(archivePathFor(tmpDir, spec.folderName)),
      false,
      'the change is not archived',
    );
  });

  it('archives and does not exit when allowStale is set during a run', async () => {
    const spec = await setupApprovedSpec(tmpDir);
    const packageRoot = path.join(tmpDir, 'osq-package');
    const srcFile = await makePackageRoot(packageRoot, STALE_SRC_TIME, FRESH_DIST_TIME);

    const adapter = new StaleOnSpawnAdapter(srcFile, EDITED_SRC_TIME);
    const exits: number[] = [];
    const errorLines: string[] = [];
    console.error = (...args: unknown[]) => {
      errorLines.push(args.map(String).join(' '));
    };

    await startWatcher(tmpDir, DEFAULT_CONFIG, adapter, {
      once: true,
      allowStale: true,
      packageRoot,
      exit: (code) => exits.push(code),
    });

    assert.equal(adapter.spawnCount, 1);
    assert.deepEqual(errorLines, [], 'no stale line with allowStale');
    assert.deepEqual(exits, [], 'the watcher does not exit with allowStale');
    assert.ok(
      await exists(path.join(archivePathFor(tmpDir, spec.folderName), '.run', 'done', '1')),
      'the change archives with allowStale',
    );
  });

  it('rejects with StaleBuildError before the first spawn and writes nothing', async () => {
    const spec = await setupApprovedSpec(tmpDir);
    const adapter = new StaleOnSpawnAdapter(path.join(tmpDir, 'unused-src.ts'), EDITED_SRC_TIME);
    const logger = new CaptureLogger();
    const before = await listFiles(path.join(spec.folderPath, '.run'));

    await assert.rejects(
      () =>
        runWatcherCycle(tmpDir, DEFAULT_CONFIG, adapter, logger, async () =>
          staleBuildMessage(tmpDir),
        ),
      (err: unknown) => err instanceof StaleBuildError,
    );

    assert.equal(adapter.spawnCount, 0, 'the stale check runs before the spawn');
    assert.deepEqual(
      await listFiles(path.join(spec.folderPath, '.run')),
      before,
      '.run/ gains no file',
    );
    assert.equal(logger.errors.length, 0, 'no watcher error is logged');
  });

  it('keeps comparing src/ against the dist/ mtime read at start after a rebuild', async () => {
    const packageRoot = path.join(tmpDir, 'osq-package');
    const srcFile = await makePackageRoot(packageRoot, STALE_SRC_TIME, FRESH_DIST_TIME);

    const startDistMtimeMs = await newestDistMtimeMs(packageRoot);
    assert.equal(
      await findStaleBuild({ packageRoot, distMtimeMs: startDistMtimeMs }),
      null,
      'a fresh layout passes at start',
    );

    await fs.utimes(srcFile, EDITED_SRC_TIME, EDITED_SRC_TIME);
    assert.equal(
      await findStaleBuild({ packageRoot, distMtimeMs: startDistMtimeMs }),
      staleBuildMessage(packageRoot),
      'an edited src/ is stale against the start dist/',
    );

    const distFile = path.join(packageRoot, 'dist', 'index.js');
    await fs.utimes(distFile, REBUILT_DIST_TIME, REBUILT_DIST_TIME);
    assert.equal(
      await findStaleBuild({ packageRoot, distMtimeMs: startDistMtimeMs }),
      staleBuildMessage(packageRoot),
      'a rebuild on disk does not refresh the cached mtime',
    );
    assert.equal(
      await findStaleBuild({ packageRoot }),
      null,
      'a fresh walk sees the rebuilt dist/',
    );
  });
});
