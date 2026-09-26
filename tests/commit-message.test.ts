import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { formatCommitMessage, readCommitTrailers } from '../src/core/run/commit-message.js';

const CHANGE_NAME = '091-dead-path-building-blocks';
const TASK = '2';

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

/** A temporary change folder with an empty `.run/events` directory. */
async function makeChangeFolder(): Promise<string> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-commit-msg-'));
  tmpDirs.push(parent);
  const changeFolder = path.join(parent, CHANGE_NAME);
  await fs.mkdir(path.join(changeFolder, '.run', 'events'), { recursive: true });
  return changeFolder;
}

/** Write a task's event stream as jsonl, one raw line at a time. */
async function writeEvents(changeFolder: string, lines: string[]): Promise<void> {
  const eventsPath = path.join(changeFolder, '.run', 'events', `${TASK}.jsonl`);
  await fs.writeFile(eventsPath, `${lines.join('\n')}\n`, 'utf8');
}

function startedLine(harness: string, model: string, osqVersion: string): string {
  return JSON.stringify({
    type: 'started',
    timestamp: '2026-09-26T00:00:00.000Z',
    data: { harness, model, osqVersion, attempt: 1, timeoutSeconds: 1 },
  });
}

/** Parse a message's trailers exactly as git does, ignoring the body. */
function parseTrailers(message: string): string {
  return execFileSync('git', ['interpret-trailers', '--parse'], {
    input: message,
    encoding: 'utf8',
  }).trimEnd();
}

function buildMessage(trailers: Awaited<ReturnType<typeof readCommitTrailers>>): string {
  return formatCommitMessage({
    subject: 'osq: 091 task 2 dead, reason verify_red',
    title: 'When a task dies, osq commits its dead record',
    outcomeLine: '[dead] task 2 dead (reason: verify_red, elapsed: 3s)',
    trailers,
  });
}

describe('osq commit message', () => {
  it('Trailers parse', async () => {
    const changeFolder = await makeChangeFolder();
    await writeEvents(changeFolder, [
      startedLine('pi', 'deepseek-flash', '0.2.1'),
      startedLine('pi', 'deepseek-pro', '0.2.1'),
    ]);

    const message = buildMessage(await readCommitTrailers(changeFolder, TASK));

    assert.ok(message.endsWith('\n'), 'message ends with one newline');
    assert.equal(
      parseTrailers(message),
      [
        `Osq-Change: ${CHANGE_NAME}`,
        'Osq-Task: 2',
        'Osq-Model: pi deepseek-pro',
        'Osq-Version: 0.2.1',
      ].join('\n'),
    );
  });

  it('No started event leaves only the change and task trailers', async () => {
    const changeFolder = await makeChangeFolder();

    const message = buildMessage(await readCommitTrailers(changeFolder, TASK));

    assert.equal(parseTrailers(message), [`Osq-Change: ${CHANGE_NAME}`, 'Osq-Task: 2'].join('\n'));
    assert.ok(!message.includes('Osq-Model'), 'no model trailer');
    assert.ok(!message.includes('Osq-Version'), 'no version trailer');
  });

  it('Malformed lines are skipped', async () => {
    const changeFolder = await makeChangeFolder();
    await writeEvents(changeFolder, [
      'not json at all',
      '',
      '{"type":"started"',
      startedLine('pi', 'deepseek-flash', '0.2.1'),
      '[1, 2, 3]',
    ]);

    const trailers = await readCommitTrailers(changeFolder, TASK);

    assert.deepEqual(
      trailers.map((trailer) => [trailer.key, trailer.value]),
      [
        ['Osq-Change', CHANGE_NAME],
        ['Osq-Task', TASK],
        ['Osq-Model', 'pi deepseek-flash'],
        ['Osq-Version', '0.2.1'],
      ],
    );
  });

  it('A started event without the string fields counts as absent', async () => {
    const changeFolder = await makeChangeFolder();
    await writeEvents(changeFolder, [
      JSON.stringify({
        type: 'started',
        timestamp: '2026-09-26T00:00:00.000Z',
        data: { harness: 'pi', model: 7, osqVersion: '0.2.1' },
      }),
      JSON.stringify({
        type: 'started',
        timestamp: '2026-09-26T00:00:01.000Z',
        data: { attempt: 2, timeoutSeconds: 1 },
      }),
    ]);

    const trailers = await readCommitTrailers(changeFolder, TASK);

    assert.deepEqual(
      trailers.map((trailer) => [trailer.key, trailer.value]),
      [
        ['Osq-Change', CHANGE_NAME],
        ['Osq-Task', TASK],
      ],
    );
  });
});
