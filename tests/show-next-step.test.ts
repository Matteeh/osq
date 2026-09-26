import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { showCommand } from '../src/cli/show.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { formatNextStep } from '../src/core/status/next-step.js';
import { formatSpecDetails, getSpecDetails } from '../src/core/status/show.js';

const CHANGES_DIR = path.join('openspec', 'changes');
const PLACEHOLDER_VERIFY = 'node -e "process.exit(0)"';

function proposalMd(title: string, verify = 'node verify.cjs'): string {
  return `---
title: ${title}
depends_on: []
verify: ${verify}
features:
  reads: []
---
## Goal

${title} goal.

## Contract

| Cmd | Output |
|---|---|
| osq test | ok |

## Non-goals

- none

## Delta

none
`;
}

function taskMd(title: string): string {
  return `---
title: ${title}
verify: node verify.cjs
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] ${title} acceptance
`;
}

async function createActiveChange(root: string, folderName: string, title: string, verify: string) {
  const folderPath = path.join(root, CHANGES_DIR, folderName);
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMd(title, verify), 'utf8');
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), taskMd(title), 'utf8');
  return folderPath;
}

async function createArchivedChange(root: string, folderName: string, title: string) {
  const folderPath = path.join(root, CHANGES_DIR, 'archive', folderName);
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.mkdir(path.join(folderPath, '.run'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMd(title), 'utf8');
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), taskMd(title), 'utf8');
  // An approval seal keeps `osq show --json` free of the unapproved digest.
  await fs.writeFile(path.join(folderPath, '.run', 'approved'), 'sha256:abc\n', 'utf8');
  return folderPath;
}

