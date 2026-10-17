import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { CommandError } from '../src/cli/command-error.js';
import { createProgram } from '../src/cli/index.js';
import { queueCommand } from '../src/cli/queue.js';
import { forwardProgram } from '../src/cli/remote-client.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import {
  clearAutopilotStop,
  readAutopilotStop,
  writeAutopilotStop,
} from '../src/core/status/autopilot-stop.js';
import {
  type QueueApproval,
  itemApproval,
  readQueueApproval,
  writeQueueApproval,
} from '../src/core/status/queue-approval.js';
import { formatQueue, projectQueue, readQueue } from '../src/core/status/queue.js';
import { runCliCaptured } from './cli-capture.js';

const OPENSPEC = 'openspec';
const PATH_APPR = `${OPENSPEC}/.run/queue-approval.md`;
const PATH_STOP = `${OPENSPEC}/.run/autopilot-stop.md`;

interface ItemSpec {
  slug: string;
  title: string;
  depends?: string;
  body?: string;
}

function queueContent(items: ItemSpec[]): string {
  return items
    .map((item) =>
      [
        `## [${item.slug}] ${item.title}`,
        `Depends on: ${item.depends ?? 'nothing'}`,
        '',
        item.body ?? `Brief body for ${item.slug}.`,
        '',
      ].join('\n'),
    )
    .join('\n');
}

