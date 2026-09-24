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
import { isActiveChangeFolderName } from '../src/core/status/layout.js';
import { MockAdapter } from '../src/harness/mock.js';
import { runWatcherCycle } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

/**
 * Seed the deterministic local verifier and point a freshly created change's
 * proposal at it. `createNewSpec` intentionally seeds the template planning
 * sentinel, which the verify-command trust lint rejects at approval.
 */
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

class CaptureLogger implements Logger {
  readonly infos: string[] = [];
  readonly errors: string[] = [];
  readonly statuses: string[] = [];
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

  status(text: string): void {
    this.statuses.push(text);
  }

  clearStatus(): void {}
}

async function writeTask1(specFolder: string): Promise<void> {
  const task = [
    '---',
    'title: When a spec is processed, the loop logs one line',
    `verify: ${PASSING_VERIFY}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] logs a line',
  ].join('\n');
  await fs.writeFile(path.join(specFolder, 'tasks', '1.md'), `${task}\n`, 'utf8');
}

describe('Active change folder classification', () => {
  it('treats containers, scaffolding, and dotfiles as inactive', () => {
    assert.equal(isActiveChangeFolderName('archive'), false);
    assert.equal(isActiveChangeFolderName('rejected'), false);
    assert.equal(isActiveChangeFolderName('_draft'), false);
    assert.equal(isActiveChangeFolderName('.DS_Store'), false);
    assert.equal(isActiveChangeFolderName('001-example'), true);
  });
});

describe('Watcher skips archive and rejected folders', () => {
  let tmpDir: string;
  let adapter: MockAdapter;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-skip-rejected-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    adapter = new MockAdapter();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('runs the approved change without logging a rejected-folder error', async () => {
    const changesDir = path.join(tmpDir, 'openspec', 'changes');
    await fs.mkdir(path.join(changesDir, 'archive'), { recursive: true });
    const rejectedFolder = path.join(changesDir, 'rejected', '009-nope');
    await fs.mkdir(rejectedFolder, { recursive: true });
    await fs.writeFile(path.join(rejectedFolder, 'proposal.md'), '# Rejected\n', 'utf8');

    const spec = await createNewSpec(tmpDir, 'Skip Rejected');
    await useLocalVerifier(tmpDir, spec.folderPath);
    await writeTask1(spec.folderPath);
    const id = spec.folderName.match(/^(\d+)/)?.[1] ?? spec.folderName;
    await approveSpec(tmpDir, id, DEFAULT_CONFIG);

    const logger = new CaptureLogger();
    const summary = await runWatcherCycle(tmpDir, DEFAULT_CONFIG, adapter, logger);

    assert.equal(summary.tasksRun, 1);
    assert.deepEqual(
      logger.errors.filter((line) => line.includes('watcher error')),
      [],
    );
  });
});
