import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { checkCommand } from '../src/cli/check.js';
import { createProgram } from '../src/cli/index.js';
import { verifiedCommand } from '../src/cli/verified.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { recordVerification, runCheck } from '../src/core/lifecycle/verification-record.js';
import { archiveSpecFolder } from '../src/watcher/archiver.js';

const CONFIG: OsqConfig = DEFAULT_CONFIG;

const CHECK_SCRIPT = [
  "const fs = require('node:fs');",
  "fs.appendFileSync('check-ran.txt', 'x');",
  "console.log('check output');",
  '',
].join('\n');

const FAIL_CHECK_SCRIPT = 'process.exit(3);\n';

function proposalMd(options: {
  title?: string;
  check?: string;
  humanSteps?: string;
}): string {
  const lines = ['---', `title: ${options.title ?? 'Change'}`, 'verify: node verify.cjs'];
  if (options.check !== undefined) lines.push(`check: ${options.check}`);
  lines.push(
    '---',
    '## Goal',
    'A goal.',
    '## Contract',
    '| Input | Expected Output |',
    '|---|---|',
    '| a | b |',
    '## Non-goals',
    'None.',
    '## Surface',
    'None.',
    '## Delta',
    'None.',
  );
  if (options.humanSteps !== undefined) {
    lines.push('## Human steps', options.humanSteps);
  }
  return `${lines.join('\n')}\n`;
}

async function createChange(
  root: string,
  folderName: string,
  options: { title?: string; check?: string; humanSteps?: string } = {},
): Promise<string> {
  const dir = path.join(root, 'openspec', 'changes', folderName);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(options), 'utf8');
  await fs.writeFile(path.join(dir, 'tasks', '1.md'), '# Task\n', 'utf8');
  return dir;
}

async function archiveChange(
  root: string,
  folderName: string,
  options: { title?: string; check?: string; humanSteps?: string } = {},
): Promise<string> {
  const dir = await createChange(root, folderName, options);
  return archiveSpecFolder(root, dir, CONFIG);
}

interface ParsedEvent {
  type: string;
  timestamp?: string;
  data?: Record<string, unknown>;
}

async function readChangeEvents(folderPath: string): Promise<ParsedEvent[]> {
  const raw = await fs
    .readFile(path.join(folderPath, '.run', 'events', 'change.jsonl'), 'utf8')
    .catch(() => '');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

async function archivedEvent(folderPath: string): Promise<ParsedEvent> {
  const event = (await readChangeEvents(folderPath)).find((entry) => entry.type === 'archived');
  assert.ok(event, 'the archived event should exist');
  return event;
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

/** Captures logs and stubs `process.exit` so refusals and outcomes stay testable. */
async function captureExitAndLogs(
  run: () => Promise<void>,
): Promise<{ lines: string[]; exitCode: number | undefined }> {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalExit = process.exit;
  let exitCode: number | undefined;

  const push = (...args: unknown[]): void => {
    lines.push(args.map(String).join(' '));
  };
  console.log = push;
  console.warn = push;
  console.error = push;
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`PROCESS_EXIT_${exitCode}`);
  }) as unknown as typeof process.exit;

  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!message.startsWith('PROCESS_EXIT_')) throw error;
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
    process.exit = originalExit;
  }

  return { lines, exitCode };
}

let tmpDir = '';

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-verification-record-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('archived verification requirement', () => {
  it('records after-landing steps on the archived event', async () => {
    const archived = await archiveChange(tmpDir, '001-steps', {
      humanSteps: '### After landing\nDelete the test database',
    });
    const event = await archivedEvent(archived);
    assert.deepEqual(event.data?.verification, { afterLanding: true, check: null });
  });

  it('records a check command without after-landing steps', async () => {
    const archived = await archiveChange(tmpDir, '002-check', {
      check: 'node check.cjs',
      humanSteps: '### Before approval\nCreate the test database',
    });
    const event = await archivedEvent(archived);
    assert.deepEqual(event.data?.verification, { afterLanding: false, check: 'node check.cjs' });
  });

  it('records only archivePath when there are no human steps or check', async () => {
    const archived = await archiveChange(tmpDir, '003-plain', { humanSteps: 'None' });
    const event = await archivedEvent(archived);
    assert.equal(
      event.data?.archivePath,
      path.relative(tmpDir, archived).split(path.sep).join('/'),
    );
    assert.equal('verification' in (event.data ?? {}), false);
  });

  it('records nothing extra when the section is absent', async () => {
    const archived = await archiveChange(tmpDir, '004-absent');
    const event = await archivedEvent(archived);
    assert.equal('verification' in (event.data ?? {}), false);
  });
});

