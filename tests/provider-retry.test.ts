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
import { approveSpec } from '../src/core/spec/approve.js';
import { type HarnessEvent, appendHarnessEvent } from '../src/harness/types.js';
import { runAutomaticRetries } from '../src/watcher/auto-retry.js';
import { writeDeadMarker } from '../src/watcher/outcome.js';
import { PROVIDER_REASON, decideProviderRetry } from '../src/watcher/provider-retry.js';
import { installFakeValidator } from './helpers.js';

const VERIFY = 'node verify.cjs';
const DELAY_SECONDS = 300;
const PASSING = 'process.exit(0);\n';

type Gates = Partial<NonNullable<OsqConfig['gates']>>;

interface StreamEvent {
  type: string;
  timestamp?: string;
  data?: Record<string, unknown>;
}

interface Fixture {
  root: string;
  folder: string;
  runDir: string;
  config: OsqConfig;
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
    'title: A provider outage is retried on its own budget',
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

async function setup(gates: Gates = {}): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-provider-retry-'));
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'verify.cjs'), PASSING, 'utf8');

  const spec = await createNewSpec(root, 'Provider Retry');
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
  return { root, folder, runDir: path.join(folder, '.run'), config, logger: new CaptureLogger() };
}

function deadContent(reason: string, body = 'the provider never answered'): string {
  return `---\nreason: ${reason}\n---\n${body}\n`;
}

async function writeDead(fixture: Fixture, reason: string, body?: string): Promise<void> {
  await writeDeadMarker(fixture.runDir, '1', deadContent(reason, body), fixture.root);
}

async function appendDead(fixture: Fixture, timestamp: string): Promise<void> {
  const event: HarnessEvent = {
    type: 'dead',
    timestamp,
    data: { task: '1', reason: PROVIDER_REASON },
  };
  await appendHarnessEvent(fixture.folder, '1', event);
}

async function readEvents(folder: string): Promise<StreamEvent[]> {
  const raw = await fs
    .readFile(path.join(folder, '.run', 'events', '1.jsonl'), 'utf8')
    .catch(() => '');
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as StreamEvent);
}

function automaticRetries(events: readonly StreamEvent[], reason: string): number {
  return events.filter(
    (event) =>
      event.type === 'retry' && event.data?.automatic === true && event.data.reason === reason,
  ).length;
}

function stuckEvents(events: readonly StreamEvent[]): number {
  return events.filter((event) => event.type === 'stuck').length;
}

describe('decideProviderRetry', () => {
  const deadAt = '2026-10-01T00:00:00.000Z';
  const events = [{ type: 'dead', timestamp: deadAt, data: { task: '1' } }];
  const base = { events, providerRetries: 3, delaySeconds: DELAY_SECONDS };

  it('waits until the configured delay has passed', () => {
    assert.equal(decideProviderRetry({ ...base, now: Date.parse(deadAt) + 299_999 }), false);
    assert.equal(decideProviderRetry({ ...base, now: Date.parse(deadAt) + 300_000 }), true);
  });

  it('stops once its own budget is spent', () => {
    const spent = [
      events[0],
      {
        type: 'retry',
        timestamp: deadAt,
        data: { reason: PROVIDER_REASON, automatic: true },
      },
    ];
    assert.equal(
      decideProviderRetry({
        ...base,
        events: spent,
        providerRetries: 1,
        now: Date.parse(deadAt) + DELAY_SECONDS * 1000,
      }),
      false,
    );
  });

  it('does nothing with a zero budget or no dead event', () => {
    assert.equal(
      decideProviderRetry({
        ...base,
        providerRetries: 0,
        now: Date.parse(deadAt) + DELAY_SECONDS * 1000,
      }),
      false,
    );
    assert.equal(
      decideProviderRetry({ ...base, events: [], now: Date.parse(deadAt) + DELAY_SECONDS * 1000 }),
      false,
    );
  });
});

