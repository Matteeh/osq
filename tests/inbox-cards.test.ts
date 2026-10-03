import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { inboxDispatchCommand } from '../src/cli/inbox-dispatch.js';
import { createTerminalInput } from '../src/cli/inbox-terminal.js';
import { defineConfig } from '../src/core/foundation/config.js';
import type { CardInput, Launcher } from '../src/core/status/dispatch-session.js';
import { formatDispatchText } from '../src/core/status/dispatch-text.js';
import { readDispatch } from '../src/core/status/dispatch.js';

const CHANGES = path.join('openspec', 'changes');

let tmpDir: string;
let home: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-cards-'));
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-cards-home-'));
});

afterEach(async () => {
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

async function createChange(root: string, folderName: string, title: string): Promise<string> {
  const dir = path.join(root, CHANGES, folderName);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(title, `${title} goal.`), 'utf8');
  await fs.writeFile(path.join(dir, 'tasks', '1.md'), taskMd('Task one'), 'utf8');
  return dir;
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

describe('osq inbox on a terminal', () => {
  it('runs the card session and shows the approval card with its keys', async () => {
    await createChange(tmpDir, '001-base', 'Base');
    const config = defineConfig({});
    const out = collector();
    const launched: string[][] = [];
    const launch: Launcher = async (args) => {
      launched.push([...args]);
      return 0;
    };

    await inboxDispatchCommand({
      cwd: tmpDir,
      config,
      home,
      isTerminal: () => true,
      input: scriptedInput(['q']),
      launch,
      stdout: out.write,
    });

    const text = out.text();
    assert.deepEqual(launched, []);
    assert.ok(text.startsWith('Needs you (1):'));
    assert.ok(text.includes('approval: 001-base'));
    assert.ok(text.includes('Keys:'));
    assert.ok(text.includes('  a  osq approve 001'));
    assert.ok(text.includes('  s  osq show 001'));
    assert.ok(text.includes('  n  skip'));
    assert.ok(text.includes('  q  quit'));
  });

  it('prints the text view when there is no terminal', async () => {
    await createChange(tmpDir, '001-base', 'Base');
    const config = defineConfig({});
    const out = collector();
    let inputUsed = false;
    const input: CardInput = {
      async key() {
        inputUsed = true;
        return null;
      },
      async line() {
        inputUsed = true;
        return null;
      },
    };

    await inboxDispatchCommand({
      cwd: tmpDir,
      config,
      isTerminal: () => false,
      input,
      launch: async () => {
        inputUsed = true;
        return 1;
      },
      stdout: out.write,
    });

    assert.equal(inputUsed, false);
    assert.equal(out.text(), `${formatDispatchText(await readDispatch(tmpDir, config))}\n`);
  });

  it('prints JSON instead of the session when json is set', async () => {
    await createChange(tmpDir, '001-base', 'Base');
    const out = collector();

    await inboxDispatchCommand({
      cwd: tmpDir,
      config: defineConfig({}),
      isTerminal: () => true,
      json: true,
      input: scriptedInput(['q']),
      launch: async () => 0,
      stdout: out.write,
    });

    assert.equal(out.text().startsWith('Needs you'), false);
    assert.equal((JSON.parse(out.text()) as { watcherIdle: boolean }).watcherIdle, true);
  });
});

describe('createTerminalInput', () => {
  it('turns raw mode on before a key read and off after it', async () => {
    const { stream, modes } = recordingStream();
    const input = createTerminalInput(stream);

    const pending = input.key();
    assert.deepEqual(modes, [true]);
    stream.write('a');
    assert.equal(await pending, 'a');
    assert.deepEqual(modes, [true, false]);
  });

  it('reads a key from a stream without setRawMode', async () => {
    const stream = new PassThrough();
    const input = createTerminalInput(stream);

    const pending = input.key();
    stream.write('b');
    assert.equal(await pending, 'b');
  });

  it('writes the question to stdout and reads a line with raw mode off', async () => {
    const { stream, modes } = recordingStream();
    const questions: string[] = [];
    const input = createTerminalInput(stream, (text) => questions.push(text));

    const pending = input.line('Reason: ');
    assert.deepEqual(modes, [false]);
    stream.write('wrong approach\n');
    assert.equal(await pending, 'wrong approach');
    assert.deepEqual(questions, ['Reason: ']);
    assert.equal(modes.includes(true), false);
  });
});
