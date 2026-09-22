import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import type { Logger } from '../src/core/foundation/logger.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { getArchiveDir, getChangesDir } from '../src/core/status/layout.js';
import { MockAdapter } from '../src/harness/mock.js';
import { extractHumanSteps, runWatcherCycle } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

class CaptureLogger implements Logger {
  readonly infos: string[] = [];
  readonly errors: string[] = [];
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

async function pathExists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

const CUTOVER_HUMAN_STEPS = [
  '1. Stop the running watcher process (`Ctrl+C`).',
  '2. Run `osq migrate openspec` from the repository root.',
  '3. Restart the watcher with `osq watch`.',
].join('\n');

function legacySpecMd(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'depends_on: []',
    'features:',
    '  reads: []',
    '  writes: []',
    '---',
    '## Goal',
    'Switch the runtime layout to OpenSpec paths.',
    '## Contract',
    '| Input | Expected Output |',
    '|---|---|',
    '| cut-over | openspec paths |',
    '## Non-goals',
    'None.',
    '## Delta',
    '',
    '',
  ].join('\n');
}

function proposalMd(title: string, humanSteps?: string): string {
  const lines = [
    '---',
    `title: ${title}`,
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    'Switch the runtime layout to OpenSpec paths.',
    '## Contract',
    '| Input | Expected Output |',
    '|---|---|',
    '| cut-over | openspec paths |',
    '## Non-goals',
    'None.',
  ];
  if (humanSteps) {
    lines.push('## Human steps', '', humanSteps, '');
  }
  return lines.join('\n');
}

/**
 * Creates a change folder in `changesRoot` with both a legacy `spec.md` (what
 * the current state/lint layers still read) and an OpenSpec `proposal.md`.
 * The Human steps live only in `proposal.md`, so the test proves the watcher
 * reads them from the OpenSpec document.
 */
async function writeChange(
  changesRoot: string,
  id: string,
  slug: string,
  humanSteps?: string,
): Promise<string> {
  const folderPath = path.join(changesRoot, `${id}-${slug}`);
  const title = `Cut-over ${id}`;
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'spec.md'), legacySpecMd(title), 'utf8');
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMd(title, humanSteps), 'utf8');
  await fs.writeFile(
    path.join(folderPath, 'tasks.md'),
    '# Tasks\n\n- [ ] 1. When cut-over is performed, runtime switches\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(folderPath, 'tasks', '1.md'),
    [
      '---',
      'title: When cut-over is performed, runtime switches',
      'verify: node verify.cjs',
      'scope: []',
      'entry: []',
      'skills: []',
      '---',
      '## Acceptance',
      '- [ ] runtime uses openspec paths',
    ].join('\n'),
    'utf8',
  );
  return folderPath;
}

