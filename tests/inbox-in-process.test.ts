import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CommandError } from '../src/cli/command-error.js';
import { type ActionInputs, createActionLauncher } from '../src/cli/inbox-actions.js';
import { inboxDispatchCommand } from '../src/cli/inbox-dispatch.js';
import { createTerminalInput } from '../src/cli/inbox-terminal.js';
import { defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import type { CardInput, Launcher } from '../src/core/status/dispatch-session.js';
import { restoreEnv } from './planning-observed-helpers.js';

const CHANGES = path.join('openspec', 'changes');

let tmpDir: string;
let home: string;

beforeEach(async () => {
  restoreEnv();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-in-process-'));
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-in-process-home-'));
  process.env.CODEX_HOME = path.join(tmpDir, 'missing-codex');
  process.env.OSQ_CLAUDE_PROJECTS_DIR = path.join(tmpDir, 'missing-claude');
  process.env.CLAUDE_CONFIG_DIR = path.join(tmpDir, 'missing-claude-config');
  process.env.OPENCODE_PATH = path.join(tmpDir, 'missing-opencode');
});

afterEach(async () => {
  restoreEnv();
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.rm(home, { recursive: true, force: true });
});

function proposalMd(title: string, goal: string): string {
  return [
    '---',
    `title: ${title}`,
    'depends_on: []',
    'verify: node verify.cjs',
    '---',
    '## Goal',
    goal,
    '',
    '## Surface',
    'None.',
    '',
    '## Human steps',
    'None',
    '',
  ].join('\n');
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

async function createChange(root: string, folderName: string, title: string): Promise<void> {
  const dir = path.join(root, CHANGES, folderName);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(title, `${title} goal.`), 'utf8');
  await fs.writeFile(path.join(dir, 'tasks', '1.md'), taskMd('Task one'), 'utf8');
}

interface Collector {
  readonly text: () => string;
  readonly write: (message: string) => void;
}

function collector(): Collector {
  let buffer = '';
  return {
    text: () => buffer,
    write: (message: string) => {
      buffer += message;
    },
  };
}

/** A scripted input that never asks a question. */
function scriptedInput(keys: (string | null)[]): CardInput {
  return {
    async key(): Promise<string | null> {
      return keys.length > 0 ? (keys.shift() as string | null) : null;
    },
    async line(): Promise<string | null> {
      return null;
    },
  };
}

/** A terminal stream whose raw-mode calls are recorded in order. */
function recordingStream(): {
  stream: PassThrough & { setRawMode: (mode: boolean) => PassThrough };
  modes: boolean[];
} {
  const stream = new PassThrough() as PassThrough & {
    setRawMode: (mode: boolean) => PassThrough;
  };
  const modes: boolean[] = [];
  stream.setRawMode = (mode: boolean): PassThrough => {
    modes.push(mode);
    return stream;
  };
  return { stream, modes };
}

const silentSound = { notify: (): void => undefined };

/** Run the card session on a scripted terminal and collect its output. */
async function runSession(
  keys: (string | null)[],
  launch?: Launcher,
): Promise<{ stdout: string; stderr: string }> {
  const out = collector();
  const err = collector();
  await inboxDispatchCommand({
    cwd: tmpDir,
    config: defineConfig({}),
    home,
    isTerminal: () => true,
    input: scriptedInput(keys),
    sound: silentSound,
    stdout: out.write,
    stderr: err.write,
    ...(launch ? { launch } : {}),
  });
  return { stdout: out.text(), stderr: err.text() };
}

describe('inbox card actions run in-process', () => {
  it('prints show in the same process', async () => {
    await createChange(tmpDir, '001-base', 'Base');

    const { stdout } = await runSession(['s', 'q']);

    const label = stdout.indexOf('── osq show 001 ──');
    const spec = stdout.indexOf('Spec: 001-');
    const exit = stdout.indexOf('── exit 0 ──');
    assert.ok(label !== -1, `expected the show label in:\n${stdout}`);
    assert.ok(spec !== -1, `expected osq show output in:\n${stdout}`);
    assert.ok(exit !== -1, `expected a zero exit in:\n${stdout}`);
    assert.ok(label < spec && spec < exit, 'show output must sit between the label and exit');
  });

  it('carries on after a failed approve', async () => {
    await createChange(tmpDir, '001-base', 'Base');
    const savedExitCode = process.exitCode;
    process.exitCode = 7;
    let stdout = '';
    let stderr = '';
    try {
      const result = await runSession(['a', 'q']);
      stdout = result.stdout;
      stderr = result.stderr;
      assert.equal(process.exitCode, 7, 'the launcher must not touch process.exitCode');
    } finally {
      process.exitCode = savedExitCode;
    }

    assert.ok(stderr.startsWith('Error approving 001:'), `stderr:\n${stderr}`);
    const next = stdout.indexOf('Next: ');
    const exit = stdout.indexOf('── exit 1 ──');
    assert.ok(next !== -1, `expected a Next: line in:\n${stdout}`);
    assert.ok(exit !== -1 && next < exit, `expected the Next: line before exit 1:\n${stdout}`);
    const cards = stdout.match(/Needs you \(1\):/g) ?? [];
    assert.ok(cards.length >= 2, `expected the card again after the failure:\n${stdout}`);
  });

  it('pauses the terminal between reads', async () => {
    await createChange(tmpDir, '001-base', 'Base');
    const { stream, modes } = recordingStream();
    stream.write('sq');
    const out = collector();
    const seen: { paused: boolean; listeners: number; raw: boolean | undefined }[] = [];
    const launch: Launcher = async () => {
      seen.push({
        paused: stream.isPaused(),
        listeners: stream.listenerCount('data'),
        raw: modes.at(-1),
      });
      return 0;
    };

    await inboxDispatchCommand({
      cwd: tmpDir,
      config: defineConfig({}),
      home,
      isTerminal: () => true,
      input: createTerminalInput(stream, out.write),
      launch,
      sound: silentSound,
      stdout: out.write,
      stderr: collector().write,
    });

    assert.deepEqual(seen, [{ paused: true, listeners: 0, raw: false }]);
  });
});

describe('createActionLauncher', () => {
  function launcherFor(
    cwd: string,
    config = defineConfig({}),
  ): {
    launcher: Launcher;
    stdout: Collector;
    stderr: Collector;
    inputs: ActionInputs;
  } {
    const stdout = collector();
    const stderr = collector();
    const inputs: ActionInputs = { cwd, config, stdout: stdout.write, stderr: stderr.write };
    return { launcher: createActionLauncher(inputs), stdout, stderr, inputs };
  }

  it('runs each verb through its command function', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-verbs-'));
    try {
      await scaffoldProject(root);
      const created = await createNewSpec(root, 'Plan Handoff');
      await fs.writeFile(path.join(created.folderPath, 'brief.md'), 'A brief.\n', 'utf8');

      const retry = launcherFor(root);
      assert.equal(await retry.launcher(['retry', '999', '1']), 1);
      assert.ok(retry.stderr.text().startsWith('Error retrying 999 1:'), retry.stderr.text());

      const reject = launcherFor(root);
      assert.equal(await reject.launcher(['reject', '999', '--reason', 'r']), 1);
      assert.ok(reject.stderr.text().startsWith('Error rejecting 999:'), reject.stderr.text());

      const show = launcherFor(root);
      assert.equal(await show.launcher(['show', '999']), 1);
      assert.ok(show.stderr.text().startsWith('Show error:'), show.stderr.text());

      const plan = launcherFor(root);
      assert.equal(await plan.launcher(['plan', created.specId]), 0);
      assert.ok(
        plan.stdout.text().includes(`ask your planning tool to plan change ${created.specId}-`),
        plan.stdout.text(),
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('handles failures without a command error', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-fail-'));
    try {
      const stdout = collector();
      const stderr = collector();
      const called: string[] = [];
      const inputs: ActionInputs = {
        cwd: root,
        config: defineConfig({}),
        stdout: stdout.write,
        stderr: stderr.write,
      };
      const launcher = createActionLauncher(inputs, {
        boom: () => {
          called.push('boom');
          throw new Error('boom');
        },
        silent: () => {
          called.push('silent');
          throw new CommandError('', { exitCode: 3 });
        },
      });

      assert.equal(await launcher(['boom']), 1);
      assert.equal(stderr.text(), 'Error: boom\n');

      assert.equal(await launcher(['silent']), 3);
      assert.equal(stderr.text(), 'Error: boom\n');

      assert.equal(await launcher(['land', '001']), 1);
      assert.equal(stderr.text(), 'Error: boom\nosq inbox: no action for land 001\n');
      assert.deepEqual(called, ['boom', 'silent']);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('keeps the call path out of node:child_process', async () => {
    for (const name of ['inbox-actions.ts', 'inbox-terminal.ts', 'inbox-dispatch.ts']) {
      const file = fileURLToPath(new URL(`../src/cli/${name}`, import.meta.url));
      const source = await fs.readFile(file, 'utf8');
      assert.equal(source.includes('node:child_process'), false, `${name} imports a child process`);
    }
  });
});
