import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { parseHumanSteps, readCheckCommand } from '../src/core/spec/human-steps.js';
import { readLastLook } from '../src/core/status/inbox-cursor.js';
import { formatNextStep, readNextStep } from '../src/core/status/next-step.js';
import { formatStatusOverview, getStatusOverview } from '../src/core/status/status.js';
import { listPendingVerifications, readVerification } from '../src/core/status/verification.js';

const CONFIG: OsqConfig = DEFAULT_CONFIG;
const PLACEHOLDER = 'node -e "process.exit(0)"';

function proposalMd(options: {
  title: string;
  verify?: string;
  check?: string;
  dependsOn?: string[];
  humanSteps?: string;
}): string {
  const lines = ['---', `title: ${options.title}`];
  lines.push(`verify: ${options.verify ?? 'node verify.cjs'}`);
  if (options.check !== undefined) lines.push(`check: ${options.check}`);
  if (options.dependsOn?.length) {
    lines.push(`depends_on: [${options.dependsOn.map((id) => `"${id}"`).join(', ')}]`);
  }
  lines.push('---', '## Goal', `${options.title} goal.`, '');
  if (options.humanSteps !== undefined) {
    lines.push('## Human steps', options.humanSteps, '');
  }
  return lines.join('\n');
}

function taskMd(title: string, verify = 'node task.cjs'): string {
  return [
    '---',
    `title: ${title}`,
    `verify: ${verify}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    `- [ ] ${title} criterion`,
    '',
  ].join('\n');
}

async function writeMarker(folderPath: string, rel: string, content: string): Promise<void> {
  const target = path.join(folderPath, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

async function writeApproved(folderPath: string): Promise<void> {
  await writeMarker(folderPath, path.join('.run', 'approved'), 'sha256:fixture\n');
}

interface ActiveOptions {
  title: string;
  verify?: string;
  brief?: boolean;
  approved?: boolean;
  dead?: boolean;
  regressedChange?: boolean;
  dependsOn?: string[];
  humanSteps?: string;
}

async function createActive(
  root: string,
  folderName: string,
  options: ActiveOptions,
): Promise<string> {
  const dir = path.join(root, 'openspec', 'changes', folderName);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(options), 'utf8');
  await fs.writeFile(path.join(dir, 'tasks', '1.md'), taskMd('Task one'), 'utf8');
  if (options.brief) await fs.writeFile(path.join(dir, 'brief.md'), '# Brief\n', 'utf8');
  if (options.approved) await writeApproved(dir);
  if (options.dead) {
    await writeMarker(dir, path.join('.run', 'dead', '1.md'), '---\nreason: verify_red\n---\n');
  }
  if (options.regressedChange) {
    await writeMarker(
      dir,
      path.join('.run', 'regressed', 'change.md'),
      '---\nreason: verify_red\n---\n',
    );
  }
  return dir;
}

interface ArchivedOptions {
  title: string;
  verification?: { afterLanding: boolean; check: string | null };
  extraEvents?: Array<Record<string, unknown>>;
  rawStream?: string;
}

function archivedStream(dir: string, options: ArchivedOptions): string {
  const events: Array<Record<string, unknown>> = [
    {
      type: 'archived',
      timestamp: '2026-01-01T00:00:00.000Z',
      data: options.verification
        ? { archivePath: dir, verification: options.verification }
        : { archivePath: dir },
    },
    ...(options.extraEvents ?? []),
  ];
  return `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
}

async function createArchived(
  root: string,
  folderName: string,
  options: ArchivedOptions,
): Promise<string> {
  const dir = path.join(root, 'openspec', 'changes', 'archive', folderName);
  await fs.mkdir(path.join(dir, '.run', 'events'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd({ title: options.title }), 'utf8');
  const stream = options.rawStream ?? archivedStream(dir, options);
  await fs.writeFile(path.join(dir, '.run', 'events', 'change.jsonl'), stream, 'utf8');
  return dir;
}

function archiveDir(root: string): string {
  return path.join(root, 'openspec', 'changes', 'archive');
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-next-step-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('parseHumanSteps', () => {
  it('splits the before approval and after landing subsections', () => {
    const body = [
      '## Goal',
      'g',
      '',
      '## Human steps',
      '### Before approval',
      'Create the test database',
      '### After landing',
      'Delete the test database',
      '',
    ].join('\n');
    assert.deepEqual(parseHumanSteps(body), {
      beforeApproval: 'Create the test database',
      afterLanding: 'Delete the test database',
    });
  });

  it('treats a section without subsections as after landing', () => {
    assert.deepEqual(parseHumanSteps('## Human steps\nRun the migration\n'), {
      beforeApproval: '',
      afterLanding: 'Run the migration',
    });
  });

  it('treats a None section as empty', () => {
    assert.deepEqual(parseHumanSteps('## Human steps\nNone\n'), {
      beforeApproval: '',
      afterLanding: '',
    });
  });

  it('treats text before the first subsection as after landing', () => {
    assert.deepEqual(
      parseHumanSteps('## Human steps\nSome preamble\n### Before approval\nDo this\n'),
      { beforeApproval: 'Do this', afterLanding: 'Some preamble' },
    );
  });

  it('matches subsection headings in any case', () => {
    assert.deepEqual(
      parseHumanSteps('## Human steps\n### BEFORE APPROVAL\nDo this\n### After Landing\nThat\n'),
      { beforeApproval: 'Do this', afterLanding: 'That' },
    );
  });
});

describe('readCheckCommand', () => {
  it('returns the trimmed frontmatter check command', () => {
    assert.equal(readCheckCommand({ check: '  node check.cjs  ' }), 'node check.cjs');
  });

  it('returns null when the check is absent, empty, or not a string', () => {
    assert.equal(readCheckCommand({}), null);
    assert.equal(readCheckCommand({ check: '   ' }), null);
    assert.equal(readCheckCommand({ check: 3 }), null);
  });
});

describe('readNextStep for active changes', () => {
  it('names a fresh template unplanned with the planning command', async () => {
    const dir = await createActive(tmpDir, '001-fresh', {
      title: 'Fresh',
      verify: PLACEHOLDER,
      brief: true,
    });
    const step = await readNextStep(tmpDir, dir, CONFIG);
    assert.deepEqual(step, { state: 'unplanned', command: 'osq plan 001', detail: null });
    assert.equal(formatNextStep(step), 'unplanned — osq plan 001');
  });

  it('uses the lint command for an unplanned change without a brief', async () => {
    const dir = await createActive(tmpDir, '002-new', { title: 'New', verify: PLACEHOLDER });
    const step = await readNextStep(tmpDir, dir, CONFIG);
    assert.equal(step.state, 'unplanned');
    assert.equal(step.command, 'osq lint 002');
  });

  it('treats a missing verify as unplanned', async () => {
    const dir = await createActive(tmpDir, '002b-missing', { title: 'Missing', verify: '' });
    const step = await readNextStep(tmpDir, dir, CONFIG);
    assert.equal(step.state, 'unplanned');
  });

  it('names a real-verify unapproved change ready for approval', async () => {
    const dir = await createActive(tmpDir, '003-ready', { title: 'Ready' });
    const step = await readNextStep(tmpDir, dir, CONFIG);
    assert.equal(step.state, 'ready-for-approval');
    assert.equal(step.command, 'osq approve 003');
    assert.equal(step.detail, null);
  });

  it('flags steps before approval on a ready change', async () => {
    const dir = await createActive(tmpDir, '004-steps', {
      title: 'Steps',
      humanSteps: '### Before approval\nCreate the test database',
    });
    const step = await readNextStep(tmpDir, dir, CONFIG);
    assert.equal(step.state, 'ready-for-approval');
    assert.equal(step.detail, 'do the steps before approval first');
    assert.equal(
      formatNextStep(step),
      'ready for approval (do the steps before approval first) — osq approve 004',
    );
  });

  it('names an approved healthy change running', async () => {
    const dir = await createActive(tmpDir, '005-run', { title: 'Run', approved: true });
    const step = await readNextStep(tmpDir, dir, CONFIG);
    assert.equal(step.state, 'running');
    assert.equal(step.command, 'osq show 005');
    assert.equal(step.detail, null);
  });

  it('points a dead task at its retry command', async () => {
    const dir = await createActive(tmpDir, '006-dead', {
      title: 'Dead',
      approved: true,
      dead: true,
    });
    const step = await readNextStep(tmpDir, dir, CONFIG);
    assert.equal(step.state, 'dead');
    assert.equal(step.command, 'osq retry 006 1');
  });

  it('points a change regression at the reject command', async () => {
    const dir = await createActive(tmpDir, '007-reg', {
      title: 'Reg',
      approved: true,
      regressedChange: true,
    });
    const step = await readNextStep(tmpDir, dir, CONFIG);
    assert.equal(step.state, 'dead');
    assert.equal(step.command, 'osq reject 007 --reason <text>');
  });

  it('points a blocked change at its first unmet dependency', async () => {
    const dir = await createActive(tmpDir, '008-blocked', {
      title: 'Blocked',
      approved: true,
      dependsOn: ['012'],
    });
    const step = await readNextStep(tmpDir, dir, CONFIG);
    assert.equal(step.state, 'blocked');
    assert.equal(step.command, 'osq show 012');
    assert.equal(step.detail, 'waiting for 012');
  });
});

describe('readNextStep for archived changes', () => {
  it('names an archived change without verification landed', async () => {
    const dir = await createArchived(tmpDir, '009-plain', { title: 'Plain' });
    const step = await readNextStep(tmpDir, dir, CONFIG);
    assert.deepEqual(step, { state: 'landed', command: null, detail: null });
    assert.equal(formatNextStep(step), 'landed');
  });

  it('asks for the check before an outcome is recorded', async () => {
    const dir = await createArchived(tmpDir, '010-check', {
      title: 'Check',
      verification: { afterLanding: true, check: 'node check.cjs' },
    });
    const step = await readNextStep(tmpDir, dir, CONFIG);
    assert.equal(step.state, 'verification-pending');
    assert.equal(step.command, 'osq check 010');
    assert.equal(step.detail, null);
  });

  it('asks for the outcome once the check has run since archive', async () => {
    const dir = await createArchived(tmpDir, '011-ran', {
      title: 'Ran',
      verification: { afterLanding: true, check: 'node check.cjs' },
      extraEvents: [
        {
          type: 'check_ran',
          timestamp: '2026-01-02T00:00:00.000Z',
          data: { command: 'node check.cjs', exitCode: 0 },
        },
      ],
    });
    const step = await readNextStep(tmpDir, dir, CONFIG);
    assert.equal(step.command, 'osq verified 011 --passed|--failed');
  });

  it('asks for the outcome when there is no check command', async () => {
    const dir = await createArchived(tmpDir, '012-steps', {
      title: 'Steps',
      verification: { afterLanding: true, check: null },
    });
    const step = await readNextStep(tmpDir, dir, CONFIG);
    assert.equal(step.command, 'osq verified 012 --passed|--failed');
  });

  it('reports a failed outcome in the detail and format', async () => {
    const dir = await createArchived(tmpDir, '013-failed', {
      title: 'Failed',
      verification: { afterLanding: false, check: null },
      extraEvents: [
        {
          type: 'verification_recorded',
          timestamp: '2026-01-02T00:00:00.000Z',
          data: { outcome: 'failed', note: 'nope' },
        },
      ],
    });
    const step = await readNextStep(tmpDir, dir, CONFIG);
    assert.equal(step.state, 'verification-pending');
    assert.equal(step.detail, 'failed');
    assert.equal(
      formatNextStep(step),
      'verification pending (failed) — osq verified 013 --passed|--failed',
    );
  });

  it('treats a passed outcome as landed', async () => {
    const dir = await createArchived(tmpDir, '014-passed', {
      title: 'Passed',
      verification: { afterLanding: true, check: null },
      extraEvents: [
        {
          type: 'verification_recorded',
          timestamp: '2026-01-02T00:00:00.000Z',
          data: { outcome: 'passed', note: null },
        },
      ],
    });
    const step = await readNextStep(tmpDir, dir, CONFIG);
    assert.equal(step.state, 'landed');
  });
});

describe('readVerification', () => {
  it('reads the requirement, latest outcome, and check since archive', async () => {
    const dir = await createArchived(tmpDir, '020-ver', {
      title: 'Ver',
      verification: { afterLanding: true, check: 'node check.cjs' },
      extraEvents: [
        {
          type: 'verification_recorded',
          timestamp: '2026-01-02T00:00:00.000Z',
          data: { outcome: 'passed', note: null },
        },
        {
          type: 'verification_recorded',
          timestamp: '2026-01-03T00:00:00.000Z',
          data: { outcome: 'failed', note: 'again' },
        },
        {
          type: 'check_ran',
          timestamp: '2026-01-04T00:00:00.000Z',
          data: { command: 'node check.cjs', exitCode: 1 },
        },
      ],
    });
    assert.deepEqual(await readVerification(dir), {
      required: true,
      afterLanding: true,
      check: 'node check.cjs',
      outcome: 'failed',
      checkRanSinceArchive: true,
    });
  });

  it('skips malformed lines without dropping valid events', async () => {
    const dir = await createArchived(tmpDir, '021-malformed', {
      title: 'Malformed',
      verification: { afterLanding: false, check: null },
      rawStream: `${[
        JSON.stringify({
          type: 'archived',
          timestamp: '2026-01-01T00:00:00.000Z',
          data: { verification: { afterLanding: false, check: null } },
        }),
        'not json',
        JSON.stringify({ type: 'verification_recorded', data: { outcome: 'passed' } }),
      ].join('\n')}\n`,
    });
    const state = await readVerification(dir);
    assert.equal(state.outcome, 'passed');
    assert.equal(state.checkRanSinceArchive, false);
  });

  it('only counts a check that follows the archive event', async () => {
    const dir = await createArchived(tmpDir, '022-order', {
      title: 'Order',
      rawStream: `${[
        JSON.stringify({
          type: 'check_ran',
          timestamp: '2026-01-01T00:00:00.000Z',
          data: { command: 'node check.cjs', exitCode: 0 },
        }),
        JSON.stringify({
          type: 'archived',
          timestamp: '2026-01-02T00:00:00.000Z',
          data: { verification: { afterLanding: true, check: 'node check.cjs' } },
        }),
      ].join('\n')}\n`,
    });
    assert.equal((await readVerification(dir)).checkRanSinceArchive, false);
  });

  it('returns defaults when the stream is missing', async () => {
    const dir = path.join(archiveDir(tmpDir), '023-missing');
    await fs.mkdir(dir, { recursive: true });
    assert.deepEqual(await readVerification(dir), {
      required: false,
      afterLanding: false,
      check: null,
      outcome: null,
      checkRanSinceArchive: false,
    });
  });

  it('lists pending archived changes in numeric order', async () => {
    await createArchived(tmpDir, '030-first', {
      title: 'First',
      verification: { afterLanding: true, check: null },
    });
    await createArchived(tmpDir, '031-passed', {
      title: 'Passed',
      verification: { afterLanding: true, check: null },
      extraEvents: [
        {
          type: 'verification_recorded',
          timestamp: '2026-01-02T00:00:00.000Z',
          data: { outcome: 'passed', note: null },
        },
      ],
    });
    await createArchived(tmpDir, '032-second', {
      title: 'Second',
      verification: { afterLanding: false, check: null },
    });
    await createArchived(tmpDir, '029-plain', { title: 'Plain' });

    const pending = await listPendingVerifications(archiveDir(tmpDir));
    assert.deepEqual(
      pending.map((item) => item.folderName),
      ['030-first', '032-second'],
    );
    assert.deepEqual(
      pending.map((item) => item.title),
      ['First', 'Second'],
    );
    assert.equal(pending[0].verification.outcome, null);
    assert.equal(pending[0].verification.required, true);
  });
});

describe('explicit status with next steps', () => {
  it('fills next steps and lists pending verifications before archived specs', async () => {
    await createActive(tmpDir, '040-fresh', {
      title: 'Fresh',
      verify: PLACEHOLDER,
      brief: true,
    });
    await createArchived(tmpDir, '041-pending', {
      title: 'Pending',
      verification: { afterLanding: true, check: null },
    });

    const overview = await getStatusOverview(tmpDir, CONFIG);
    assert.equal(overview.nextSteps?.['040-fresh']?.state, 'unplanned');
    assert.equal(overview.nextSteps?.['040-fresh']?.command, 'osq plan 040');
    assert.equal(overview.pendingVerifications?.length, 1);
    assert.equal(overview.pendingVerifications?.[0].folderName, '041-pending');
    assert.equal(overview.pendingVerifications?.[0].next.state, 'verification-pending');

    const text = formatStatusOverview(overview);
    assert.ok(text.includes('  next: unplanned — osq plan 040'));
    const pendingIndex = text.indexOf('Verification pending:');
    const archivedIndex = text.indexOf('Archived specs:');
    assert.ok(pendingIndex >= 0, text);
    assert.ok(pendingIndex < archivedIndex, text);
    assert.ok(
      text.includes(
        '041-pending: Pending — verification pending — osq verified 041 --passed|--failed',
      ),
      text,
    );
  });

  it('prints nothing new when next steps are absent', () => {
    const overview = {
      specs: [],
      rejected: [],
      archivedCount: 0,
      archivedChangeFolders: 0,
    };
    const text = formatStatusOverview(overview);
    assert.ok(!text.includes('next:'), text);
    assert.ok(!text.includes('Verification pending:'), text);
    assert.ok(text.includes('Archived specs: 0'), text);
  });

  it('does not read or advance last-look state', async () => {
    await createActive(tmpDir, '042-fresh', {
      title: 'Fresh',
      verify: PLACEHOLDER,
      brief: true,
    });
    assert.equal(await readLastLook(tmpDir), null);
    const overview = await getStatusOverview(tmpDir, CONFIG);
    formatStatusOverview(overview);
    assert.equal(await readLastLook(tmpDir), null);
  });
});
