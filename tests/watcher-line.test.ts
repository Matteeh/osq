import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { inboxCommand } from '../src/cli/inbox.js';
import { statusCommand } from '../src/cli/status.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import {
  type ServiceRecord,
  type WatchState,
  type WatcherRecord,
  watchStateDir,
  writeServiceRecord,
  writeWatcherRecord,
} from '../src/core/run/watch-state.js';
import { type Inbox, formatInboxText } from '../src/core/status/inbox.js';
import { formatWatcherLine } from '../src/core/status/watcher-line.js';

const LOG = '/home/u/.osq/watch/abc/watch.log';
const SERVICE: ServiceRecord = {
  pid: 4100,
  startedAt: '2026-01-01T00:00:00.000Z',
  log: LOG,
};
const WATCHER: WatcherRecord = {
  pid: 4200,
  mode: 'terminal',
  version: '0.2.4',
  commit: 'f532410',
  startedAt: '2026-01-01T00:00:00.000Z',
  waiting: null,
};

function state(partial: Partial<WatchState>): WatchState {
  return { service: null, watcher: null, log: LOG, logExists: false, ...partial };
}

describe('formatWatcherLine', () => {
  it('renders a background service with its build', () => {
    assert.equal(
      formatWatcherLine(state({ service: SERVICE, watcher: WATCHER })),
      'Watcher: running in the background, osq v0.2.4 (f532410), pid 4100',
    );
  });

  it('renders a service without a live watcher as restarting', () => {
    assert.equal(
      formatWatcherLine(state({ service: SERVICE })),
      'Watcher: restarting in the background, pid 4100',
    );
  });

  it('renders a terminal watcher', () => {
    assert.equal(
      formatWatcherLine(state({ watcher: WATCHER })),
      'Watcher: running in a terminal, osq v0.2.4 (f532410), pid 4200',
    );
  });

  it('renders nothing running', () => {
    assert.equal(formatWatcherLine(state({})), 'Watcher: not running — osq watch --background');
  });

  it('ends with the waiting reason for a background and a terminal watcher', () => {
    const waiting: WatcherRecord = { ...WATCHER, waiting: 'a new osq build is being written' };
    assert.equal(
      formatWatcherLine(state({ service: SERVICE, watcher: waiting })),
      'Watcher: running in the background, osq v0.2.4 (f532410), pid 4100, waiting: a new osq build is being written',
    );
    assert.ok(
      formatWatcherLine(state({ watcher: waiting })).endsWith(
        ', waiting: a new osq build is being written',
      ),
    );
  });

  it('adds no suffix when the live watcher has no waiting reason', () => {
    assert.ok(
      !formatWatcherLine(state({ service: SERVICE, watcher: WATCHER })).includes('waiting'),
    );
  });
});

describe('formatInboxText entirely empty inbox', () => {
  it('returns the single line Inbox empty.', () => {
    const inbox: Inbox = { needsYou: [], running: [], landed: [] };
    assert.equal(formatInboxText(inbox), 'Inbox empty.');
  });
});

