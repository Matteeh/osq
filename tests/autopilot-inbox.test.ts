import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { needsYouKindLabel } from '../packages/ui/src/home/labels.js';
import { statusCommand } from '../src/cli/status.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { type AutopilotStop, writeAutopilotStop } from '../src/core/status/autopilot-stop.js';
import { readInbox } from '../src/core/status/inbox-projection.js';
import { type Inbox, formatInboxText } from '../src/core/status/inbox.js';

const OPENSPEC = 'openspec';
const CHANGES = path.join(OPENSPEC, 'changes');
const ARCHIVE = path.join(CHANGES, 'archive');
const AT = '2026-10-17T00:00:00.000Z';

let project: string;
let home: string;
let config: OsqConfig;

beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-autopilot-inbox-'));
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-autopilot-inbox-home-'));
  config = DEFAULT_CONFIG;
});

afterEach(async () => {
  await fs.rm(project, { recursive: true, force: true });
  await fs.rm(home, { recursive: true, force: true });
});

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

/** An archived change folder that adds no other inbox item. */
async function writeArchivedChange(folder: string, title: string): Promise<void> {
  await writeAt(project, path.join(ARCHIVE, folder, 'proposal.md'), proposalMd(title));
  await writeAt(project, path.join(ARCHIVE, folder, 'tasks', '1.md'), '# Task\n');
}

async function writeQueue(items: Array<{ slug: string; title: string }>): Promise<void> {
  const content = items
    .map((item) =>
      [
        `## [${item.slug}] ${item.title}`,
        'Depends on: nothing',
        '',
        `Brief for ${item.slug}.`,
        '',
      ].join('\n'),
    )
    .join('\n');
  await writeAt(project, path.join(OPENSPEC, 'queue.md'), content);
}

async function writeStop(stop: AutopilotStop): Promise<void> {
  await writeAutopilotStop(project, config, stop);
}

function stoppedItems(inbox: Inbox): Inbox['needsYou'] {
  return inbox.needsYou.filter((item) => item.kind === 'autopilot-stopped');
}

async function readProjectInbox(): Promise<Inbox> {
  return readInbox(project, { config, home });
}

function textLines(inbox: Inbox): string[] {
  return formatInboxText(inbox).split('\n');
}

async function runStatus(): Promise<string> {
  return statusCommand({ cwd: project, config, home, stdout: () => {}, stderr: () => {} });
}

function lastLine(text: string): string {
  return text.trimEnd().split('\n').at(-1) ?? '';
}

// --- Inbox scenarios --------------------------------------------------------

describe('autopilot stop in the inbox', () => {
  it('Stop with a change in the inbox', async () => {
    await writeArchivedChange('003-orders', 'Orders');
    await writeStop({
      reason: 'halted',
      item: 'orders',
      change: '003',
      command: 'osq retry 003 1',
      at: AT,
      detail: 'task 1 dead',
    });

    const inbox = await readProjectInbox();
    assert.deepEqual(stoppedItems(inbox), [
      {
        kind: 'autopilot-stopped',
        change: { id: '003', title: 'Orders' },
        task: null,
        command: 'osq retry 003 1',
        autopilotStopped: {
          reason: 'halted',
          item: 'orders',
          change: '003',
          detail: 'task 1 dead',
        },
      },
    ]);
    assert.ok(
      textLines(inbox).includes(
        '  003: Orders — autopilot stopped: halted: task 1 dead — osq retry 003 1',
      ),
      formatInboxText(inbox),
    );
  });

  it('Stop before a change in the inbox', async () => {
    await writeQueue([{ slug: 'orders', title: 'Orders are totalled' }]);
    await writeStop({
      reason: 'not_approved',
      item: 'orders',
      command: 'osq queue approve',
      at: AT,
    });

    const inbox = await readProjectInbox();
    const item = stoppedItems(inbox)[0];
    assert.ok(item, 'the inbox must hold an autopilot-stopped item');
    assert.deepEqual(item.change, { id: 'orders', title: 'Orders are totalled' });
    assert.equal(item.autopilotStopped?.change, null);
    assert.ok(
      textLines(inbox).includes(
        '  orders: Orders are totalled — autopilot stopped: not_approved — osq queue approve',
      ),
      formatInboxText(inbox),
    );
  });

  it('No stop in the inbox', async () => {
    await writeArchivedChange('001-plain', 'Plain');
    assert.deepEqual(stoppedItems(await readProjectInbox()), []);
  });
});

// --- Status scenario --------------------------------------------------------

describe('autopilot stop in status', () => {
  it('Stop in status', async () => {
    const rows = [
      {
        stop: {
          reason: 'land_stopped' as const,
          item: 'orders',
          change: '003',
          command: 'osq land 003',
          at: AT,
        },
        last: 'Autopilot stopped at orders (change 003): land_stopped — osq land 003',
      },
      {
        stop: {
          reason: 'not_approved' as const,
          item: 'orders',
          command: 'osq queue approve',
          at: AT,
        },
        last: 'Autopilot stopped at orders: not_approved — osq queue approve',
      },
    ];

    for (const row of rows) {
      await writeStop(row.stop);
      assert.equal(lastLine(await runStatus()), row.last);
    }
  });
});

// --- Labels -----------------------------------------------------------------

describe('autopilot stopped label', () => {
  it('labels the kind `autopilot stopped`', () => {
    assert.equal(needsYouKindLabel('autopilot-stopped'), 'autopilot stopped');
  });
});
