import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import type { Logger } from '../src/core/foundation/logger.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { parseResultSections } from '../src/core/report/result-sections.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { getArchiveDir } from '../src/core/status/layout.js';
import { MockAdapter } from '../src/harness/mock.js';
import { runWatcherCycle, runWatcherOnce } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const VERIFY = 'node verify.cjs';

const PASSING = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

const BLOCKED = [
  '# Result for Task 1',
  '',
  '## Changed',
  '',
  'None',
  '',
  '## Blocked',
  '',
  'Needs src/b.ts in scope',
].join('\n');

const NONE_BLOCKED = [
  '# Result for Task 1',
  '',
  '## Changed',
  '',
  'Did the work.',
  '',
  '## Blocked',
  '',
  'none.',
].join('\n');

type Gates = Partial<NonNullable<OsqConfig['gates']>>;

interface StreamEvent {
  type: string;
  data?: Record<string, unknown>;
}

interface Fixture {
  root: string;
  folder: string;
  runDir: string;
  config: OsqConfig;
  adapter: MockAdapter;
  logger: CaptureLogger;
}

class CaptureLogger implements Logger {
  readonly infos: string[] = [];
  readonly warns: string[] = [];
  readonly errors: string[] = [];
  readonly statuses: string[] = [];
  readonly interactive = false;
  readonly symbols = false;

  info(msg: string): void {
    this.infos.push(msg);
  }
  verbose(_msg: string): void {}
  warn(msg: string): void {
    this.warns.push(msg);
  }
  error(msg: string): void {
    this.errors.push(msg);
  }
  status(text: string): void {
    this.statuses.push(text);
  }
  clearStatus(): void {}
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

async function writeTask(folder: string): Promise<void> {
  const content = [
    '---',
    'title: When a task states a real Blocked need it dies without a verify',
    `verify: ${VERIFY}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] should be observed',
    '',
  ].join('\n');
  await fs.writeFile(path.join(folder, 'tasks', '1.md'), content, 'utf8');
}

async function setup(verifyScript: string, gates: Gates = {}): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-blocked-exit-'));
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'verify.cjs'), verifyScript, 'utf8');

  const spec = await createNewSpec(root, 'Blocked Exit');
  const folder = spec.folderPath;
  await writeTask(folder);
  const proposalPath = path.join(folder, 'proposal.md');
  const proposal = await fs.readFile(proposalPath, 'utf8');
  await fs.writeFile(proposalPath, proposal.replace(/^verify:.*$/m, `verify: ${VERIFY}`), 'utf8');
  await approveSpec(root, '001', DEFAULT_CONFIG);

  const config: OsqConfig = {
    ...DEFAULT_CONFIG,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off', ...gates },
  };
  return {
    root,
    folder,
    runDir: path.join(folder, '.run'),
    config,
    adapter: new MockAdapter(),
    logger: new CaptureLogger(),
  };
}

async function readEvents(folder: string, target = '1'): Promise<StreamEvent[]> {
  const raw = await fs
    .readFile(path.join(folder, '.run', 'events', `${target}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as StreamEvent);
}

async function singleArchived(root: string, config: OsqConfig): Promise<string> {
  const archiveDir = getArchiveDir(config.paths.openspecRoot, root);
  const entries = (await fs.readdir(archiveDir)).sort();
  assert.equal(entries.length, 1, `expected one archived change, got ${entries.join(', ')}`);
  return path.join(archiveDir, entries[0]);
}

describe('blocked exit through the watcher loop', () => {
  let fixture: Fixture;

  afterEach(async () => {
    if (fixture) await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it('dies blocked with the stated need and runs no verify', async () => {
    fixture = await setup(PASSING);
    fixture.adapter.setBehavior({ resultContent: BLOCKED });

    const summary = await runWatcherCycle(
      fixture.root,
      fixture.config,
      fixture.adapter,
      fixture.logger,
    );

    assert.equal(summary.tasksRun, 1);
    assert.equal(await exists(path.join(fixture.runDir, 'done', '1')), false);

    const marker = await fs.readFile(path.join(fixture.runDir, 'dead', '1.md'), 'utf8');
    assert.match(marker, /^reason: blocked$/m);
    assert.match(marker, /Needs src\/b\.ts in scope/);

    const events = await readEvents(fixture.folder);
    const dead = events.find((event) => event.type === 'dead');
    assert.equal(dead?.data?.reason, 'blocked');
    assert.equal(
      events.filter((event) => event.type === 'verify_ran').length,
      0,
      'a blocked task must not run its verify',
    );
  });

  it('never retries a blocked death in a cycle with autoRetries 1', async () => {
    fixture = await setup(PASSING, { autoRetries: 1 });
    fixture.adapter.setBehavior({ resultContent: BLOCKED });

    await runWatcherCycle(fixture.root, fixture.config, fixture.adapter, fixture.logger);
    assert.ok(await exists(path.join(fixture.runDir, 'dead', '1.md')));

    const second = await runWatcherCycle(
      fixture.root,
      fixture.config,
      fixture.adapter,
      fixture.logger,
    );

    assert.equal(second.retried, 0);
    assert.ok(await exists(path.join(fixture.runDir, 'dead', '1.md')));
    assert.equal(await exists(path.join(fixture.runDir, 'dead', '1.1.md')), false);
    assert.equal(
      (await readEvents(fixture.folder)).filter((event) => event.type === 'retry').length,
      0,
    );
  });

  it('lets a Blocked section saying None fall through to the verify', async () => {
    fixture = await setup(PASSING);
    fixture.adapter.setBehavior({ resultContent: NONE_BLOCKED });

    const summary = await runWatcherOnce(
      fixture.root,
      fixture.config,
      fixture.adapter,
      fixture.logger,
    );

    assert.equal(summary.tasksRun, 1);
    assert.equal(summary.specsArchived, 1);

    const archived = await singleArchived(fixture.root, fixture.config);
    assert.ok(await exists(path.join(archived, '.run', 'done', '1')));
    assert.ok(
      (await readEvents(archived)).some((event) => event.type === 'verify_ran'),
      'a None Blocked section must not stop the verify',
    );
  });
});

describe('parseResultSections blocked section', () => {
  it('reads ## blocked: and treats None as absent without a disclosure', () => {
    const present = parseResultSections('## blocked:\n\nNeeds the database\n');
    assert.equal(present.blocked, 'Needs the database');
    assert.equal(present.deviated, null);
    assert.equal(present.missingContext, null);
    assert.equal(present.outsideScope, null);

    const absent = parseResultSections('## Blocked\n\nnone.\n');
    assert.equal(absent.blocked, null);
  });
});
