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
import { retrySpec } from '../src/core/lifecycle/retry.js';
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

const FAIL_ONCE = `const fs = require('node:fs');
let n = 0;
try { n = Number(fs.readFileSync('attempts', 'utf8')); } catch {}
n += 1;
fs.writeFileSync('attempts', String(n));
if (n === 1) { console.error('first attempt failed'); process.exit(1); }
process.exit(0);
`;

const FAIL_THRICE = `const fs = require('node:fs');
let n = 0;
try { n = Number(fs.readFileSync('attempts', 'utf8')); } catch {}
n += 1;
fs.writeFileSync('attempts', String(n));
if (n <= 3) { console.error('failure ' + n); process.exit(1); }
process.exit(0);
`;

const ALWAYS_FAIL = `console.error('same deterministic failure');
process.exit(1);
`;

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

async function writeTask(folder: string, extra: string[] = []): Promise<void> {
  const content = [
    '---',
    'title: When an eligible task dies, the watcher retries it once',
    `verify: ${VERIFY}`,
    ...extra,
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-auto-retry-'));
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'verify.cjs'), verifyScript, 'utf8');

  const spec = await createNewSpec(root, 'Automatic Retry');
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

function automaticRetries(events: readonly StreamEvent[]): number {
  return events.filter((event) => event.type === 'retry' && event.data?.automatic === true).length;
}

function manualRetries(events: readonly StreamEvent[]): number {
  return events.filter((event) => event.type === 'retry' && event.data?.automatic !== true).length;
}

async function singleArchived(root: string, config: OsqConfig): Promise<string> {
  const entries = (await fs.readdir(getArchiveDir(config.paths.openspecRoot, root))).sort();
  assert.equal(entries.length, 1, `expected one archived change, got ${entries.join(', ')}`);
  return path.join(getArchiveDir(config.paths.openspecRoot, root), entries[0]);
}

