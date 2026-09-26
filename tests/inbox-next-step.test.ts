import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { needsYouKindLabel } from '../packages/ui/src/home/labels.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { readInbox } from '../src/core/status/inbox-projection.js';
import { type Inbox, formatInboxText, projectNeedsYou } from '../src/core/status/inbox.js';
import { getStatusOverview } from '../src/core/status/status.js';

interface ChangeOptions {
  readonly verify?: string;
  readonly beforeApproval?: string;
  readonly brief?: string;
}

function proposalMd(title: string, options: ChangeOptions = {}): string {
  const lines = ['---', `title: ${title}`, 'depends_on: []'];
  if (options.verify) lines.push(`verify: ${options.verify}`);
  lines.push('---', '## Goal', `${title} goal.`);
  if (options.beforeApproval) {
    lines.push('', '## Human steps', '### Before approval', options.beforeApproval);
  }
  lines.push('');
  return lines.join('\n');
}

async function createChange(
  root: string,
  folderName: string,
  title: string,
  options: ChangeOptions = {},
): Promise<string> {
  const dir = path.join(root, 'openspec', 'changes', folderName);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(title, options), 'utf8');
  if (options.brief) await fs.writeFile(path.join(dir, 'brief.md'), options.brief, 'utf8');
  return dir;
}

async function createArchived(
  root: string,
  folderName: string,
  title: string,
  verification?: { afterLanding: boolean; check: string | null },
  outcome?: 'passed' | 'failed',
): Promise<string> {
  const dir = path.join(root, 'openspec', 'changes', 'archive', folderName);
  await fs.mkdir(path.join(dir, '.run', 'events'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(title), 'utf8');
  const data = verification ? { archivePath: dir, verification } : { archivePath: dir };
  const events = [
    JSON.stringify({ type: 'archived', timestamp: '2026-01-01T00:00:01.000Z', data }),
  ];
  if (outcome) {
    events.push(
      JSON.stringify({
        type: 'verification_recorded',
        timestamp: '2026-01-02T00:00:01.000Z',
        data: { outcome, note: null },
      }),
    );
  }
  await fs.writeFile(
    path.join(dir, '.run', 'events', 'change.jsonl'),
    `${events.join('\n')}\n`,
    'utf8',
  );
  return dir;
}

let project: string;
let home: string;

beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-next-step-'));
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-next-step-home-'));
});

afterEach(async () => {
  await fs.rm(project, { recursive: true, force: true });
  await fs.rm(home, { recursive: true, force: true });
});

async function snapshotInbox(root: string): Promise<Inbox> {
  const inbox = await readInbox(root, { config: DEFAULT_CONFIG, home });
  return JSON.parse(JSON.stringify(inbox)) as Inbox;
}

describe('planning inbox items', () => {
  it('lists a fresh template as planning with osq lint and no approve command', async () => {
    await createChange(project, '001-template', 'Template change');

    const inbox = await snapshotInbox(project);
    assert.deepEqual(
      inbox.needsYou.map((item) => item.kind),
      ['planning'],
    );
    assert.deepEqual(Object.keys(inbox.needsYou[0]), ['kind', 'change', 'task', 'command']);
    assert.deepEqual(inbox.needsYou[0].change, { id: '001', title: 'Template change' });
    assert.equal(inbox.needsYou[0].task, null);
    assert.equal(inbox.needsYou[0].command, 'osq lint 001');

    const text = formatInboxText(await readInbox(project, { config: DEFAULT_CONFIG, home }));
    assert.ok(text.includes('  001: Template change — unplanned — osq lint 001'));
    assert.ok(!text.includes('osq approve 001'));
  });

  it('names the plan command for an unplanned change carrying a brief', async () => {
    await createChange(project, '002-briefed', 'Briefed change', { brief: 'Do the work.' });

    const inbox = await snapshotInbox(project);
    assert.equal(inbox.needsYou[0].kind, 'planning');
    assert.equal(inbox.needsYou[0].command, 'osq plan 002');
  });

  it('keeps the approval item when a change is missing from nextSteps', async () => {
    await createChange(project, '003-template', 'Template change');
    const overview = await getStatusOverview(project, DEFAULT_CONFIG);

    const items = projectNeedsYou({ ...overview, nextSteps: undefined });
    assert.equal(items[0].kind, 'approval');
    assert.equal(items[0].command, 'osq approve 003');
    assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(items[0]))), [
      'kind',
      'change',
      'task',
      'command',
    ]);
  });
});

