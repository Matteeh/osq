import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { needsYouKindLabel } from '../packages/ui/src/home/labels.js';
import { statusCommand } from '../src/cli/status.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { readInbox } from '../src/core/status/inbox-projection.js';
import { formatInboxText } from '../src/core/status/inbox.js';
import type { NeedsYouItem } from '../src/core/status/inbox.js';
import { readValidatorFailing } from '../src/core/status/validator-failing.js';

const CHANGES = path.posix.join('openspec', 'changes');
const ARCHIVE = path.join(CHANGES, 'archive');
const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-validator-'));
  tmpDirs.push(root);
  return root;
}

async function writeAt(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

function proposalMd(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    `${title} goal.`,
    '',
  ].join('\n');
}

/** One `validator_ran` event to write into an archived change's stream. */
interface ValidatorRunEvent {
  readonly outcome: string;
  readonly output?: string;
  readonly reason?: string;
}

/** Writes archived changes 001-a titled A and 002-b titled B with the runs. */
async function setupChanges(runs: {
  readonly a?: ValidatorRunEvent;
  readonly b?: ValidatorRunEvent;
}): Promise<{ repo: string; home: string; config: OsqConfig }> {
  const root = await tempRoot();
  const repo = path.join(root, 'repo');
  const home = path.join(root, 'home');
  const changes: Array<{
    folder: string;
    title: string;
    run: ValidatorRunEvent | undefined;
    timestamp: string;
  }> = [
    { folder: '001-a', title: 'A', run: runs.a, timestamp: '2026-01-01T00:00:00.000Z' },
    { folder: '002-b', title: 'B', run: runs.b, timestamp: '2026-01-02T00:00:00.000Z' },
  ];
  for (const { folder, title, run, timestamp } of changes) {
    const folderPath = path.join(repo, ARCHIVE, folder);
    await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMd(title), 'utf8');
    if (run === undefined) continue;
    const data: Record<string, unknown> = { outcome: run.outcome };
    if (run.output !== undefined) data.output = run.output;
    if (run.reason !== undefined) data.reason = run.reason;
    await writeAt(
      folderPath,
      path.join('.run', 'events', 'change.jsonl'),
      `${JSON.stringify({ type: 'validator_ran', timestamp, data })}\n`,
    );
  }
  return { repo, home, config: defineConfig({}) };
}

/** The inbox's one validator-failing item, or the empty array. */
function validatorItems(needsYou: readonly NeedsYouItem[]): NeedsYouItem[] {
  return needsYou.filter((item) => item.kind === 'validator-failing');
}