describe('human verification events', () => {
  it('appends one verification_recorded event with outcome and note', async () => {
    const archived = await archiveChange(tmpDir, '005-record', {
      humanSteps: '### After landing\nRemove the test database',
    });

    const target = await recordVerification(tmpDir, '005', 'failed', 'the database leaked', CONFIG);
    assert.equal(target.id, '005');
    assert.equal(target.folderPath, archived);

    const recorded = (await readChangeEvents(archived)).filter(
      (event) => event.type === 'verification_recorded',
    );
    assert.equal(recorded.length, 1);
    assert.deepEqual(recorded[0].data, { outcome: 'failed', note: 'the database leaked' });
  });

  it('records a null note when none is given', async () => {
    const archived = await archiveChange(tmpDir, '006-note', {
      humanSteps: '### After landing\nA step',
    });
    await recordVerification(tmpDir, '006', 'passed', null, CONFIG);
    const recorded = (await readChangeEvents(archived)).filter(
      (event) => event.type === 'verification_recorded',
    );
    assert.deepEqual(recorded[0].data, { outcome: 'passed', note: null });
  });

  it('refuses a non-archived change and appends nothing', async () => {
    const dir = await createChange(tmpDir, '007-active', {
      humanSteps: '### After landing\nA step',
    });
    await assert.rejects(recordVerification(tmpDir, '007', 'passed', null, CONFIG));
    assert.equal(await exists(path.join(dir, '.run', 'events', 'change.jsonl')), false);
  });

  it('refuses an archived change that requires no verification', async () => {
    const archived = await archiveChange(tmpDir, '008-plain', { humanSteps: 'None' });
    const before = await readChangeEvents(archived);
    await assert.rejects(recordVerification(tmpDir, '008', 'passed', null, CONFIG));
    assert.deepEqual(await readChangeEvents(archived), before);
  });
});

describe('checked-in check command', () => {
  it('runs the recorded check and records command, exit code, duration, and output', async () => {
    await fs.writeFile(path.join(tmpDir, 'check.cjs'), CHECK_SCRIPT, 'utf8');
    const archived = await archiveChange(tmpDir, '009-check', {
      check: 'node check.cjs',
      humanSteps: '### After landing\nA step',
    });

    const result = await runCheck(tmpDir, '009', CONFIG);

    assert.equal(result.check.command, 'node check.cjs');
    assert.equal(result.check.exitCode, 0);
    assert.equal(await fs.readFile(path.join(tmpDir, 'check-ran.txt'), 'utf8'), 'x');
    assert.ok(result.check.output.includes('check output'));

    const recorded = (await readChangeEvents(archived)).filter(
      (event) => event.type === 'check_ran',
    );
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].data?.command, 'node check.cjs');
    assert.equal(recorded[0].data?.exitCode, 0);
    assert.equal(recorded[0].data?.timedOut, false);
    assert.equal(typeof recorded[0].data?.duration, 'number');
    assert.ok(String(recorded[0].data?.output).includes('check output'));
  });

  it('refuses an archived change without a check command and appends nothing', async () => {
    const archived = await archiveChange(tmpDir, '010-none', {
      humanSteps: '### After landing\nA step',
    });
    const before = await readChangeEvents(archived);

    await assert.rejects(runCheck(tmpDir, '010', CONFIG));

    assert.deepEqual(await readChangeEvents(archived), before);
    assert.equal(
      (await readChangeEvents(archived)).some((event) => event.type === 'check_ran'),
      false,
    );
  });

  it('refuses a non-archived change and appends nothing', async () => {
    const dir = await createChange(tmpDir, '011-active', {
      check: 'node check.cjs',
      humanSteps: '### After landing\nA step',
    });
    await assert.rejects(runCheck(tmpDir, '011', CONFIG));
    assert.equal(await exists(path.join(dir, '.run', 'events', 'change.jsonl')), false);
  });
});