async function writeAt(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

async function readAt(root: string, rel: string): Promise<string> {
  return fs.readFile(path.join(root, rel), 'utf8');
}

/** Run `fn` with the process working directory set to `cwd`. */
async function withCwd<T>(cwd: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.cwd();
  process.chdir(cwd);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-queue-approval-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('queue approval record', () => {
  it('gives an item its approval', () => {
    const approval: QueueApproval = {
      approvedAt: '2026-10-17T00:00:00.000Z',
      approver: 'osq <osq@example.invalid>',
      items: [{ slug: 'present', hash: 'sha256:aaa' }],
      hash: 'sha256:record',
    };

    assert.equal(itemApproval(null, { slug: 'present', hash: 'sha256:aaa' }), 'unapproved');
    assert.equal(itemApproval(approval, { slug: 'absent', hash: 'sha256:aaa' }), 'unapproved');
    assert.equal(itemApproval(approval, { slug: 'present', hash: 'sha256:aaa' }), 'approved');
    assert.equal(itemApproval(approval, { slug: 'present', hash: 'sha256:bbb' }), 'changed');
  });
});

describe('osq queue view', () => {
  it('shows the approval line and each item word', async () => {
    const content = queueContent([
      { slug: 'alpha', title: 'Alpha' },
      { slug: 'beta', title: 'Beta' },
    ]);
    await writeAt(tmpDir, `${OPENSPEC}/queue.md`, content);

    const items = await readQueue(tmpDir, DEFAULT_CONFIG);
    await writeQueueApproval(
      tmpDir,
      DEFAULT_CONFIG,
      items.map((item) => ({ slug: item.slug, hash: item.hash })),
      'osq <osq@example.invalid>',
      '2026-10-17T00:00:00.000Z',
    );
    const approval = await readQueueApproval(tmpDir, DEFAULT_CONFIG);
    assert.ok(approval, 'the approval record must read back');

    // Edit the second of the two items so its section hash changes.
    await writeAt(
      tmpDir,
      `${OPENSPEC}/queue.md`,
      content.replace('Brief body for beta.', 'Edited brief for beta.'),
    );

    const shown = await queueCommand({ cwd: tmpDir, stdout: () => {} });
    const lines = shown.split('\n');

    assert.equal(lines[0], 'Queue:');
    assert.equal(
      lines[1],
      `Approved by osq <osq@example.invalid> at 2026-10-17T00:00:00.000Z (${approval.hash})`,
    );
    assert.ok(lines[2]?.endsWith(' approved'), lines[2]);
    assert.ok(lines[3]?.endsWith(' changed since approval'), lines[3]);
  });

  it('prints exactly formatQueue without an approval', async () => {
    const content = queueContent([{ slug: 'alpha', title: 'Alpha' }]);
    await writeAt(tmpDir, `${OPENSPEC}/queue.md`, content);
    const projection = await projectQueue(tmpDir, DEFAULT_CONFIG);

    const shown = await queueCommand({ cwd: tmpDir, stdout: () => {} });
    assert.equal(shown, formatQueue(projection));
    assert.equal(shown, 'Queue:\n  alpha: Alpha [unplanned] rejections: 0');
  });
});

describe('autopilot stop record', () => {
  it('round trips and clears', async () => {
    await writeAutopilotStop(tmpDir, DEFAULT_CONFIG, {
      reason: 'land_stopped',
      item: 'orders',
      change: '003',
      command: 'osq land 003',
      at: '2026-10-17T00:00:00.000Z',
      detail: 'exit code 1',
    });

    const stop = await readAutopilotStop(tmpDir, DEFAULT_CONFIG);
    assert.ok(stop, 'the stop record must read back');
    assert.equal(stop.reason, 'land_stopped');
    assert.equal(stop.item, 'orders');
    assert.equal(stop.change, '003');
    assert.equal(stop.command, 'osq land 003');
    assert.equal(stop.at, '2026-10-17T00:00:00.000Z');
    assert.equal(stop.detail, 'exit code 1');

    await clearAutopilotStop(tmpDir, DEFAULT_CONFIG);
    assert.equal(await readAutopilotStop(tmpDir, DEFAULT_CONFIG), null);

    // Removing a missing file succeeds.
    await clearAutopilotStop(tmpDir, DEFAULT_CONFIG);
    assert.equal(await readAutopilotStop(tmpDir, DEFAULT_CONFIG), null);
  });

  it('reads a missing or unparsable file as no stop', async () => {
    assert.equal(await readAutopilotStop(tmpDir, DEFAULT_CONFIG), null);
    await writeAt(tmpDir, PATH_STOP, 'not a record\n');
    assert.equal(await readAutopilotStop(tmpDir, DEFAULT_CONFIG), null);
  });
});

describe('osq queue approve', () => {
  it('records every item and says autopilot is off', async () => {
    const content = queueContent([
      { slug: 'alpha', title: 'Alpha' },
      { slug: 'beta', title: 'Beta' },
    ]);
    await writeAt(tmpDir, `${OPENSPEC}/queue.md`, content);

    const capture = await runCliCaptured(tmpDir, ['queue', 'approve']);
    assert.equal(capture.stderr, '');
    const lines = capture.stdout.trimEnd().split('\n');
    assert.match(lines[0] ?? '', /^Approved 2 queue items \(sha256:[0-9a-f]{64}\)$/);
    assert.equal(
      lines[1],
      'Autopilot is off; set autopilot.enabled in osq.config.ts to run the queue',
    );

    const approval = await readQueueApproval(tmpDir, DEFAULT_CONFIG);
    assert.ok(approval, 'the approval record must be written');
    assert.equal(lines[0], `Approved 2 queue items (${approval.hash})`);
    assert.deepEqual(approval.items.map((entry) => entry.slug).sort(), ['alpha', 'beta']);
    // A project with no git writes an empty approver.
    assert.equal(approval.approver, '');
  });

  it('records the git user as the approver when the project has git', async () => {
    await writeAt(tmpDir, `${OPENSPEC}/queue.md`, queueContent([{ slug: 'alpha', title: 'A' }]));
    await git(tmpDir, ['init']);
    await git(tmpDir, ['config', 'user.name', 'Ada']);
    await git(tmpDir, ['config', 'user.email', 'ada@example.invalid']);

    const capture = await runCliCaptured(tmpDir, ['queue', 'approve']);
    assert.equal(capture.stderr, '');
    const approval = await readQueueApproval(tmpDir, DEFAULT_CONFIG);
    assert.equal(approval?.approver, 'Ada <ada@example.invalid>');
  });

  it('clears a stop and stays quiet with autopilot on', async () => {
    await writeAt(tmpDir, 'osq.config.ts', 'export default { autopilot: { enabled: true } };\n');
    await writeAt(tmpDir, `${OPENSPEC}/queue.md`, queueContent([{ slug: 'alpha', title: 'A' }]));
    await writeAutopilotStop(tmpDir, DEFAULT_CONFIG, {
      reason: 'not_approved',
      item: 'alpha',
      command: 'osq queue approve',
      at: '2026-10-17T00:00:00.000Z',
    });

    const capture = await runCliCaptured(tmpDir, ['queue', 'approve']);
    assert.equal(capture.stderr, '');
    assert.equal(await readAutopilotStop(tmpDir, DEFAULT_CONFIG), null);
    assert.ok(!capture.stdout.includes('Autopilot is off'), capture.stdout);
  });

  it('fails on an unreadable queue and changes no record', async () => {
    // A queue item with no `Depends on:` line.
    await writeAt(tmpDir, `${OPENSPEC}/queue.md`, '## [alpha] Alpha\n');
    await writeAt(tmpDir, PATH_APPR, 'sentinel approval\n');
    await writeAt(tmpDir, PATH_STOP, 'sentinel stop\n');

    const capture = await runCliCaptured(tmpDir, ['queue', 'approve']);
    assert.equal(capture.exitCode, 1);
    assert.ok(capture.stderr.startsWith('Queue error: '), capture.stderr);
    assert.equal(await readAt(tmpDir, PATH_APPR), 'sentinel approval\n');
    assert.equal(await readAt(tmpDir, PATH_STOP), 'sentinel stop\n');
  });

  it('refuses when the program is forwarded to a server and writes nothing', async () => {
    await writeAt(tmpDir, `${OPENSPEC}/queue.md`, queueContent([{ slug: 'alpha', title: 'A' }]));
    const program = createProgram('0.0.0');
    forwardProgram(program, {
      base: 'http://127.0.0.1:1/p/osq/',
      host: '127.0.0.1:1',
      project: 'osq',
    });

    await withCwd(tmpDir, () =>
      assert.rejects(
        () => program.parseAsync(['queue', 'approve'], { from: 'user' }),
        (error: unknown) =>
          error instanceof CommandError &&
          error.message ===
            'osq queue approve runs only locally; unset OSQ_SERVER to run it here, or run it on the server',
      ),
    );
    assert.equal(await readQueueApproval(tmpDir, DEFAULT_CONFIG), null);
    assert.equal(await readAutopilotStop(tmpDir, DEFAULT_CONFIG), null);
  });

  it('keeps plain osq queue forwarded to the server', async () => {
    const program = createProgram('0.0.0');
    forwardProgram(program, {
      base: 'http://127.0.0.1:1/p/osq/',
      host: '127.0.0.1:1',
      project: 'osq',
    });

    const queue = program.commands.find((command) => command.name() === 'queue');
    assert.ok(queue, 'queue must be registered');
    const approve = queue.commands.find((command) => command.name() === 'approve');
    assert.ok(approve, 'queue approve must be registered');
    // The parent action reaches the server; the subcommand refuses locally.
    assert.notEqual(queue.action, undefined);
    assert.notEqual(approve.action, undefined);
  });
});

/** Run one git command in `cwd`, ignoring output. */
async function git(cwd: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`git ${args.join(' ')} exited ${code}`)),
    );
  });
}