describe('Validator failing', () => {
  it('fails on 001 and 002 in time order: one validator-failing item for 002, runs 2', async () => {
    const FAILING =
      '[claude-code:unrecognized_model] {"model":"claude-opus-5-5"}\n\nClaude Code result: success';
    const ERROR = '[claude-code:unrecognized_model] {"model":"claude-opus-5-5"}';
    const { repo, home, config } = await setupChanges({
      a: { outcome: 'failed', output: FAILING },
      b: { outcome: 'failed', output: FAILING },
    });

    assert.deepEqual(await readValidatorFailing(repo, config), {
      change: '002-b',
      outcome: 'failed',
      runs: 2,
      error: ERROR,
    });

    const inbox = await readInbox(repo, { config, home });
    assert.deepEqual(inbox.needsYou, [
      {
        kind: 'validator-failing',
        change: { id: '002', title: 'B' },
        task: null,
        command: 'osq show 002',
        validatorFailing: { outcome: 'failed', runs: 2, error: ERROR },
      },
    ]);

    const text = formatInboxText(inbox);
    assert.ok(
      text.split('\n').includes(`  002: B — validator failed 2× in a row: ${ERROR} — osq show 002`),
      text,
    );

    const status = await statusCommand({
      cwd: repo,
      config,
      home,
      stdout: () => {},
      stderr: () => {},
    });
    assert.ok(
      status
        .split('\n')
        .includes(`Validator failed 2× in a row, last on 002: ${ERROR} — osq show 002`),
      status,
    );
  });

  it('validated then timed_out without output: item for 002 with error timed_out, runs 1', async () => {
    const { repo, home, config } = await setupChanges({
      a: { outcome: 'validated' },
      b: { outcome: 'timed_out' },
    });

    assert.deepEqual(await readValidatorFailing(repo, config), {
      change: '002-b',
      outcome: 'timed_out',
      runs: 1,
      error: 'timed_out',
    });

    const inbox = await readInbox(repo, { config, home });
    assert.deepEqual(validatorItems(inbox.needsYou), [
      {
        kind: 'validator-failing',
        change: { id: '002', title: 'B' },
        task: null,
        command: 'osq show 002',
        validatorFailing: { outcome: 'timed_out', runs: 1, error: 'timed_out' },
      },
    ]);
    assert.ok(
      formatInboxText(inbox)
        .split('\n')
        .includes('  002: B — validator timed_out 1× in a row: timed_out — osq show 002'),
    );

    const status = await statusCommand({
      cwd: repo,
      config,
      home,
      stdout: () => {},
      stderr: () => {},
    });
    assert.ok(
      status
        .split('\n')
        .includes('Validator timed_out 1× in a row, last on 002: timed_out — osq show 002'),
      status,
    );
  });

  it('failed on 001 with not_run on 002: item for 001 with error boom, runs 1', async () => {
    const { repo, home, config } = await setupChanges({
      a: { outcome: 'failed', output: 'boom' },
      b: { outcome: 'not_run', reason: 'no_base' },
    });

    assert.deepEqual(await readValidatorFailing(repo, config), {
      change: '001-a',
      outcome: 'failed',
      runs: 1,
      error: 'boom',
    });

    const inbox = await readInbox(repo, { config, home });
    assert.deepEqual(inbox.needsYou, [
      {
        kind: 'validator-failing',
        change: { id: '001', title: 'A' },
        task: null,
        command: 'osq show 001',
        validatorFailing: { outcome: 'failed', runs: 1, error: 'boom' },
      },
    ]);
    assert.ok(
      formatInboxText(inbox)
        .split('\n')
        .includes('  001: A — validator failed 1× in a row: boom — osq show 001'),
    );

    const status = await statusCommand({
      cwd: repo,
      config,
      home,
      stdout: () => {},
      stderr: () => {},
    });
    assert.ok(
      status.split('\n').includes('Validator failed 1× in a row, last on 001: boom — osq show 001'),
      status,
    );
  });

  it('failed on 001 then validated on 002: a passing run clears the failing line', async () => {
    const { repo, home, config } = await setupChanges({
      a: { outcome: 'failed', output: 'boom' },
      b: { outcome: 'validated' },
    });

    assert.equal(await readValidatorFailing(repo, config), null);

    const inbox = await readInbox(repo, { config, home });
    assert.deepEqual(validatorItems(inbox.needsYou), []);
    assert.ok(!formatInboxText(inbox).includes('validator failed'));

    const status = await statusCommand({
      cwd: repo,
      config,
      home,
      stdout: () => {},
      stderr: () => {},
    });
    assert.ok(!status.split('\n').some((line) => line.startsWith('Validator ')), status);
  });
});

describe('No validator runs', () => {
  it('no validator_ran event in any archived change: no item and no status line', async () => {
    const { repo, home, config } = await setupChanges({});

    assert.equal(await readValidatorFailing(repo, config), null);

    const inbox = await readInbox(repo, { config, home });
    assert.deepEqual(validatorItems(inbox.needsYou), []);
    assert.ok(!formatInboxText(inbox).includes('validator failed'));

    const status = await statusCommand({
      cwd: repo,
      config,
      home,
      stdout: () => {},
      stderr: () => {},
    });
    assert.ok(!status.split('\n').some((line) => line.startsWith('Validator ')), status);
  });
});

describe('Validator failing label', () => {
  it('labels validator-failing as validator failing', () => {
    assert.equal(needsYouKindLabel('validator-failing'), 'validator failing');
  });
});