describe('automatic retry through the watcher loop', () => {
  let fixture: Fixture;

  afterEach(async () => {
    if (fixture) await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it('retries a verify_red death once and reaches done', async () => {
    fixture = await setup(FAIL_ONCE);

    const summary = await runWatcherOnce(
      fixture.root,
      fixture.config,
      fixture.adapter,
      fixture.logger,
    );

    assert.equal(summary.retried, 1);
    assert.equal(summary.tasksRun, 2);

    const archived = await singleArchived(fixture.root, fixture.config);
    const events = await readEvents(archived);
    assert.equal(automaticRetries(events), 1);
    assert.equal(manualRetries(events), 0);
    assert.ok(await exists(path.join(archived, '.run', 'done', '1')));
    assert.equal(await exists(path.join(archived, '.run', 'dead', '1.md')), false);
    assert.ok(await exists(path.join(archived, '.run', 'dead', '1.1.md')));

    const lines = fixture.logger.infos.filter((line) =>
      line.includes('retried automatically after verify_red (attempt 2)'),
    );
    assert.equal(lines.length, 1, `expected one retry line, got: ${lines.join(' | ')}`);
    assert.match(lines[0], /\[retry\] task 1 of 001/);
  });

  it('marks a task stuck after two identical deaths with no third attempt', async () => {
    fixture = await setup(ALWAYS_FAIL);

    const summary = await runWatcherOnce(
      fixture.root,
      fixture.config,
      fixture.adapter,
      fixture.logger,
    );

    assert.equal(summary.retried, 1);
    assert.equal(summary.tasksRun, 2);

    const active = await fs.readFile(path.join(fixture.runDir, 'dead', '1.md'), 'utf8');
    assert.match(active, /^stuck: true$/m);
    assert.ok(await exists(path.join(fixture.runDir, 'dead', '1.1.md')));

    const events = await readEvents(fixture.folder);
    assert.equal(events.filter((event) => event.type === 'stuck').length, 1);
    assert.equal(events.filter((event) => event.type === 'started').length, 2);
    const stuck = events.find((event) => event.type === 'stuck');
    assert.match(String(stuck?.data?.fingerprint), /^sha256:[0-9a-f]{64}$/);
    assert.equal(stuck?.data?.task, '1');

    const lines = fixture.logger.infos.filter((line) => line.includes('stuck: same failure twice'));
    assert.equal(lines.length, 1, `expected one stuck line, got: ${lines.join(' | ')}`);
    assert.match(lines[0], /\[stuck\] task 1 of 001/);
  });

  it('never retries a spec_conflict death', async () => {
    fixture = await setup(PASSING);
    const taskPath = path.join(fixture.folder, 'tasks', '1.md');
    const content = await fs.readFile(taskPath, 'utf8');
    await fs.writeFile(taskPath, `${content}\n<!-- edited after approval -->\n`, 'utf8');

    const summary = await runWatcherOnce(
      fixture.root,
      fixture.config,
      fixture.adapter,
      fixture.logger,
    );

    assert.equal(summary.retried, 0);
    assert.equal(summary.tasksRun, 1);
    const active = await fs.readFile(path.join(fixture.runDir, 'dead', '1.md'), 'utf8');
    assert.match(active, /reason: spec_conflict/);
    assert.equal(await exists(path.join(fixture.runDir, 'dead', '1.1.md')), false);
    assert.equal(automaticRetries(await readEvents(fixture.folder)), 0);
    assert.equal(
      (await readEvents(fixture.folder)).filter((event) => event.type === 'started').length,
      0,
    );
  });

  it('never retries a verify_precondition death', async () => {
    fixture = await setup(PASSING, { preSpawnVerify: 'fail' });

    const summary = await runWatcherOnce(
      fixture.root,
      fixture.config,
      fixture.adapter,
      fixture.logger,
    );

    assert.equal(summary.retried, 0);
    assert.equal(summary.tasksRun, 1);
    const active = await fs.readFile(path.join(fixture.runDir, 'dead', '1.md'), 'utf8');
    assert.match(active, /reason: verify_precondition/);
    assert.equal(await exists(path.join(fixture.runDir, 'dead', '1.1.md')), false);
    assert.equal(automaticRetries(await readEvents(fixture.folder)), 0);
  });

  it('does nothing when the configured count is zero', async () => {
    fixture = await setup(ALWAYS_FAIL, { autoRetries: 0 });

    const summary = await runWatcherOnce(
      fixture.root,
      fixture.config,
      fixture.adapter,
      fixture.logger,
    );

    assert.equal(summary.retried, 0);
    assert.equal(summary.tasksRun, 1);
    assert.ok(await exists(path.join(fixture.runDir, 'dead', '1.md')));
    assert.equal(await exists(path.join(fixture.runDir, 'dead', '1.1.md')), false);
    assert.equal(automaticRetries(await readEvents(fixture.folder)), 0);
    assert.equal(
      (await readEvents(fixture.folder)).filter((event) => event.type === 'started').length,
      1,
    );
  });

  it('allows one more automatic retry after a manual retry resets the budget', async () => {
    fixture = await setup(FAIL_THRICE);

    const first = await runWatcherOnce(
      fixture.root,
      fixture.config,
      fixture.adapter,
      fixture.logger,
    );
    assert.equal(first.retried, 1);
    assert.equal(automaticRetries(await readEvents(fixture.folder)), 1);
    assert.ok(await exists(path.join(fixture.runDir, 'dead', '1.md')));
    assert.ok(await exists(path.join(fixture.runDir, 'dead', '1.1.md')));

    // The same transition `osq retry` performs; the manual event resets the cutoff.
    await retrySpec(fixture.root, '001', '1', fixture.config);
    assert.equal(await exists(path.join(fixture.runDir, 'dead', '1.md')), false);
    assert.ok(await exists(path.join(fixture.runDir, 'dead', '1.2.md')));

    const second = await runWatcherOnce(
      fixture.root,
      fixture.config,
      fixture.adapter,
      fixture.logger,
    );
    assert.equal(second.retried, 1);

    const archived = await singleArchived(fixture.root, fixture.config);
    const events = await readEvents(archived);
    assert.equal(automaticRetries(events), 2);
    assert.equal(manualRetries(events), 1);
    assert.ok(await exists(path.join(archived, '.run', 'done', '1')));
  });

  it('retries exactly once a death recorded before a restart', async () => {
    fixture = await setup(FAIL_ONCE);

    // A single cycle records the death and halts; the decision has not run yet.
    await runWatcherCycle(fixture.root, fixture.config, fixture.adapter, fixture.logger);
    assert.ok(await exists(path.join(fixture.runDir, 'dead', '1.md')));
    assert.equal(await exists(path.join(fixture.runDir, 'dead', '1.1.md')), false);
    assert.equal(automaticRetries(await readEvents(fixture.folder)), 0);

    // A fresh run reconstructs the decision from disk and retries once.
    const summary = await runWatcherOnce(
      fixture.root,
      fixture.config,
      fixture.adapter,
      fixture.logger,
    );

    assert.equal(summary.retried, 1);
    const archived = await singleArchived(fixture.root, fixture.config);
    const events = await readEvents(archived);
    assert.equal(automaticRetries(events), 1);
    assert.equal(events.filter((event) => event.type === 'started').length, 2);
  });
});