describe('watcher line in the commands', () => {
  let project: string;
  let home: string;

  beforeEach(async () => {
    project = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-watcher-line-'));
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-watcher-line-home-'));
  });

  afterEach(async () => {
    await fs.rm(project, { recursive: true, force: true });
    await fs.rm(home, { recursive: true, force: true });
  });

  function capture(): { read(): string; write(text: string): void } {
    let output = '';
    return {
      read: () => output,
      write: (text: string) => {
        output += text;
      },
    };
  }

  it('prints the inbox text, then the live background watcher line, from osq', async () => {
    await writeServiceRecord(project, { ...SERVICE, pid: process.pid }, home);
    await writeWatcherRecord(project, { ...WATCHER, pid: process.pid, mode: 'background' }, home);

    const out = capture();
    await inboxCommand({ cwd: project, config: DEFAULT_CONFIG, home, stdout: out.write });
    const lines = out.read().trimEnd().split('\n');

    assert.equal(lines[0], 'Inbox empty.');
    assert.equal(
      lines[lines.length - 1],
      `Watcher: running in the background, osq v0.2.4 (f532410), pid ${process.pid}`,
    );
  });

  it('prints the waiting reason after the terminal watcher line', async () => {
    await writeWatcherRecord(
      project,
      { ...WATCHER, pid: process.pid, waiting: 'a new osq build is being written' },
      home,
    );

    const out = capture();
    await inboxCommand({ cwd: project, config: DEFAULT_CONFIG, home, stdout: out.write });
    const last = out.read().trimEnd().split('\n').at(-1) as string;

    assert.equal(
      last,
      `Watcher: running in a terminal, osq v0.2.4 (f532410), pid ${process.pid}, waiting: a new osq build is being written`,
    );
  });

  it('leaves osq --json unchanged without the watcher line', async () => {
    await writeServiceRecord(project, { ...SERVICE, pid: process.pid }, home);
    await writeWatcherRecord(project, { ...WATCHER, pid: process.pid }, home);

    const out = capture();
    await inboxCommand({
      cwd: project,
      config: DEFAULT_CONFIG,
      home,
      json: true,
      stdout: out.write,
    });
    const parsed = JSON.parse(out.read()) as Inbox;

    assert.deepEqual(Object.keys(parsed), ['needsYou', 'running', 'landed']);
    assert.ok(!out.read().includes('Watcher:'));
  });

  it('ends osq and osq --json with the not-running line only in text', async () => {
    const text = capture();
    await inboxCommand({ cwd: project, config: DEFAULT_CONFIG, home, stdout: text.write });
    assert.equal(
      text.read().trimEnd().split('\n').at(-1),
      'Watcher: not running — osq watch --background',
    );

    const json = capture();
    await inboxCommand({
      cwd: project,
      config: DEFAULT_CONFIG,
      home,
      json: true,
      stdout: json.write,
    });
    assert.deepEqual(Object.keys(JSON.parse(json.read()) as Inbox), [
      'needsYou',
      'running',
      'landed',
    ]);
  });

  it('prints the status overview, an empty line, the watcher line, and the log path', async () => {
    await writeServiceRecord(project, { ...SERVICE, pid: process.pid }, home);
    await writeWatcherRecord(project, { ...WATCHER, pid: process.pid, mode: 'background' }, home);
    const stateDir = await watchStateDir(project, home);
    const logPath = path.join(stateDir, 'watch.log');
    await fs.writeFile(logPath, 'service log\n', 'utf8');

    const out = capture();
    await statusCommand({ cwd: project, config: DEFAULT_CONFIG, home, stdout: out.write });
    const lines = out.read().trimEnd().split('\n');

    assert.equal(lines[0], 'Active specs:');
    assert.equal(
      lines[lines.length - 2],
      `Watcher: running in the background, osq v0.2.4 (f532410), pid ${process.pid}`,
    );
    assert.equal(lines[lines.length - 1], `Log: ${logPath}`);
    assert.equal(lines[lines.length - 3], '');
  });

  it('prints no Log line when watch.log does not exist', async () => {
    await writeWatcherRecord(project, { ...WATCHER, pid: process.pid }, home);

    const out = capture();
    await statusCommand({ cwd: project, config: DEFAULT_CONFIG, home, stdout: out.write });
    const lines = out.read().trimEnd().split('\n');

    assert.equal(
      lines[lines.length - 1],
      `Watcher: running in a terminal, osq v0.2.4 (f532410), pid ${process.pid}`,
    );
  });

  it('writes no watch record itself', async () => {
    const out = capture();
    await inboxCommand({ cwd: project, config: DEFAULT_CONFIG, home, stdout: out.write });
    await statusCommand({ cwd: project, config: DEFAULT_CONFIG, home, stdout: out.write });

    const stateDir = await watchStateDir(project, home);
    await assert.rejects(() => fs.stat(path.join(stateDir, 'service.json')));
    await assert.rejects(() => fs.stat(path.join(stateDir, 'watcher.json')));
  });
});