describe('steps before approval', () => {
  it('flags an approval item whose change has before-approval steps', async () => {
    await createChange(project, '004-steps', 'Steps change', {
      verify: 'node check.cjs',
      beforeApproval: 'Create the test database',
    });

    const inbox = await snapshotInbox(project);
    assert.deepEqual(
      inbox.needsYou.map((item) => item.kind),
      ['approval'],
    );
    assert.deepEqual(Object.keys(inbox.needsYou[0]), [
      'kind',
      'change',
      'task',
      'command',
      'beforeApproval',
    ]);
    assert.equal(inbox.needsYou[0].beforeApproval, true);
    assert.equal(inbox.needsYou[0].command, 'osq approve 004');

    const text = formatInboxText(await readInbox(project, { config: DEFAULT_CONFIG, home }));
    assert.ok(
      text.includes('  004: Steps change — do the steps before approval first — osq approve 004'),
    );
  });

  it('omits the field on an approval item without before-approval steps', async () => {
    await createChange(project, '005-plain', 'Plain change', { verify: 'node check.cjs' });

    const inbox = await snapshotInbox(project);
    assert.deepEqual(Object.keys(inbox.needsYou[0]), ['kind', 'change', 'task', 'command']);
    assert.equal('beforeApproval' in inbox.needsYou[0], false);
    assert.equal(inbox.needsYou[0].command, 'osq approve 005');
  });
});

describe('verification inbox items', () => {
  it('lists pending and failed archived changes after the active items', async () => {
    await createChange(project, '001-template', 'Template change');
    await createArchived(project, '010-pending', 'Pending change', {
      afterLanding: true,
      check: null,
    });
    await createArchived(
      project,
      '011-failed',
      'Failed change',
      { afterLanding: true, check: null },
      'failed',
    );

    const inbox = await snapshotInbox(project);
    assert.deepEqual(
      inbox.needsYou.map((item) => item.kind),
      ['planning', 'verification-pending', 'verification-failed'],
    );
    assert.deepEqual(
      inbox.needsYou.map((item) => item.change.id),
      ['001', '010', '011'],
    );
    for (const item of inbox.needsYou.slice(1)) {
      assert.equal(item.task, null);
      assert.deepEqual(Object.keys(item), ['kind', 'change', 'task', 'command']);
    }
    assert.equal(inbox.needsYou[1].change.title, 'Pending change');
    assert.equal(inbox.needsYou[1].command, 'osq verified 010 --passed|--failed');
    assert.equal(inbox.needsYou[2].command, 'osq verified 011 --passed|--failed');

    const text = formatInboxText(await readInbox(project, { config: DEFAULT_CONFIG, home }));
    assert.ok(
      text.includes(
        '  010: Pending change — verification pending — osq verified 010 --passed|--failed',
      ),
    );
    assert.ok(
      text.includes(
        '  011: Failed change — verification failed — osq verified 011 --passed|--failed',
      ),
    );
  });

  it('adds no verification item for a passed or unrequired archive', async () => {
    await createArchived(
      project,
      '012-passed',
      'Passed change',
      { afterLanding: true, check: null },
      'passed',
    );
    await createArchived(project, '013-plain', 'Plain archive');

    const inbox = await snapshotInbox(project);
    assert.deepEqual(inbox.needsYou, []);
  });
});

describe('planning label', () => {
  it('labels the new needs-you kinds', () => {
    assert.equal(needsYouKindLabel('planning'), 'needs planning');
    assert.equal(needsYouKindLabel('verification-pending'), 'verification pending');
    assert.equal(needsYouKindLabel('verification-failed'), 'verification failed');
    assert.equal(needsYouKindLabel('approval'), 'awaiting approval');
  });
});
