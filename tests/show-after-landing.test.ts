import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { showCommand } from '../src/cli/show.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { readLastLook } from '../src/core/status/inbox-cursor.js';
import { formatNextStep, readNextStep } from '../src/core/status/next-step.js';
import { formatQueue, prepareQueuePlan, projectQueue } from '../src/core/status/queue.js';
import { formatSpecDetails, getSpecDetails } from '../src/core/status/show.js';
import { formatStatusOverview, getStatusOverview } from '../src/core/status/status.js';

const CONFIG: OsqConfig = DEFAULT_CONFIG;
const CHANGES = path.join('openspec', 'changes');
const ARCHIVE = path.join(CHANGES, 'archive');
const PLACEHOLDER = 'node -e "process.exit(0)"';

function proposalMd(options: {
  title: string;
  verify?: string;
  humanSteps?: string;
}): string {
  const lines = ['---', `title: ${options.title}`];
  lines.push(`verify: ${options.verify ?? 'node verify.cjs'}`);
  lines.push('---', '## Goal', `${options.title} goal.`, '');
  if (options.humanSteps !== undefined) {
    lines.push('## Human steps', options.humanSteps, '');
  }
  return lines.join('\n');
}

async function createActive(
  root: string,
  folderName: string,
  options: { title: string; verify?: string; brief?: boolean; humanSteps?: string },
): Promise<string> {
  const folderPath = path.join(root, CHANGES, folderName);
  await fs.mkdir(folderPath, { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMd(options), 'utf8');
  if (options.brief) {
    await fs.writeFile(path.join(folderPath, 'brief.md'), '# Brief\n', 'utf8');
  }
  return folderPath;
}

async function createArchived(
  root: string,
  folderName: string,
  options: { title: string; humanSteps?: string },
): Promise<string> {
  const folderPath = path.join(root, ARCHIVE, folderName);
  await fs.mkdir(path.join(folderPath, '.run'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMd(options), 'utf8');
  // An approval seal keeps `osq show --json` free of the unapproved digest.
  await fs.writeFile(path.join(folderPath, '.run', 'approved'), 'sha256:abc\n', 'utf8');
  return folderPath;
}

/** Writes the archived change's own `.run/events/change.jsonl` from raw events. */
async function writeEvents(folderPath: string, events: unknown[]): Promise<void> {
  const eventsDir = path.join(folderPath, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  await fs.writeFile(
    path.join(eventsDir, 'change.jsonl'),
    `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
    'utf8',
  );
}

/** An `archived` event, optionally carrying the retired verification key. */
function archivedEvent(verification?: unknown): Record<string, unknown> {
  return {
    type: 'archived',
    timestamp: '2026-09-18T08:00:00.000Z',
    data:
      verification === undefined
        ? { archivePath: 'archive/012' }
        : { archivePath: 'archive/012', verification },
  };
}

function outcomeEvent(outcome: string, note: string | null): Record<string, unknown> {
  return {
    type: 'verification_recorded',
    timestamp: '2026-09-18T09:00:00.000Z',
    data: { outcome, note },
  };
}

function queueContent(items: Array<{ slug: string; title: string; depends?: string }>): string {
  return items
    .map((item) =>
      [
        `## [${item.slug}] ${item.title}`,
        `Depends on: ${item.depends ?? 'nothing'}`,
        '',
        `Brief body for ${item.slug}.`,
        '',
      ].join('\n'),
    )
    .join('\n');
}

function sectionHash(content: string, slug: string): string {
  const marker = `## [${slug}] `;
  const start = content.indexOf(marker);
  assert.ok(start >= 0, `missing queue marker for ${slug}`);
  const next = content.indexOf('## [', start + marker.length);
  const raw = content.slice(start, next === -1 ? content.length : next);
  return `sha256:${createHash('sha256').update(raw, 'utf8').digest('hex')}`;
}

function briefMd(slug: string, hash: string): string {
  return [
    '---',
    `queue_item: ${slug}`,
    `queue_hash: ${hash}`,
    '---',
    `Brief for ${slug}.`,
    '',
  ].join('\n');
}

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-show-after-landing-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('change next step', () => {
  it('Plain archived change', async () => {
    const folderPath = await createArchived(root, '012-plain', { title: 'Plain' });
    await writeEvents(folderPath, [archivedEvent({ afterLanding: true, check: null })]);

    const step = await readNextStep(root, folderPath, CONFIG);
    assert.deepEqual(step, { state: 'landed', command: null, detail: null });
    assert.equal(formatNextStep(step), 'landed');
  });
});

describe('next step detail and format', () => {
  it('Failed verification', async () => {
    const folderPath = await createArchived(root, '012-failed', { title: 'Failed' });
    await writeEvents(folderPath, [
      archivedEvent({ afterLanding: false, check: null }),
      outcomeEvent('failed', 'broke staging'),
    ]);

    const step = await readNextStep(root, folderPath, CONFIG);
    assert.equal(step.state, 'landed');
    assert.equal(step.detail, null);
    assert.equal(formatNextStep(step), 'landed');
  });
});

describe('brief queue state projection', () => {
  it('Verification pending queue dependency', async () => {
    const content = queueContent([
      { slug: 'alpha', title: 'Alpha' },
      { slug: 'beta', title: 'Beta', depends: 'alpha' },
    ]);
    await fs.mkdir(path.join(root, 'openspec'), { recursive: true });
    await fs.writeFile(path.join(root, 'openspec', 'queue.md'), content, 'utf8');
    const alpha = await createArchived(root, '020-alpha', {
      title: 'Alpha',
      humanSteps: '### After landing\nTell support the export moved.',
    });
    await writeEvents(alpha, [archivedEvent({ afterLanding: true, check: null })]);
    await fs.writeFile(
      path.join(alpha, 'brief.md'),
      briefMd('alpha', sectionHash(content, 'alpha')),
      'utf8',
    );

    const projection = await projectQueue(root, CONFIG);
    const alphaRow = projection.items.find((item) => item.slug === 'alpha');
    const betaRow = projection.items.find((item) => item.slug === 'beta');
    assert.equal(alphaRow?.state, 'landed');
    assert.equal(alphaRow?.changeId, '020');
    assert.deepEqual(betaRow?.unmetDependencies, []);
    assert.equal(projection.landedCount, 1);
    assert.ok(formatQueue(projection).includes('alpha: Alpha [landed]'));

    const ready = await prepareQueuePlan(root, CONFIG);
    assert.equal(ready.kind, 'ready');
    if (ready.kind === 'ready') assert.equal(ready.selection.item.slug, 'beta');
  });
});

describe('show next step', () => {
  it('Archived change with an outcome', async () => {
    const folderPath = await createArchived(root, '012-outcome', { title: 'Outcome' });
    await writeEvents(folderPath, [archivedEvent(), outcomeEvent('passed', 'all good')]);

    const details = await getSpecDetails(root, '012', CONFIG);
    assert.deepEqual(details.next, { state: 'landed', command: null, detail: null });

    const text = formatSpecDetails(details);
    assert.ok(text.includes('Next: landed'));
    assert.ok(text.includes('Verification:'));
    assert.ok(
      text.includes('verification_recorded 2026-09-18T09:00:00.000Z: passed (note: all good)'),
    );
    assert.ok(text.indexOf('Status:') < text.indexOf('Next: landed'));
  });

  it('Archive without verification events', async () => {
    const folderPath = await createArchived(root, '012-nover', { title: 'NoVer' });
    await writeEvents(folderPath, [archivedEvent()]);

    const details = await getSpecDetails(root, '012', CONFIG);
    assert.equal(details.verification, undefined);
    assert.ok(!formatSpecDetails(details).includes('Verification:'));

    let captured = '';
    await showCommand('012', {
      cwd: root,
      config: CONFIG,
      json: true,
      stdout: (message) => {
        captured = message;
      },
    });
    const document = JSON.parse(captured) as Record<string, unknown>;
    assert.equal('verification' in document, false);
  });
});

describe('show after-landing notes', () => {
  it('After-landing notes', async () => {
    const folderPath = await createArchived(root, '012-notes', {
      title: 'Notes',
      humanSteps: '### After landing\n- Tell support the export moved.',
    });
    await writeEvents(folderPath, [archivedEvent()]);

    const details = await getSpecDetails(root, '012', CONFIG);
    assert.equal(details.afterLanding, '- Tell support the export moved.');

    const text = formatSpecDetails(details);
    assert.ok(text.includes('After landing:\n  - Tell support the export moved.'), text);
    assert.ok(text.indexOf('Next: landed') < text.indexOf('After landing:'), text);

    let captured = '';
    await showCommand('012', {
      cwd: root,
      config: CONFIG,
      json: true,
      stdout: (message) => {
        captured = message;
      },
    });
    const document = JSON.parse(captured) as { afterLanding?: string };
    assert.equal(document.afterLanding, '- Tell support the export moved.');
  });

  it('places after-landing notes after the verification section', async () => {
    const folderPath = await createArchived(root, '015-both', {
      title: 'Both',
      humanSteps: '### After landing\nTell support the export moved.',
    });
    await writeEvents(folderPath, [archivedEvent(), outcomeEvent('passed', null)]);

    const text = formatSpecDetails(await getSpecDetails(root, '015', CONFIG));
    const next = text.indexOf('Next: landed');
    const verification = text.indexOf('Verification:');
    const after = text.indexOf('After landing:');
    assert.ok(next >= 0 && verification > next && after > verification, text);
    assert.ok(text.includes('After landing:\n  Tell support the export moved.'), text);
  });

  it('prints after-landing notes for an active change and omits them when empty', async () => {
    await createActive(root, '013-active-notes', {
      title: 'Active Notes',
      humanSteps: '### Before approval\nCreate db\n### After landing\nDrop db',
    });
    await createActive(root, '014-no-notes', {
      title: 'No Notes',
      humanSteps: '### Before approval\nCreate db',
    });

    const withNotes = await getSpecDetails(root, '013', CONFIG);
    assert.equal(withNotes.afterLanding, 'Drop db');
    assert.ok(formatSpecDetails(withNotes).includes('After landing:\n  Drop db'));

    const withoutNotes = await getSpecDetails(root, '014', CONFIG);
    assert.equal(withoutNotes.afterLanding, undefined);
    assert.ok(!formatSpecDetails(withoutNotes).includes('After landing:'));
  });
});

describe('explicit status with next steps', () => {
  it('Full status with next steps', async () => {
    await createActive(root, '040-fresh', {
      title: 'Fresh',
      verify: PLACEHOLDER,
      brief: true,
    });
    const archived = await createArchived(root, '041-notes', {
      title: 'Notes',
      humanSteps: '### After landing\nTell support the export moved.',
    });
    await writeEvents(archived, [archivedEvent()]);

    assert.equal(await readLastLook(root), null);
    const overview = await getStatusOverview(root, CONFIG);
    assert.equal(overview.nextSteps?.['040-fresh']?.state, 'unplanned');
    assert.equal(overview.nextSteps?.['040-fresh']?.command, 'osq plan 040');
    assert.equal('pendingVerifications' in overview, false);

    const text = formatStatusOverview(overview);
    assert.ok(text.includes('  next: unplanned — osq plan 040'), text);
    assert.ok(!text.includes('Verification pending:'), text);
    assert.ok(
      text.indexOf('  next: unplanned — osq plan 040') < text.indexOf('Archived specs:'),
      text,
    );
    assert.equal(await readLastLook(root), null);
  });
});