describe('check command', () => {
  it('prints the exit code, output, and next step and exits zero when passed', async () => {
    await fs.writeFile(path.join(tmpDir, 'check.cjs'), CHECK_SCRIPT, 'utf8');
    const archived = await archiveChange(tmpDir, '012-check', {
      check: 'node check.cjs',
      humanSteps: '### After landing\nA step',
    });

    const { lines, exitCode } = await captureExitAndLogs(() =>
      checkCommand('012', { cwd: tmpDir, config: CONFIG }),
    );

    assert.equal(exitCode, undefined);
    assert.ok(
      lines.some((line) => line.includes('Exit code: 0')),
      lines.join('\n'),
    );
    assert.ok(
      lines.some((line) => line.includes('check output')),
      lines.join('\n'),
    );
    assert.ok(
      lines.includes('Next: verification pending — osq verified 012 --passed|--failed'),
      lines.join('\n'),
    );
    assert.equal(
      (await readChangeEvents(archived)).filter((event) => event.type === 'check_ran').length,
      1,
    );
  });

  it('exits one after a failing check and still records the event', async () => {
    await fs.writeFile(path.join(tmpDir, 'check.cjs'), FAIL_CHECK_SCRIPT, 'utf8');
    const archived = await archiveChange(tmpDir, '013-fail', {
      check: 'node check.cjs',
      humanSteps: '### After landing\nA step',
    });

    const { lines, exitCode } = await captureExitAndLogs(() =>
      checkCommand('013', { cwd: tmpDir, config: CONFIG }),
    );

    assert.equal(exitCode, 1);
    assert.ok(
      lines.some((line) => line.includes('Exit code: 3')),
      lines.join('\n'),
    );
    assert.equal(
      (await readChangeEvents(archived)).filter((event) => event.type === 'check_ran').length,
      1,
    );
  });

  it('refuses a change without a check command and appends nothing', async () => {
    const archived = await archiveChange(tmpDir, '014-none', {
      humanSteps: '### After landing\nA step',
    });
    const before = await readChangeEvents(archived);

    const { exitCode } = await captureExitAndLogs(() =>
      checkCommand('014', { cwd: tmpDir, config: CONFIG }),
    );

    assert.equal(exitCode, 1);
    assert.deepEqual(await readChangeEvents(archived), before);
  });
});

describe('verified command', () => {
  it('appends one event and prints Next: landed for a passed outcome', async () => {
    const archived = await archiveChange(tmpDir, '015-passed', {
      humanSteps: '### After landing\nA step',
    });

    const { lines, exitCode } = await captureExitAndLogs(() =>
      verifiedCommand('015', { cwd: tmpDir, config: CONFIG, passed: true }),
    );

    assert.equal(exitCode, undefined);
    assert.ok(
      lines.some((line) => line.startsWith('Next: landed')),
      lines.join('\n'),
    );
    const recorded = (await readChangeEvents(archived)).filter(
      (event) => event.type === 'verification_recorded',
    );
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].data?.outcome, 'passed');
  });

  it('records a failed outcome with a note and prints the failed next step', async () => {
    const archived = await archiveChange(tmpDir, '016-failed', {
      humanSteps: '### After landing\nA step',
    });

    const { lines, exitCode } = await captureExitAndLogs(() =>
      verifiedCommand('016', { cwd: tmpDir, config: CONFIG, failed: true, note: 'nope' }),
    );

    assert.equal(exitCode, undefined);
    assert.ok(
      lines.includes('Next: verification pending (failed) — osq verified 016 --passed|--failed'),
      lines.join('\n'),
    );
    const recorded = (await readChangeEvents(archived)).filter(
      (event) => event.type === 'verification_recorded',
    );
    assert.deepEqual(recorded[0].data, { outcome: 'failed', note: 'nope' });
  });

  it('refuses both flags and appends nothing', async () => {
    const archived = await archiveChange(tmpDir, '017-both', {
      humanSteps: '### After landing\nA step',
    });
    const before = await readChangeEvents(archived);

    const { exitCode } = await captureExitAndLogs(() =>
      verifiedCommand('017', { cwd: tmpDir, config: CONFIG, passed: true, failed: true }),
    );

    assert.equal(exitCode, 1);
    assert.deepEqual(await readChangeEvents(archived), before);
  });

  it('refuses neither flag and appends nothing', async () => {
    const archived = await archiveChange(tmpDir, '018-neither', {
      humanSteps: '### After landing\nA step',
    });
    const before = await readChangeEvents(archived);

    const { exitCode } = await captureExitAndLogs(() =>
      verifiedCommand('018', { cwd: tmpDir, config: CONFIG }),
    );

    assert.equal(exitCode, 1);
    assert.deepEqual(await readChangeEvents(archived), before);
  });

  it('refuses a change that requires no verification and appends nothing', async () => {
    const archived = await archiveChange(tmpDir, '019-plain', { humanSteps: 'None' });
    const before = await readChangeEvents(archived);

    const { exitCode } = await captureExitAndLogs(() =>
      verifiedCommand('019', { cwd: tmpDir, config: CONFIG, passed: true }),
    );

    assert.equal(exitCode, 1);
    assert.deepEqual(await readChangeEvents(archived), before);
  });
});

describe('command registration', () => {
  it('registers check and verified with their flags', () => {
    const program = createProgram();

    const check = program.commands.find((command) => command.name() === 'check');
    assert.ok(check, 'osq check should be registered');

    const verified = program.commands.find((command) => command.name() === 'verified');
    assert.ok(verified, 'osq verified should be registered');
    const longs = verified.options.map((option) => option.long).sort();
    for (const flag of ['--failed', '--note', '--passed']) {
      assert.ok(longs.includes(flag), `verified should register ${flag}, got ${longs.join(', ')}`);
    }
  });
});
