import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, defineConfig } from '../src/core/foundation/config.js';
import { readDispatchCard } from '../src/core/status/dispatch-cards.js';
import { readDispatchItems } from '../src/core/status/dispatch-items.js';
import { cardKeys } from '../src/core/status/dispatch-keys.js';
import { orderDispatchItems } from '../src/core/status/dispatch-order.js';
import { formatDispatchCardBody } from '../src/core/status/dispatch-text.js';
import { readInbox } from '../src/core/status/inbox-projection.js';
import { type Inbox, formatInboxText } from '../src/core/status/inbox.js';
import { formatNextStep, readNextStep } from '../src/core/status/next-step.js';

const CHANGES = path.join('openspec', 'changes');
const FINGERPRINT = 'sha256:1111111111111111111111111111111111111111111111111111111111111111';
const NEED = 'Needs src/b.ts in scope.\nInstall b first.';
const COLLAPSED_NEED = 'Needs src/b.ts in scope. Install b first.';

function proposalMd(title: string): string {
  return ['---', `title: ${title}`, 'depends_on: []', '---', '## Goal', `${title} goal.`, ''].join(
    '\n',
  );
}

function taskMd(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'verify: node -e "process.exit(0)"',
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    `- [ ] ${title} criterion`,
    '',
  ].join('\n');
}

async function writeMarker(dir: string, rel: string, content: string): Promise<void> {
  const target = path.join(dir, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

async function createChange(
  root: string,
  folderName: string,
  title: string,
  tasks: Record<string, string>,
): Promise<string> {
  const dir = path.join(root, CHANGES, folderName);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(title), 'utf8');
  for (const [number, taskTitle] of Object.entries(tasks)) {
    await fs.writeFile(path.join(dir, 'tasks', `${number}.md`), taskMd(taskTitle), 'utf8');
  }
  await writeMarker(dir, path.join('.run', 'approved'), 'sha256:fixture\n');
  return dir;
}

let project: string;
let home: string;

beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-steering-inbox-'));
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-steering-inbox-home-'));
});

afterEach(async () => {
  await fs.rm(project, { recursive: true, force: true });
  await fs.rm(home, { recursive: true, force: true });
});

async function readSteeringInbox(): Promise<Inbox> {
  return readInbox(project, { config: DEFAULT_CONFIG, home });
}

describe('Steering inbox items', () => {
  it('shows one change-regressed item for a change with a change and a task trigger', async () => {
    const dir = await createChange(project, '005-multi', 'Multi trigger', {
      1: 'First task',
      2: 'Second task',
    });
    await writeMarker(
      dir,
      path.join('.run', 'regressed', 'change.md'),
      '---\nreason: verify_red\n---\nred\n',
    );
    await writeMarker(
      dir,
      path.join('.run', 'dead', '2.md'),
      `---\nreason: verify_red\nstuck: true\nfingerprint: ${FINGERPRINT}\n---\nbad\n`,
    );

    const inbox = await readSteeringInbox();
    const items = inbox.needsYou.filter((item) => item.change.id === '005');

    assert.equal(items.length, 1);
    assert.equal(items[0]?.kind, 'change-regressed');
    assert.equal(items[0]?.task, null);
    assert.equal(items[0]?.command, 'osq plan 005');
    assert.deepEqual(items[0]?.steering, { trigger: 'regression', reason: 'verify_red' });
  });

  it('renders the stuck task row with the steering trigger', async () => {
    const dir = await createChange(project, '002-dead', 'Dead change', { 1: 'First dead' });
    await writeMarker(
      dir,
      path.join('.run', 'dead', '1.md'),
      `---\nreason: verify_red\nstuck: true\nfingerprint: ${FINGERPRINT}\n---\nbad\n`,
    );

    const inbox = await readSteeringInbox();
    const text = formatInboxText(inbox);
    assert.ok(
      text.includes(
        '  002: Dead change — task 1: First dead — needs steering: stuck (verify_red) — osq plan 002',
      ),
      text,
    );
    const item = inbox.needsYou.find((candidate) => candidate.change.id === '002');
    assert.deepEqual(item?.stuck, { fingerprint: FINGERPRINT });
    assert.deepEqual(item?.steering, { trigger: 'stuck', reason: 'verify_red' });
  });

  it('renders the blocked task row with the collapsed need', async () => {
    const dir = await createChange(project, '001-blocked', 'Blocked change', { 1: 'Blocked task' });
    await writeMarker(
      dir,
      path.join('.run', 'dead', '1.md'),
      '---\nreason: blocked\n---\nNeeds more scope.\n',
    );
    await writeMarker(
      dir,
      path.join('.run', 'results', '1.md'),
      `## Changed\n\n- x\n\n## Blocked\n${NEED}\n`,
    );

    const inbox = await readSteeringInbox();
    const item = inbox.needsYou.find((candidate) => candidate.change.id === '001');
    assert.deepEqual(item?.steering, { trigger: 'blocked', reason: 'blocked' });
    assert.deepEqual(item?.blocked, { need: NEED });
    assert.equal(item?.command, 'osq plan 001');
    assert.ok(
      formatInboxText(inbox).includes(
        `  001: Blocked change — task 1: Blocked task — needs steering: blocked (blocked): ${COLLAPSED_NEED} — osq plan 001`,
      ),
    );
  });

  it('leaves a dead task that is not a trigger on its retry command', async () => {
    const dir = await createChange(project, '003-dead', 'No trigger', { 1: 'Retry task' });
    await writeMarker(
      dir,
      path.join('.run', 'dead', '1.md'),
      '---\nreason: verify_red\n---\nred\n',
    );

    const inbox = await readSteeringInbox();
    const item = inbox.needsYou.find((candidate) => candidate.change.id === '003');
    assert.equal('steering' in (item as object), false);
    assert.equal(item?.command, 'osq retry 003 1');
  });
});