describe('Layout cut-over', () => {
  let tmpDir: string;
  let adapter: MockAdapter;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-cut-over-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
    adapter = new MockAdapter();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('switches DEFAULT_CONFIG paths to the openspec layout', () => {
    assert.equal(DEFAULT_CONFIG.paths.openspecRoot, 'openspec');
    assert.equal(DEFAULT_CONFIG.paths.features, 'openspec/specs');
    assert.equal(
      getChangesDir(DEFAULT_CONFIG.paths.openspecRoot),
      path.join('openspec', 'changes'),
    );
    assert.equal(
      getArchiveDir(DEFAULT_CONFIG.paths.openspecRoot),
      path.join('openspec', 'changes', 'archive'),
    );
    assert.equal(
      getChangesDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir),
      path.join(tmpDir, 'openspec', 'changes'),
    );
    assert.equal(
      getArchiveDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir),
      path.join(tmpDir, 'openspec', 'changes', 'archive'),
    );
  });

  it('monitors openspec/changes for approved change folders', async () => {
    await writeChange(path.join(tmpDir, 'openspec', 'changes'), '001', 'cut-over');
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const logger = new CaptureLogger();
    const summary = await runWatcherCycle(tmpDir, DEFAULT_CONFIG, adapter, logger);

    assert.equal(summary.tasksRun, 1);
    assert.equal(summary.specsArchived, 1);
    assert.ok(
      await pathExists(path.join(tmpDir, 'openspec', 'changes', 'archive', '001-cut-over')),
    );
    assert.ok(logger.infos.some((line) => line.includes('[archived] 001 archived')));
  });

  it('does not pick up change folders left in the legacy specs/ directory', async () => {
    // A legacy folder with a valid change doc and approval marker would be
    // picked up (and dead-lettered) if the watcher still scanned `specs/`.
    const legacyFolder = await writeChange(path.join(tmpDir, 'specs'), '002', 'legacy');
    const legacyRunDir = path.join(legacyFolder, '.run');
    await fs.mkdir(legacyRunDir, { recursive: true });
    await fs.writeFile(path.join(legacyRunDir, 'approved'), 'legacy-hash\n', 'utf8');

    const logger = new CaptureLogger();
    const summary = await runWatcherCycle(tmpDir, DEFAULT_CONFIG, adapter, logger);

    assert.equal(summary.tasksRun, 0);
    assert.equal(summary.specsArchived, 0);
    assert.ok(await pathExists(path.join(tmpDir, 'specs', '002-legacy')));
  });

  it('prints the Human steps outcome after the change completes', async () => {
    await writeChange(
      path.join(tmpDir, 'openspec', 'changes'),
      '001',
      'cut-over',
      CUTOVER_HUMAN_STEPS,
    );
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const logger = new CaptureLogger();
    const summary = await runWatcherCycle(tmpDir, DEFAULT_CONFIG, adapter, logger);

    assert.equal(summary.specsArchived, 1);
    const outcome = logger.infos.find((line) => line.includes('Human steps after completion:'));
    assert.ok(outcome, 'expected a human steps outcome line');
    assert.ok(outcome.includes('Stop the running watcher'));
    assert.ok(outcome.includes('osq migrate openspec'));
    assert.ok(outcome.includes('osq watch'));
  });

  it('never moves the legacy layout itself while cutting the runtime over', async () => {
    // Seed a legacy change folder. The task execution must leave it in place;
    // only the human runs `osq migrate openspec`.
    await writeChange(path.join(tmpDir, 'specs'), '002', 'legacy');
    await writeChange(path.join(tmpDir, 'openspec', 'changes'), '003', 'active');
    await approveSpec(tmpDir, '003', DEFAULT_CONFIG);

    const logger = new CaptureLogger();
    await runWatcherCycle(tmpDir, DEFAULT_CONFIG, adapter, logger);

    assert.ok(await pathExists(path.join(tmpDir, 'specs', '002-legacy')));
    assert.equal(await pathExists(path.join(tmpDir, 'openspec', 'changes', '002-legacy')), false);
  });

  it('removes obsolete legacy path identifiers from the runtime units', async () => {
    const configSource = await fs.readFile(
      path.join(REPO_ROOT, 'src', 'core', 'foundation', 'config.ts'),
      'utf8',
    );
    const loopSource = await fs.readFile(path.join(REPO_ROOT, 'src', 'watcher', 'loop.ts'), 'utf8');

    // The runtime config no longer defaults to the legacy layout and no longer
    // carries independent specs/archive overrides.
    assert.ok(!configSource.includes("specs: 'specs'"));
    assert.ok(!configSource.includes("archive: 'specs/archive'"));
    assert.ok(!configSource.includes("features: 'features'"));
    assert.ok(!configSource.includes('specs:'));
    assert.ok(!configSource.includes('archive:'));
    assert.ok(configSource.includes("openspecRoot: 'openspec'"));
    assert.ok(configSource.includes("features: 'openspec/specs'"));

    // The watcher does not import or invoke the migration that performs the
    // directory move; that is a human step.
    assert.ok(!loopSource.includes('migrateToOpenSpec'));
    assert.ok(!loopSource.includes('core/migrate'));
  });

  it('extracts a Human steps section from a change document', () => {
    const content = [
      '## Goal',
      'Goal.',
      '## Human steps',
      '',
      CUTOVER_HUMAN_STEPS,
      '',
      '## Contract',
      'Table.',
    ].join('\n');

    const steps = extractHumanSteps(content);
    assert.ok(steps.includes('Stop the running watcher'));
    assert.ok(steps.includes('osq migrate openspec'));
    assert.ok(steps.includes('osq watch'));
    assert.ok(!steps.includes('Table.'));

    assert.equal(extractHumanSteps('## Goal\nNo manual work.\n'), '');
    assert.equal(extractHumanSteps('## Human steps\n\n## Goal\nGoal.\n'), '');
  });
});
