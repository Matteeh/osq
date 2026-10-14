import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { formatPlanPasteBlock } from '../src/core/foundation/plan-handoff.js';
import { steeringKey, writeAutoSteerRecord } from '../src/core/run/auto-steer-record.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { deriveSpecState } from '../src/core/status/state.js';
import { getWebChange } from '../src/core/web/web-data.js';
import { buildWebFixture } from './fixtures/web/build.js';
import { installFakeValidator } from './helpers.js';

const CHANGES = path.join('openspec', 'changes');
const PLACEHOLDER = 'node -e "process.exit(0)"';

const roots: string[] = [];

async function tempRoot(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function write(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
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

const UNPLANNED_PROPOSAL = [
  '---',
  'title: Demo Change',
  'depends_on: []',
  `verify: ${PLACEHOLDER}`,
  '---',
  '## Goal',
  '',
  'Demo goal.',
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

/** A scaffolded project with an unplanned, briefed change `001-demo`. */
async function buildUnplannedChange(root: string): Promise<string> {
  await scaffoldProject(root);
  const folder = path.join(root, CHANGES, '001-demo');
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await write(root, path.join(CHANGES, '001-demo', 'proposal.md'), UNPLANNED_PROPOSAL);
  await write(root, path.join(CHANGES, '001-demo', 'tasks.md'), '# Tasks\n\n- [ ] 1. Demo task\n');
  await write(root, path.join(CHANGES, '001-demo', 'tasks', '1.md'), taskMd('Demo task'));
  await write(root, path.join(CHANGES, '001-demo', 'brief.md'), '---\n---\n\nDemo brief.\n');
  return folder;
}

const AUTO_STEER_PROPOSAL = [
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

const BLOCKED_MARKER = '---\nreason: blocked\n---\nNeeds a plan revision.\n';

/** The approved, blocked change of `tests/auto-steer-inbox.test.ts`. */
async function buildBlockedChange(
  root: string,
): Promise<{ folderPath: string; config: ReturnType<typeof defineConfig> }> {
  await installFakeValidator(root);
  await scaffoldProject(root);
  await write(root, 'verify.cjs', 'process.exit(0);\n');
  const folderPath = path.join(root, CHANGES, '001-order-flow');
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await write(root, path.join(CHANGES, '001-order-flow', 'proposal.md'), AUTO_STEER_PROPOSAL);
  await write(
    root,
    path.join(CHANGES, '001-order-flow', 'tasks.md'),
    '# Tasks\n\n- [ ] 1. First task\n- [ ] 2. Second task\n',
  );
  await write(root, path.join(CHANGES, '001-order-flow', 'tasks', '1.md'), taskMd('First task'));
  await write(root, path.join(CHANGES, '001-order-flow', 'tasks', '2.md'), taskMd('Second task'));
  const config = defineConfig({});
  await approveSpec(root, '001', config, { planningReaders: [] });
  await write(root, path.join(CHANGES, '001-order-flow', '.run', 'dead', '2.md'), BLOCKED_MARKER);
  const state = await deriveSpecState(root, folderPath);
  assert.ok(state.approvedHash, 'the change is approved');
  assert.ok((state.steering?.length ?? 0) > 0, 'the change needs steering');
  const key = await steeringKey(folderPath, state.approvedHash, state.steering ?? []);
  await writeAutoSteerRecord(folderPath, {
    key,
    outcome: 'ready',
    changed: ['tasks/2.md'],
    at: '2026-10-13T00:00:00.000Z',
  });
  return { folderPath, config };
}

describe('Change documents carry the next step', () => {
  it('reads an unplanned change whose prompt file is missing', async () => {
    const root = await tempRoot('osq-web-next-unplanned-');
    const folderPath = await buildUnplannedChange(root);

    const change = await getWebChange(root, '001-demo', DEFAULT_CONFIG);

    assert.deepEqual(change.nextStep, {
      state: 'unplanned',
      command: 'osq plan 001',
      detail: null,
    });
    assert.deepEqual(change.planHandoff, {
      text: formatPlanPasteBlock(folderPath),
      promptReady: false,
    });
    assert.equal(change.autoSteer, null);
  });

  it('reads the same change once its prompt file exists', async () => {
    const root = await tempRoot('osq-web-next-prompt-');
    const folderPath = await buildUnplannedChange(root);
    await write(root, path.join(CHANGES, '001-demo', 'plan-prompt.md'), 'You plan this.\n');

    const change = await getWebChange(root, '001-demo', DEFAULT_CONFIG);

    assert.deepEqual(change.nextStep, {
      state: 'unplanned',
      command: 'osq plan 001',
      detail: null,
    });
    assert.equal(change.planHandoff?.text, formatPlanPasteBlock(folderPath));
    assert.equal(change.planHandoff?.promptReady, true);
    assert.equal(change.autoSteer, null);
  });

  it('reads the revised plan of an approved, blocked change', async () => {
    const root = await tempRoot('osq-web-next-revised-');
    const { folderPath, config } = await buildBlockedChange(root);

    const change = await getWebChange(root, '001-order-flow', config);

    assert.deepEqual(change.nextStep, {
      state: 'dead',
      command: 'osq approve 001',
      detail: 'revised plan ready',
    });
    assert.equal(change.planHandoff?.text, formatPlanPasteBlock(folderPath));
    assert.deepEqual(change.autoSteer, { outcome: 'ready', changed: ['tasks/2.md'] });
  });

  it('reads an archived change as landed', async () => {
    const root = await tempRoot('osq-web-next-archived-');
    await buildWebFixture(root);
    const folderPath = path.join(root, CHANGES, 'archive', '002-archived-change');

    const change = await getWebChange(root, '002-archived-change', DEFAULT_CONFIG);

    assert.deepEqual(change.nextStep, { state: 'landed', command: null, detail: null });
    assert.equal(change.planHandoff?.text, formatPlanPasteBlock(folderPath));
    assert.equal(change.autoSteer, null);
  });

  it('reads a rejected change with no next step or hand-off', async () => {
    const root = await tempRoot('osq-web-next-rejected-');
    await buildWebFixture(root);

    const change = await getWebChange(root, '002-rejected-change', DEFAULT_CONFIG);

    assert.equal(change.nextStep, null);
    assert.equal(change.planHandoff, null);
    assert.equal(change.autoSteer, null);
  });
});