describe('Steering field', () => {
  it('adds steering only to the change that needs it', async () => {
    const blocked = await createChange(project, '001-blocked', 'Blocked change', {
      1: 'Blocked task',
    });
    await writeMarker(blocked, path.join('.run', 'dead', '1.md'), '---\nreason: blocked\n---\nx\n');

    const plain = await createChange(project, '002-dead', 'Plain dead', { 1: 'Dead task' });
    await writeMarker(
      plain,
      path.join('.run', 'dead', '1.md'),
      '---\nreason: verify_red\n---\nx\n',
    );

    const inbox = await readSteeringInbox();
    const blockedItem = inbox.needsYou.find((candidate) => candidate.change.id === '001');
    const plainItem = inbox.needsYou.find((candidate) => candidate.change.id === '002');

    assert.deepEqual(blockedItem?.steering, { trigger: 'blocked', reason: 'blocked' });
    assert.deepEqual(Object.keys(plainItem as object), ['kind', 'change', 'task', 'command']);
    assert.equal('steering' in (plainItem as object), false);
  });
});

describe('Steering halt', () => {
  it('collapses a change regression and a blocked task to one dispatch halt', async () => {
    const dir = await createChange(project, '005-multi', 'Multi trigger', {
      1: 'First task',
      2: 'Blocked task',
    });
    await writeMarker(
      dir,
      path.join('.run', 'regressed', 'change.md'),
      '---\nreason: verify_red\n---\nred\n',
    );
    await writeMarker(dir, path.join('.run', 'dead', '2.md'), '---\nreason: blocked\n---\nx\n');

    const dispatch = await readDispatchItems(project, defineConfig({}));
    const halts = dispatch.items.filter((item) => item.kind === 'halt' && item.change.id === '005');

    assert.equal(halts.length, 1);
    assert.equal(halts[0]?.task, null);
    assert.deepEqual(halts[0]?.steering, {
      target: 'change',
      trigger: 'regression',
      reason: 'verify_red',
    });
    assert.deepEqual(halts[0]?.commands, ['osq plan 005', 'osq show 005']);
  });
});

describe('Steering keys', () => {
  it('maps the steering halt to p and s with no manual commands', async () => {
    const dir = await createChange(project, '007-stuck', 'Stuck change', { 2: 'Stuck task' });
    await writeMarker(
      dir,
      path.join('.run', 'dead', '2.md'),
      `---\nreason: verify_red\nstuck: true\nfingerprint: ${FINGERPRINT}\n---\nbad\n`,
    );

    const config = defineConfig({});
    const dispatch = await readDispatchItems(project, config);
    const [item] = await orderDispatchItems(project, config, dispatch);
    assert.ok(item, 'expected a steering item');
    const mapped = cardKeys(item);

    assert.deepEqual(
      mapped.keys.map((key) => key.key),
      ['p', 's'],
    );
    assert.deepEqual(mapped.keys[0]?.args, ['plan', '007']);
    assert.deepEqual(mapped.keys[1]?.args, ['show', '007']);
    assert.deepEqual(mapped.manual, []);
  });
});

describe('Steering card', () => {
  it('prints the steering line after why and the card body', async () => {
    const dir = await createChange(project, '003-blocked', 'Blocked change', {
      3: 'Blocked task',
    });
    await writeMarker(dir, path.join('.run', 'dead', '3.md'), '---\nreason: blocked\n---\nx\n');

    const config = defineConfig({});
    const dispatch = await readDispatchItems(project, config);
    const [item] = await orderDispatchItems(project, config, dispatch);
    assert.ok(item, 'expected a steering item');
    const card = await readDispatchCard(project, config, item);
    const body = formatDispatchCardBody(item, card);

    assert.deepEqual(body.slice(0, 3), [
      'halt: 003-blocked',
      `  why: ${item.reason}`,
      '  needs steering: task 3 blocked (blocked)',
    ]);
  });
});

describe('Steering format', () => {
  it('renders dead (needs steering) with the plan command', async () => {
    const dir = await createChange(project, '007-stuck', 'Stuck change', { 2: 'Stuck task' });
    await writeMarker(
      dir,
      path.join('.run', 'dead', '2.md'),
      `---\nreason: verify_red\nstuck: true\nfingerprint: ${FINGERPRINT}\n---\nbad\n`,
    );

    const step = await readNextStep(project, dir, DEFAULT_CONFIG);
    assert.deepEqual(step, { state: 'dead', command: 'osq plan 007', detail: 'needs steering' });
    assert.equal(formatNextStep(step), 'dead (needs steering) — osq plan 007');
  });
});
