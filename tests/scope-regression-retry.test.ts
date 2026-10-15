import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import type { StaleTaskAudit } from '../src/core/run/scope-hash.js';
import { buildScopeRegressionMarker } from '../src/core/run/scope-regression-marker.js';
import { readDispatchItems } from '../src/core/status/dispatch-items.js';
import { readInbox } from '../src/core/status/inbox-projection.js';
import { readNextStep } from '../src/core/status/next-step.js';
import { deriveSpecState, readChangeFolder } from '../src/core/status/state.js';
import { deriveSteering } from '../src/core/status/steering.js';

const CHANGES = path.join('openspec', 'changes');
const FOLDER = '007-pricing';

function proposalMd(): string {
  return ['---', 'title: Pricing', 'depends_on: []', '---', '## Goal', 'Prove retry.', ''].join(
    '\n',
  );
}

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

/** One task's scope regression marker, as the audit writes it. */
function scopeRegressionMarker(verificationPassed: boolean): string {
  const input: Omit<StaleTaskAudit, 'alreadyActive'> = {
    taskNumber: '3',
    differingPaths: ['src/one.txt (modified)'],
    attribution: [{ path: 'src/one.txt (modified)', attribution: '2' }],
    recordedHash: 'sha256:recorded',
    currentHash: 'sha256:current',
    verifyCommand: 'node verify.cjs',
    exitCode: verificationPassed ? 0 : 1,
    duration: 12,
    output: verificationPassed ? 'ok' : 'boom',
    timedOut: false,
    verificationPassed,
  };
  return buildScopeRegressionMarker(input);
}

async function writeMarker(dir: string, rel: string, content: string): Promise<void> {
  const target = path.join(dir, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** An approved change 007 whose task 3 has the given scope regression marker. */
async function createChange(root: string, verificationPassed: boolean): Promise<string> {
  const dir = path.join(root, CHANGES, FOLDER);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(), 'utf8');
  await fs.writeFile(path.join(dir, 'tasks', '1.md'), taskMd('First task'), 'utf8');
  await fs.writeFile(path.join(dir, 'tasks', '2.md'), taskMd('Second task'), 'utf8');
  await fs.writeFile(path.join(dir, 'tasks', '3.md'), taskMd('Third task'), 'utf8');
  await writeMarker(dir, path.join('.run', 'approved'), 'sha256:fixture\n');
  await writeMarker(
    dir,
    path.join('.run', 'regressed', '3.md'),
    scopeRegressionMarker(verificationPassed),
  );
  return dir;
}

let project: string;
let home: string;

beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-scope-retry-'));
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-scope-retry-home-'));
});

afterEach(async () => {
  await fs.rm(project, { recursive: true, force: true });
  await fs.rm(home, { recursive: true, force: true });
});

describe('Steering triggers', () => {
  it('Passing scope regression: no trigger and no steering on the derived state', async () => {
    const dir = await createChange(project, true);
    const snapshot = await readChangeFolder(project, dir);

    assert.deepEqual(deriveSteering(snapshot), []);
    assert.ok(!('steering' in deriveSpecState(snapshot)));
  });

  it('Failing scope regression: a regression trigger for task 3', async () => {
    const dir = await createChange(project, false);
    const snapshot = await readChangeFolder(project, dir);

    assert.deepEqual(deriveSteering(snapshot), [
      { target: '3', trigger: 'regression', reason: 'scope_regression' },
    ]);
    assert.deepEqual(deriveSpecState(snapshot).steering, [
      { target: '3', trigger: 'regression', reason: 'scope_regression' },
    ]);
  });
});

describe('Passing scope regression next step', () => {
  it('offers osq retry in the next step, the inbox and the dispatch items', async () => {
    const dir = await createChange(project, true);

    const step = await readNextStep(project, dir, DEFAULT_CONFIG);
    assert.deepEqual(step, { state: 'dead', command: 'osq retry 007 3', detail: null });

    const inbox = await readInbox(project, { config: DEFAULT_CONFIG, home });
    const items = inbox.needsYou.filter((item) => item.change.id === '007');
    assert.equal(items.length, 1);
    assert.equal(items[0]?.kind, 'task-regressed');
    assert.equal(items[0]?.task?.number, '3');
    assert.equal(items[0]?.command, 'osq retry 007 3');
    assert.equal('steering' in (items[0] as object), false);

    const dispatch = await readDispatchItems(project, DEFAULT_CONFIG);
    const halts = dispatch.items.filter((item) => item.change.id === '007');
    assert.equal(halts.length, 1);
    assert.equal(halts[0]?.kind, 'halt');
    assert.equal(halts[0]?.task?.number, '3');
    assert.deepEqual(halts[0]?.commands, ['osq retry 007 3', 'osq show 007']);
    assert.equal('steering' in (halts[0] as object), false);
  });
});
