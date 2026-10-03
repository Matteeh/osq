import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { inboxCommand } from '../src/cli/inbox.js';
import { queueCommand } from '../src/cli/queue.js';
import { showCommand } from '../src/cli/show.js';
import { statusCommand } from '../src/cli/status.js';
import { type OsqConfig, loadConfig } from '../src/core/foundation/config.js';
import { runCliCaptured } from './cli-capture.js';

const PROPOSAL = [
  '---',
  'title: Demo Change',
  'depends_on: []',
  'verify: node -e "process.exit(0)"',
  '---',
  '## Goal',
  'Demo goal.',
  '',
].join('\n');

const TASK = [
  '---',
  'title: Task one',
  'verify: node -e "process.exit(0)"',
  'scope: []',
  'entry: []',
  'skills: []',
  '---',
  '## Acceptance',
  '- [ ] done',
  '',
].join('\n');

async function write(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** A command's writers, appending each exact chunk to a string. */
interface Writers {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

interface Captured {
  readonly stdout: string;
  readonly stderr: string;
}

let project: string;
let home: string;
let config: OsqConfig;

beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-views-'));
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-views-home-'));
  await write(
    project,
    'openspec/queue.md',
    '## [demo] Demo\nDepends on: nothing\n\nBrief body for demo.\n',
  );
  await write(project, 'openspec/changes/001-demo/proposal.md', PROPOSAL);
  await write(project, 'openspec/changes/001-demo/tasks/1.md', TASK);
  await write(
    project,
    'openspec/changes/001-demo/brief.md',
    '---\nqueue_item: demo\n---\nBrief body for demo.\n',
  );
  config = await loadConfig(project);
});

afterEach(async () => {
  await fs.rm(project, { recursive: true, force: true });
  await fs.rm(home, { recursive: true, force: true });
});

/** Run the command directly, proving no byte reaches the process streams. */
async function captureDirect(run: (writers: Writers) => Promise<unknown>): Promise<Captured> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const leaked: string[] = [];
  const originalStdout = process.stdout.write;
  const originalStderr = process.stderr.write;
  const record = (chunk: string | Uint8Array): boolean => {
    leaked.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  };
  process.stdout.write = record as typeof process.stdout.write;
  process.stderr.write = record as typeof process.stderr.write;
  try {
    await run({ stdout: (text) => stdout.push(text), stderr: (text) => stderr.push(text) });
  } finally {
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
  }
  assert.deepEqual(leaked, [], 'the direct call wrote to a process stream');
  return { stdout: stdout.join(''), stderr: stderr.join('') };
}

/** Run the command through `runCli`, sharing the inbox cursor home. */
async function captureCli(argv: readonly string[]): Promise<Captured> {
  const originalHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const capture = await runCliCaptured(project, argv);
    assert.equal(capture.exitCode, undefined, `osq ${argv.join(' ')} exited nonzero`);
    return { stdout: capture.stdout, stderr: capture.stderr };
  } finally {
    if (originalHome === undefined) Reflect.deleteProperty(process.env, 'HOME');
    else process.env.HOME = originalHome;
  }
}

/** Run one command both ways in the same project and compare both streams. */
async function assertSame(
  argv: readonly string[],
  run: (writers: Writers) => Promise<unknown>,
): Promise<Captured> {
  const cli = await captureCli(argv);
  const direct = await captureDirect(run);
  assert.equal(direct.stdout, cli.stdout, `stdout differs for osq ${argv.join(' ')}`);
  assert.equal(direct.stderr, cli.stderr, `stderr differs for osq ${argv.join(' ')}`);
  return direct;
}

describe('command inputs across views', () => {
  it('osq status prints the same text directly and through runCli', async () => {
    const direct = await assertSame(['status'], (writers) =>
      statusCommand({ cwd: project, config, ...writers }),
    );
    assert.match(direct.stdout, /Demo Change/);
    assert.equal(direct.stderr, '');
  });

  it('osq queue prints the same text directly and through runCli', async () => {
    const direct = await assertSame(['queue'], (writers) =>
      queueCommand({ cwd: project, config, ...writers }),
    );
    assert.match(direct.stdout, /^Queue:/);
    assert.equal(direct.stderr, '');
  });

  it('osq show prints the same text directly and through runCli', async () => {
    const direct = await assertSame(['show', '001'], (writers) =>
      showCommand('001', { cwd: project, config, ...writers }),
    );
    assert.match(direct.stdout, /Demo Change/);
    assert.equal(direct.stderr, '');
  });

  it('osq show --json prints the same text directly and through runCli', async () => {
    const direct = await assertSame(['show', '001', '--json'], (writers) =>
      showCommand('001', { cwd: project, config, json: true, ...writers }),
    );
    assert.equal((JSON.parse(direct.stdout) as { id: string }).id, '001');
    assert.equal(direct.stderr, '');
  });

  it('bare osq prints the same text directly and through runCli', async () => {
    const now = new Date('2026-10-02T00:00:00.000Z');
    const direct = await assertSame([], (writers) =>
      inboxCommand({ cwd: project, config, home, now, ...writers }),
    );
    assert.match(direct.stdout, /Needs you/);
    assert.equal(direct.stderr, '');
  });

  it('osq --json prints the same text directly and through runCli', async () => {
    const now = new Date('2026-10-02T00:00:00.000Z');
    const direct = await assertSame(['--json'], (writers) =>
      inboxCommand({ cwd: project, config, json: true, home, now, ...writers }),
    );
    assert.deepEqual(Object.keys(JSON.parse(direct.stdout) as object), [
      'needsYou',
      'running',
      'landed',
    ]);
    assert.equal(direct.stderr, '');
  });
});
