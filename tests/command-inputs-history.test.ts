import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { CommandError } from '../src/cli/command-error.js';
import { digestCommand } from '../src/cli/digest.js';
import { queryCommand } from '../src/cli/query.js';
import { reportCommand } from '../src/cli/report.js';
import { type OsqConfig, loadConfig } from '../src/core/foundation/config.js';
import { runCliCaptured } from './cli-capture.js';

const ARCHIVE_DIR = path.join('openspec', 'changes', 'archive');
const CHANGE = '010-alpha';

const PROPOSAL = [
  '---',
  'title: Alpha change',
  'depends_on: []',
  '---',
  '## Goal',
  '',
  'Do the alpha thing.',
  '',
].join('\n');

const DELTA = [
  '# Spec Delta: cli-foundation',
  '',
  '## ADDED Requirements',
  '',
  '### Requirement: Added thing',
  '',
  'Text.',
  '',
].join('\n');

const TASK = [
  '---',
  'title: First alpha task',
  'verify: node -e "process.exit(0)"',
  'scope: []',
  'entry: []',
  'skills: []',
  '---',
  '## Acceptance',
  '- [ ] done',
  '',
].join('\n');

/** Write one file under `root`, creating its parent folders. */
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
  project = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-history-inputs-'));
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-history-inputs-home-'));
  const base = path.join(ARCHIVE_DIR, CHANGE);
  await write(project, path.join(base, 'proposal.md'), PROPOSAL);
  await write(project, path.join(base, 'specs', 'cli-foundation', 'spec.md'), DELTA);
  await write(project, path.join(base, 'tasks', '1.md'), TASK);
  await write(project, path.join(base, '.run', 'approved'), '');
  await write(
    project,
    path.join(base, '.run', 'manifest.json'),
    JSON.stringify({ planner: 'planner-alpha', approvedAt: '2026-10-01T08:00:00.000Z' }),
  );
  await write(
    project,
    path.join(base, '.run', 'events', 'change.jsonl'),
    `${JSON.stringify({ type: 'archived', timestamp: '2026-10-01T09:00:00.000Z', data: {} })}\n`,
  );
  await write(
    project,
    path.join(base, '.run', 'events', '1.jsonl'),
    `${[
      JSON.stringify({ type: 'started', timestamp: '2026-10-01T08:10:00.000Z', data: {} }),
      JSON.stringify({ type: 'done', timestamp: '2026-10-01T08:20:00.000Z', data: {} }),
    ].join('\n')}\n`,
  );
  await write(project, path.join(base, '.run', 'done', '1'), '');
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

/** Run the CLI with HOME pointed at the temporary home so no real log is read. */
async function captureCli(
  argv: readonly string[],
): Promise<Captured & { readonly exitCode: number | undefined }> {
  const originalHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const capture = await runCliCaptured(project, argv);
    return { stdout: capture.stdout, stderr: capture.stderr, exitCode: capture.exitCode };
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
  assert.equal(cli.exitCode, undefined, `osq ${argv.join(' ')} exited nonzero: ${cli.stderr}`);
  const direct = await captureDirect(run);
  assert.equal(direct.stdout, cli.stdout, `stdout differs for osq ${argv.join(' ')}`);
  assert.equal(direct.stderr, cli.stderr, `stderr differs for osq ${argv.join(' ')}`);
  return direct;
}

describe('command inputs across history commands', () => {
  it('osq report prints the same text directly and through runCli', async () => {
    const direct = await assertSame(['report'], (writers) =>
      reportCommand({ cwd: project, config, home, ...writers }),
    );
    assert.match(direct.stdout, /osq Delivery Metrics Report/);
    assert.equal(direct.stderr, '');
  });

  it('osq report --json prints the same text directly and through runCli', async () => {
    const direct = await assertSame(['report', '--json'], (writers) =>
      reportCommand({ cwd: project, config, home, json: true, ...writers }),
    );
    const parsed = JSON.parse(direct.stdout) as { specs: { archived: number } };
    assert.equal(parsed.specs.archived, 1);
    assert.equal(direct.stderr, '');
  });

  it('osq query <select> prints the same text directly and through runCli', async () => {
    const select = 'select id, folder from changes order by folder';
    const direct = await assertSame(['query', select], (writers) =>
      queryCommand({ cwd: project, config, select, ...writers }),
    );
    assert.equal(direct.stdout, 'id\tfolder\n010\t010-alpha\n');
    assert.equal(direct.stderr, '');
  });

  it('osq query prints the same text directly and through runCli', async () => {
    const direct = await assertSame(['query'], (writers) =>
      queryCommand({ cwd: project, config, ...writers }),
    );
    assert.match(direct.stdout, /^changes\(/);
    assert.equal(direct.stderr, '');
  });

  it('osq digest <id> prints the same text directly and through runCli', async () => {
    const direct = await assertSame(['digest', '010'], (writers) =>
      digestCommand({ cwd: project, config, ids: ['010'], ...writers }),
    );
    assert.match(direct.stdout, /^# osq digest/);
    assert.equal(direct.stderr, '');
  });

  it('osq digest <id> --json prints the same text directly and through runCli', async () => {
    const direct = await assertSame(['digest', '010', '--json'], (writers) =>
      digestCommand({ cwd: project, config, ids: ['010'], json: true, ...writers }),
    );
    const parsed = JSON.parse(direct.stdout) as { changes: unknown[] };
    assert.equal(parsed.changes.length, 1);
    assert.equal(direct.stderr, '');
  });

  for (const argv of [['digest'], ['digest', '--json']] as ReadonlyArray<readonly string[]>) {
    it(`bare osq ${argv.join(' ')} refuses the same way through runCli and directly`, async () => {
      const cli = await captureCli([...argv]);
      assert.equal(cli.exitCode, 1);
      assert.equal(cli.stdout, '');
      assert.equal(cli.stderr, 'Give change ids or --since <date>\n');

      await assert.rejects(
        digestCommand({
          cwd: project,
          config,
          ids: [],
          json: argv.includes('--json'),
        }),
        (error: unknown) => {
          assert.ok(error instanceof CommandError);
          assert.equal(error.message, 'Give change ids or --since <date>');
          return true;
        },
      );
    });
  }
});
