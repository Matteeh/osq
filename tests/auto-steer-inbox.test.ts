import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import {
  type AutoSteerOutcome,
  steeringKey,
  writeAutoSteerRecord,
} from '../src/core/run/auto-steer-record.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { readDispatchItems } from '../src/core/status/dispatch-items.js';
import { formatDispatchCardBody } from '../src/core/status/dispatch-text.js';
import { readDispatch } from '../src/core/status/dispatch.js';
import { readInbox } from '../src/core/status/inbox-projection.js';
import { formatInboxText } from '../src/core/status/inbox-text.js';
import { formatNextStep, readNextStep } from '../src/core/status/next-step.js';
import { type SpecState, deriveSpecState } from '../src/core/status/state.js';
import { getWebActions } from '../src/core/web/web-actions.js';
import { installFakeValidator } from './helpers.js';

const CHANGES = path.join('openspec', 'changes');
const FOLDER = '001-order-flow';
const READY_ROW =
  '  001: Order Flow — task 2: Second task — revised plan ready after blocked (blocked): changed tasks/2.md — osq approve 001';
const LINT_RED_ROW =
  '  001: Order Flow — task 2: Second task — needs steering: blocked (blocked): Needs src/three.txt — automatic planner lint_red — osq plan 001';

const PROPOSAL = [
  '---',
  'title: Order Flow',
  'depends_on: []',
  'verify: node verify.cjs',
  '---',
  '## Goal',
  '',
  'Order Flow goal.',
  '',
  '## Non-goals',
  '',
  'None',
  '',
  '## Surface',
  '',
  'None',
  '',
  '## Decisions',
  '',
  'None',
  '',
  '## Assumptions',
  '',
  'None',
  '',
  '## Contract',
  '',
  'None',
  '',
  '## Human steps',
  '',
  'None',
  '',
  '## Delta',
  '',
  'None',
  '',
].join('\n');

function taskMd(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'verify: node verify.cjs',
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

const BLOCKED_MARKER = '---\nreason: blocked\n---\nNeeds a plan revision.\n';

let root: string;
let home: string;
let folderPath: string;
let config: ReturnType<typeof defineConfig>;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-auto-steer-inbox-'));
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-auto-steer-inbox-home-'));
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  folderPath = path.join(root, CHANGES, FOLDER);
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), PROPOSAL, 'utf8');
  await fs.writeFile(
    path.join(folderPath, 'tasks.md'),
    '# Tasks\n\n- [ ] 1. First task\n- [ ] 2. Second task\n',
    'utf8',
  );
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), taskMd('First task'), 'utf8');
  await fs.writeFile(path.join(folderPath, 'tasks', '2.md'), taskMd('Second task'), 'utf8');
  config = defineConfig({});
  await approveSpec(root, '001', config, { planningReaders: [] });
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(home, { recursive: true, force: true });
});

/** The approved change's derived state, which must carry the blocked trigger. */
async function steeredState(): Promise<SpecState> {
  const state = await deriveSpecState(root, folderPath);
  assert.ok(state.approvedHash, 'the change is approved');
  assert.ok((state.steering?.length ?? 0) > 0, 'the change needs steering');
  return state;
}

/** Write `.run/auto-steer.md` with the key of the change's current triggers. */
async function writeCurrentRecord(outcome: AutoSteerOutcome, changed: string[]): Promise<void> {
  const state = await steeredState();
  const key = await steeringKey(folderPath, state.approvedHash as string, state.steering ?? []);
  await writeAutoSteerRecord(folderPath, {
    key,
    outcome,
    changed,
    at: '2026-10-13T00:00:00.000Z',
  });
}

async function blockedTask(need?: string): Promise<void> {
  await writeMarker(folderPath, path.join('.run', 'dead', '2.md'), BLOCKED_MARKER);
  if (need !== undefined) {
    await writeMarker(folderPath, path.join('.run', 'results', '2.md'), `## Blocked\n${need}\n`);
  }
}

