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
import { MockAdapter } from '../src/harness/mock.js';
import { StaleBuildError, findStaleBuild, staleBuildMessage } from '../src/watcher/build.js';
import { runWatcherCycle, startWatcher } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

const STALE_SRC_TIME = new Date('2024-01-02T00:00:00Z');
const STALE_DIST_TIME = new Date('2024-01-01T00:00:00Z');

class CaptureLogger implements Logger {
  readonly errors: string[] = [];
  readonly interactive = false;
  readonly symbols = false;

  info(_msg: string): void {}
  verbose(_msg: string): void {}
  warn(_msg: string): void {}
  error(msg: string): void {
    this.errors.push(msg);
  }
  status(_text: string): void {}
  clearStatus(): void {}
}

/** A package root whose `src/` is newer than its `dist/`. */
async function makeStalePackageRoot(root: string): Promise<string> {
  const srcFile = path.join(root, 'src', 'index.ts');
  const distFile = path.join(root, 'dist', 'index.js');
  await fs.mkdir(path.dirname(srcFile), { recursive: true });
  await fs.mkdir(path.dirname(distFile), { recursive: true });
  await fs.writeFile(srcFile, 'source', 'utf8');
  await fs.writeFile(distFile, 'compiled', 'utf8');
  await fs.utimes(srcFile, STALE_SRC_TIME, STALE_SRC_TIME);
  await fs.utimes(distFile, STALE_DIST_TIME, STALE_DIST_TIME);
  return root;
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

async function setupApprovedSpec(projectRoot: string): Promise<void> {
  const spec = await createNewSpec(projectRoot, 'Stale Build Root');
  await useLocalVerifier(projectRoot, spec.folderPath);
  await writeTask1(spec.folderPath);
  await approveSpec(projectRoot, '001', DEFAULT_CONFIG);
}

describe('stale build line names the package root', () => {
  let tmpDir: string;
  let originalError: typeof console.error;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-stale-build-root-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    originalError = console.error;
  });

  afterEach(async () => {
    console.error = originalError;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('resolves a relative package root to an absolute path in the line', async () => {
    const packageRoot = await makeStalePackageRoot(path.join(tmpDir, 'osq-package'));
    const relative = path.relative(process.cwd(), packageRoot);

    const line = await findStaleBuild({ packageRoot: relative });

    assert.equal(line, staleBuildMessage(path.resolve(packageRoot)));
    assert.ok(line?.includes(path.resolve(packageRoot)), 'the absolute root appears in the line');
  });

  it('startWatcher prints exactly the line and exits 1 in once mode', async () => {
    const packageRoot = await makeStalePackageRoot(path.join(tmpDir, 'osq-package'));
    const exits: number[] = [];
    const errorLines: string[] = [];
    console.error = (...args: unknown[]) => {
      errorLines.push(args.map(String).join(' '));
    };

    await startWatcher(tmpDir, DEFAULT_CONFIG, new MockAdapter(), {
      once: true,
      packageRoot,
      exit: (code) => exits.push(code),
      logger: new CaptureLogger(),
    });

    assert.deepEqual(errorLines, [staleBuildMessage(packageRoot)]);
    assert.deepEqual(exits, [1]);
  });

  it('runWatcherCycle rejects with a StaleBuildError carrying the found line', async () => {
    await setupApprovedSpec(tmpDir);
    const otherLine = staleBuildMessage(path.join(tmpDir, 'other-package'));
    const adapter = new MockAdapter();
    const logger = new CaptureLogger();

    await assert.rejects(
      () => runWatcherCycle(tmpDir, DEFAULT_CONFIG, adapter, logger, async () => otherLine),
      (err: unknown) => err instanceof StaleBuildError && err.message === otherLine,
    );
    assert.equal(logger.errors.length, 0, 'no watcher error is logged');
  });
});