/** Writes the archived change's own `.run/events/change.jsonl` from raw events. */
async function writeChangeEvents(folderPath: string, events: unknown[]) {
  const eventsDir = path.join(folderPath, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  await fs.writeFile(
    path.join(eventsDir, 'change.jsonl'),
    `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
    'utf8',
  );
}

function archivedEvent(verification?: unknown): unknown {
  return {
    type: 'archived',
    timestamp: '2026-09-18T08:00:00.000Z',
    data:
      verification === undefined
        ? { archivePath: 'archive/012' }
        : { archivePath: 'archive/012', verification },
  };
}

describe('osq show next step and verification', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-show-next-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('prints Next: landed and the outcome for an archived change that passed', async () => {
    const folderPath = await createArchivedChange(root, '012-archived-passed', 'Archived Passed');
    await writeChangeEvents(folderPath, [
      archivedEvent({ afterLanding: true, check: null }),
      {
        type: 'verification_recorded',
        timestamp: '2026-09-18T09:00:00.000Z',
        data: { outcome: 'passed', note: 'all good' },
      },
    ]);

    const details = await getSpecDetails(root, '012', DEFAULT_CONFIG);
    assert.ok(details.next);
    assert.equal(details.next.state, 'landed');
    assert.equal(details.next.command, null);
    assert.equal(details.next.detail, null);

    const text = formatSpecDetails(details);
    assert.ok(text.includes('Next: landed'));
    assert.ok(text.includes('Verification:'));
    assert.ok(
      text.includes('verification_recorded 2026-09-18T09:00:00.000Z: passed (note: all good)'),
    );
    assert.ok(text.indexOf('Status:') < text.indexOf('Next: landed'));
  });

  it('prints a failed outcome as verification pending with the failing detail', async () => {
    const folderPath = await createArchivedChange(root, '012-archived-failed', 'Archived Failed');
    await writeChangeEvents(folderPath, [
      archivedEvent({ afterLanding: true, check: null }),
      {
        type: 'verification_recorded',
        timestamp: '2026-09-18T09:30:00.000Z',
        data: { outcome: 'failed', note: 'broke staging' },
      },
    ]);

    const details = await getSpecDetails(root, '012', DEFAULT_CONFIG);
    assert.ok(details.next);
    assert.equal(details.next.state, 'verification-pending');
    assert.equal(details.next.detail, 'failed');
    assert.equal(details.next.command, 'osq verified 012 --passed|--failed');

    const text = formatSpecDetails(details);
    assert.equal(
      formatNextStep(details.next),
      'verification pending (failed) \u2014 osq verified 012 --passed|--failed',
    );
    assert.ok(
      text.includes(
        'Next: verification pending (failed) \u2014 osq verified 012 --passed|--failed',
      ),
    );
    assert.ok(
      text.includes('verification_recorded 2026-09-18T09:30:00.000Z: failed (note: broke staging)'),
    );
  });

  it('prints each check_ran row and moves the command after a check runs', async () => {
    const folderPath = await createArchivedChange(root, '013-archived-check', 'Archived Check');
    await writeChangeEvents(folderPath, [
      archivedEvent({ afterLanding: false, check: 'node check.cjs' }),
    ]);

    const before = await getSpecDetails(root, '013', DEFAULT_CONFIG);
    assert.ok(before.next);
    assert.equal(before.next.state, 'verification-pending');
    assert.equal(before.next.command, 'osq check 013');
    assert.ok(
      formatSpecDetails(before).includes('Next: verification pending \u2014 osq check 013'),
    );

    await fs.appendFile(
      path.join(folderPath, '.run', 'events', 'change.jsonl'),
      `${JSON.stringify({
        type: 'check_ran',
        timestamp: '2026-09-18T10:00:00.000Z',
        data: {
          command: 'node check.cjs',
          exitCode: 1,
          duration: 12,
          timedOut: false,
          output: 'boom',
        },
      })}\n`,
      'utf8',
    );

    const after = await getSpecDetails(root, '013', DEFAULT_CONFIG);
    assert.ok(after.next);
    assert.equal(after.next.command, 'osq verified 013 --passed|--failed');
    const text = formatSpecDetails(after);
    assert.ok(text.includes('check_ran 2026-09-18T10:00:00.000Z: node check.cjs (exit 1)'));
  });

  it('prints the next step for an active unplanned change', async () => {
    await createActiveChange(root, '014-active-unplanned', 'Active Unplanned', PLACEHOLDER_VERIFY);

    const details = await getSpecDetails(root, '014', DEFAULT_CONFIG);
    assert.ok(details.next);
    assert.equal(details.next.state, 'unplanned');
    assert.equal(details.next.command, 'osq lint 014');
    assert.ok(formatSpecDetails(details).includes('Next: unplanned \u2014 osq lint 014'));
  });

  it('omits the next step for a rejected change', async () => {
    const folderPath = path.join(root, CHANGES_DIR, 'rejected', '015-rejected-thing');
    await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMd('Rejected Thing'), 'utf8');
    await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), taskMd('Rejected Task'), 'utf8');

    const details = await getSpecDetails(root, '015', DEFAULT_CONFIG);
    assert.equal(details.next, undefined);
    assert.equal(formatSpecDetails(details).includes('Next:'), false);
  });

  it('carries next in the --json document for an archived change', async () => {
    const folderPath = await createArchivedChange(root, '012-archived-passed', 'Archived Passed');
    await writeChangeEvents(folderPath, [
      archivedEvent({ afterLanding: true, check: null }),
      {
        type: 'verification_recorded',
        timestamp: '2026-09-18T09:00:00.000Z',
        data: { outcome: 'passed', note: null },
      },
    ]);

    let captured = '';
    await showCommand('012', {
      cwd: root,
      config: DEFAULT_CONFIG,
      json: true,
      stdout: (message) => {
        captured = message;
      },
    });

    const document = JSON.parse(captured) as {
      next?: { state: string; command: string | null; detail: string | null };
      verification?: { outcomes: unknown[] };
    };
    assert.deepEqual(document.next, { state: 'landed', command: null, detail: null });
    assert.equal(document.verification?.outcomes.length, 1);

    const active = await getSpecDetails(root, '012', DEFAULT_CONFIG);
    const text = formatSpecDetails(active);
    assert.ok(text.includes('Next: landed'));
  });
});