async function readItem(): Promise<Record<string, unknown>> {
  const inbox = await readInbox(root, { config, home });
  const item = inbox.needsYou.find((candidate) => candidate.change.id === '001');
  assert.ok(item, 'expected one needs-you item for 001');
  return item as unknown as Record<string, unknown>;
}

describe('Revised plan from the automatic planner', () => {
  it('shows a ready plan in the inbox and offers the approve command', async () => {
    await blockedTask();
    await writeCurrentRecord('ready', ['tasks/2.md']);

    const item = await readItem();
    assert.equal(item.kind, 'task-dead');
    assert.equal(item.command, 'osq approve 001');
    assert.deepEqual(item.steering, { trigger: 'blocked', reason: 'blocked' });
    assert.deepEqual(item.autoSteer, { outcome: 'ready', changed: ['tasks/2.md'] });

    const inbox = await readInbox(root, { config, home });
    assert.ok(formatInboxText(inbox).includes(READY_ROW), formatInboxText(inbox));
  });

  it('offers the approve action and the revised next step', async () => {
    await blockedTask();
    await writeCurrentRecord('ready', ['tasks/2.md']);

    const dispatch = await readDispatchItems(root, config);
    const halts = dispatch.items.filter((item) => item.kind === 'halt' && item.change.id === '001');
    assert.equal(halts.length, 1);
    assert.deepEqual(halts[0]?.commands, ['osq approve 001', 'osq plan 001', 'osq show 001']);
    assert.deepEqual(halts[0]?.autoSteer, { outcome: 'ready', changed: ['tasks/2.md'] });

    const web = await getWebActions(root, '001', config);
    const approve = web.actions.find((action) => action.verb === 'approve');
    assert.deepEqual(approve, { verb: 'approve', command: 'osq approve 001', target: null });

    const step = await readNextStep(root, folderPath, config);
    assert.deepEqual(step, {
      state: 'dead',
      command: 'osq approve 001',
      detail: 'revised plan ready',
    });
    assert.equal(formatNextStep(step), 'dead (revised plan ready) — osq approve 001');
  });

  it('prints the automatic planner line on the ready plan card', async () => {
    await blockedTask();
    await writeCurrentRecord('ready', ['tasks/2.md']);

    const preview = await readDispatch(root, config, home);
    const [first] = preview.items;
    assert.ok(first, 'expected a dispatch item');
    assert.ok(preview.card, 'expected a card');
    const body = formatDispatchCardBody(first, preview.card);

    const steeringIndex = body.indexOf('  needs steering: task 2 blocked (blocked)');
    assert.notEqual(steeringIndex, -1, body.join('\n'));
    assert.equal(body[steeringIndex + 1], '  automatic planner: ready, changed tasks/2.md');
  });

  it('names a lint-red outcome beside osq plan', async () => {
    await blockedTask('Needs src/three.txt');
    await writeCurrentRecord('lint_red', ['tasks/2.md']);

    const item = await readItem();
    assert.equal(item.command, 'osq plan 001');
    assert.deepEqual(item.autoSteer, { outcome: 'lint_red', changed: ['tasks/2.md'] });

    const inbox = await readInbox(root, { config, home });
    assert.ok(formatInboxText(inbox).includes(LINT_RED_ROW), formatInboxText(inbox));

    const dispatch = await readDispatchItems(root, config);
    const halts = dispatch.items.filter((item) => item.kind === 'halt' && item.change.id === '001');
    assert.equal(halts.length, 1);
    assert.deepEqual(halts[0]?.commands, ['osq plan 001', 'osq show 001']);
  });

  it('leaves an item for an earlier trigger on osq plan with no autoSteer', async () => {
    await blockedTask();
    await writeCurrentRecord('ready', ['tasks/2.md']);
    // Rewriting the marker changes the trigger key, so the record is stale.
    await writeMarker(folderPath, path.join('.run', 'dead', '2.md'), `${BLOCKED_MARKER}Changed.\n`);

    const item = await readItem();
    assert.equal(item.command, 'osq plan 001');
    assert.equal('autoSteer' in item, false);

    const step = await readNextStep(root, folderPath, config);
    assert.deepEqual(step, { state: 'dead', command: 'osq plan 001', detail: 'needs steering' });
  });
});