describe('provider retry through the automatic retry decision', () => {
  let fixture: Fixture;

  afterEach(async () => {
    if (fixture) await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it('waits providerRetryDelaySeconds after the latest dead event before retrying', async () => {
    fixture = await setup({ providerRetryDelaySeconds: DELAY_SECONDS, providerRetries: 3 });
    const deadAt = new Date().toISOString();
    await writeDead(fixture, PROVIDER_REASON);
    await appendDead(fixture, deadAt);

    const before = await runAutomaticRetries(
      fixture.root,
      fixture.folder,
      fixture.config,
      fixture.logger,
      Date.parse(deadAt) + (DELAY_SECONDS - 1) * 1000,
    );
    assert.equal(before, 0);
    assert.ok(await exists(path.join(fixture.runDir, 'dead', '1.md')));
    assert.equal(automaticRetries(await readEvents(fixture.folder), PROVIDER_REASON), 0);

    const after = await runAutomaticRetries(
      fixture.root,
      fixture.folder,
      fixture.config,
      fixture.logger,
      Date.parse(deadAt) + DELAY_SECONDS * 1000,
    );
    assert.equal(after, 1);
    assert.equal(await exists(path.join(fixture.runDir, 'dead', '1.md')), false);
    assert.ok(await exists(path.join(fixture.runDir, 'dead', '1.1.md')));
    assert.equal(automaticRetries(await readEvents(fixture.folder), PROVIDER_REASON), 1);
    const line = fixture.logger.infos.find((entry) =>
      entry.includes('retried automatically after provider_unavailable'),
    );
    assert.ok(line, `expected a provider retry line, got: ${fixture.logger.infos.join(' | ')}`);
  });

  it('spends its own budget and never marks a repeated provider outage stuck', async () => {
    fixture = await setup({
      autoRetries: 1,
      providerRetries: 3,
      providerRetryDelaySeconds: 0,
    });
    const content = deadContent(PROVIDER_REASON);

    await writeDead(fixture, PROVIDER_REASON);
    const firstAt = new Date().toISOString();
    await appendDead(fixture, firstAt);
    assert.equal(
      await runAutomaticRetries(
        fixture.root,
        fixture.folder,
        fixture.config,
        fixture.logger,
        Date.parse(firstAt),
      ),
      1,
    );

    // The second death has the same body, so the same fingerprint as 1.1.md.
    await writeDeadMarker(fixture.runDir, '1', content, fixture.root);
    const secondAt = new Date().toISOString();
    await appendDead(fixture, secondAt);
    assert.equal(
      await runAutomaticRetries(
        fixture.root,
        fixture.folder,
        fixture.config,
        fixture.logger,
        Date.parse(secondAt),
      ),
      1,
    );

    const events = await readEvents(fixture.folder);
    assert.equal(automaticRetries(events, PROVIDER_REASON), 2);
    assert.equal(stuckEvents(events), 0);
    assert.equal(
      fixture.logger.infos.filter((entry) => entry.includes('stuck')).length,
      0,
      'a provider outage must never print a stuck line',
    );
    for (const marker of ['1.1.md', '1.2.md']) {
      const retained = await fs.readFile(path.join(fixture.runDir, 'dead', marker), 'utf8');
      assert.doesNotMatch(retained, /^stuck: true$/m);
    }

    // A provider retry leaves gates.autoRetries alone, so verify_red still retries.
    await writeDead(fixture, 'verify_red', 'the verify failed');
    const redAt = new Date().toISOString();
    await appendHarnessEvent(fixture.folder, '1', {
      type: 'dead',
      timestamp: redAt,
      data: { task: '1', reason: 'verify_red' },
    });
    assert.equal(
      await runAutomaticRetries(
        fixture.root,
        fixture.folder,
        fixture.config,
        fixture.logger,
        Date.parse(redAt),
      ),
      1,
    );
    const finalEvents = await readEvents(fixture.folder);
    assert.equal(automaticRetries(finalEvents, 'verify_red'), 1);
    assert.equal(automaticRetries(finalEvents, PROVIDER_REASON), 2);
    assert.ok(await exists(path.join(fixture.runDir, 'dead', '1.3.md')));
  });

  it('stops retrying a provider outage once providerRetries is spent', async () => {
    fixture = await setup({ providerRetries: 1, providerRetryDelaySeconds: 0 });

    await writeDead(fixture, PROVIDER_REASON);
    const firstAt = new Date().toISOString();
    await appendDead(fixture, firstAt);
    assert.equal(
      await runAutomaticRetries(
        fixture.root,
        fixture.folder,
        fixture.config,
        fixture.logger,
        Date.parse(firstAt),
      ),
      1,
    );

    await writeDead(fixture, PROVIDER_REASON, 'again');
    const secondAt = new Date().toISOString();
    await appendDead(fixture, secondAt);
    assert.equal(
      await runAutomaticRetries(
        fixture.root,
        fixture.folder,
        fixture.config,
        fixture.logger,
        Date.parse(secondAt),
      ),
      0,
    );
    assert.ok(await exists(path.join(fixture.runDir, 'dead', '1.md')));
    assert.equal(await exists(path.join(fixture.runDir, 'dead', '1.2.md')), false);
  });

  it('lets gates.autoRetries of zero turn provider retries off too', async () => {
    fixture = await setup({ autoRetries: 0, providerRetries: 3, providerRetryDelaySeconds: 0 });

    await writeDead(fixture, PROVIDER_REASON);
    const deadAt = new Date().toISOString();
    await appendDead(fixture, deadAt);
    assert.equal(
      await runAutomaticRetries(
        fixture.root,
        fixture.folder,
        fixture.config,
        fixture.logger,
        Date.parse(deadAt),
      ),
      0,
    );
    assert.ok(await exists(path.join(fixture.runDir, 'dead', '1.md')));
    assert.equal(await exists(path.join(fixture.runDir, 'dead', '1.1.md')), false);
  });

  it('still marks a repeated non-provider death stuck', async () => {
    fixture = await setup({ autoRetries: 1, providerRetries: 3, providerRetryDelaySeconds: 0 });

    await writeDead(fixture, 'verify_red', 'the same verify failure');
    assert.equal(
      await runAutomaticRetries(fixture.root, fixture.folder, fixture.config, fixture.logger),
      1,
    );

    await writeDead(fixture, 'verify_red', 'the same verify failure');
    assert.equal(
      await runAutomaticRetries(fixture.root, fixture.folder, fixture.config, fixture.logger),
      0,
    );

    const active = await fs.readFile(path.join(fixture.runDir, 'dead', '1.md'), 'utf8');
    assert.match(active, /^stuck: true$/m);
    assert.equal(stuckEvents(await readEvents(fixture.folder)), 1);
  });
});
