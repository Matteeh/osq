import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { inboxDispatchCommand } from '../src/cli/inbox-dispatch.js';
import { createProgram } from '../src/cli/index.js';
import { defineConfig } from '../src/core/foundation/config.js';
import { formatDispatchText } from '../src/core/status/dispatch-text.js';
import { readDispatch, readDispatchQueue } from '../src/core/status/dispatch.js';

const CHANGES = path.join('openspec', 'changes');

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-dispatch-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function proposalMd(title: string, goal: string, dependsOn: readonly string[] = []): string {
  const deps = dependsOn.map((id) => JSON.stringify(id)).join(', ');
  return [
    '---',
    `title: ${title}`,
    `depends_on: [${deps}]`,
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

interface ChangeOptions {
  readonly dependsOn?: readonly string[];
  readonly goal?: string;
}

async function createChange(
  root: string,
  folderName: string,
  title: string,
  options: ChangeOptions = {},
): Promise<string> {
  const dir = path.join(root, CHANGES, folderName);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(dir, 'proposal.md'),
    proposalMd(title, options.goal ?? `${title} goal.`, options.dependsOn ?? []),
    'utf8',
  );
  await fs.writeFile(path.join(dir, 'tasks', '1.md'), taskMd('Task one'), 'utf8');
  return dir;
}

async function approve(folderPath: string): Promise<void> {
  await fs.mkdir(path.join(folderPath, '.run'), { recursive: true });
  await fs.writeFile(path.join(folderPath, '.run', 'approved'), 'sha256:fixture\n', 'utf8');
}

async function writeMarker(folderPath: string, rel: string, content: string): Promise<void> {
  const target = path.join(folderPath, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

interface Collector {
  readonly text: () => string;
  readonly write: (msg: string) => void;
}

function collector(): Collector {
  let buffer = '';
  return {
    text: () => buffer,
    write: (msg: string) => {
      buffer += msg;
    },
  };
}

/**
 * An idle project whose approval change two others depend on, plus a halt.
 * The two dependants are approved but blocked, so the watcher stays idle.
 */
async function buildIdleProject(): Promise<void> {
  await createChange(tmpDir, '001-base', 'Base', {
    goal: 'Approve me first. Then the rest.',
  });
  const one = await createChange(tmpDir, '002-dep', 'Dep', { dependsOn: ['001'] });
  const two = await createChange(tmpDir, '003-dep', 'Dep two', { dependsOn: ['001'] });
  await approve(one);
  await approve(two);
  const dead = await createChange(tmpDir, '004-dead', 'Dead');
  await approve(dead);
  await writeMarker(
    dead,
    path.join('.run', 'dead', '1.md'),
    '---\nreason: verify_red\n---\nboom\n',
  );
}

describe('osq inbox ordered list and first card', () => {
  it('lists approval first, then halt, and prints the first card', async () => {
    await buildIdleProject();
    const config = defineConfig({});

    const preview = await readDispatch(tmpDir, config);
    assert.equal(preview.watcherIdle, true);
    assert.deepEqual(
      preview.items.map((item) => `${item.kind}:${item.change.id}`),
      ['approval:001', 'halt:004'],
    );
    assert.equal(preview.card?.kind, 'approval');
    assert.equal(preview.items[0].weight, 3);
    assert.equal(preview.items[0].reason, 'watcher idle; this gives it work; holds up 2 changes');

    const lines = formatDispatchText(preview).split('\n');
    assert.equal(lines[0], 'Needs you (2):');
    assert.equal(
      lines[1],
      '  1. approval 001 Base (watcher idle; this gives it work; holds up 2 changes)',
    );
    assert.equal(
      lines[2],
      '  2. halt 004 Dead task 1: Task one (watcher idle; this gives it work)',
    );
    assert.equal(lines[3], '');
    assert.equal(lines[4], 'approval: 001-base');
    assert.equal(lines[5], '  why: watcher idle; this gives it work; holds up 2 changes');
    assert.ok(lines.includes('Goal: Approve me first. Then the rest.'));

    const actions = lines.indexOf('Actions:');
    assert.ok(actions > 0);
    assert.equal(lines[actions + 1], '  osq approve 001');
    assert.equal(lines[actions + 2], '  osq show 001');

    const out = collector();
    await inboxDispatchCommand({ cwd: tmpDir, config, stdout: out.write });
    assert.equal(out.text(), `${formatDispatchText(preview)}\n`);
  });

  it('lists a halt task with its attempts, output, and commands', async () => {
    const dead = await createChange(tmpDir, '004-dead', 'Dead');
    await approve(dead);
    await writeMarker(
      dead,
      path.join('.run', 'dead', '1.md'),
      '---\nreason: verify_red\n---\nboom\n',
    );
    await writeMarker(
      dead,
      path.join('.run', 'events', '1.jsonl'),
      `${JSON.stringify({ type: 'started' })}\n${JSON.stringify({ type: 'started' })}\n`,
    );

    const config = defineConfig({});
    const text = formatDispatchText(await readDispatch(tmpDir, config));
    assert.ok(text.includes('halt: 004-dead'));
    assert.ok(text.includes('  task 1: Task one'));
    assert.ok(text.includes('  reason: verify_red'));
    assert.ok(text.includes('  attempts: 2'));
    assert.ok(text.includes('    boom'));
    assert.ok(text.includes('  osq retry 004 1'));
  });
});

describe('osq inbox JSON output', () => {
  it('carries watcherIdle and every item with a card', async () => {
    await buildIdleProject();
    const config = defineConfig({});
    const out = collector();

    await inboxDispatchCommand({ cwd: tmpDir, config, json: true, stdout: out.write });
    const parsed = JSON.parse(out.text()) as {
      watcherIdle: boolean;
      items: Array<{ kind: string; card: { kind: string } }>;
    };

    assert.equal(parsed.watcherIdle, true);
    assert.deepEqual(
      parsed.items.map((item) => `${item.kind}:${item.card.kind}`),
      ['approval:approval', 'halt:halt'],
    );
    assert.deepEqual(Object.keys(parsed.items[0]).sort(), [
      'card',
      'change',
      'commands',
      'kind',
      'reason',
      'task',
      'weight',
    ]);

    const queue = await readDispatchQueue(tmpDir, config);
    assert.equal(queue.items.length, 2);
    assert.ok(queue.items.every((item) => item.card !== undefined));
  });
});

describe('osq inbox empty output', () => {
  it('prints Nothing needs you. when nothing needs a human', async () => {
    const out = collector();
    await inboxDispatchCommand({ cwd: tmpDir, config: defineConfig({}), stdout: out.write });
    assert.equal(out.text(), 'Nothing needs you.\n');

    const config = defineConfig({});
    assert.equal(formatDispatchText(await readDispatch(tmpDir, config)), 'Nothing needs you.');
  });
});

describe('osq inbox registration', () => {
  it('registers inbox with --json and leaves bare osq unchanged', () => {
    const program = createProgram();
    const inbox = program.commands.find((command) => command.name() === 'inbox');

    assert.ok(inbox, 'an inbox command is registered');
    assert.ok(inbox.options.some((option) => option.long === '--json'));
    assert.equal(inbox.registeredArguments.length, 0);

    assert.ok(program.options.some((option) => option.long === '--json'));
    assert.equal(
      typeof (program as unknown as { _actionHandler?: unknown })._actionHandler,
      'function',
      'bare osq still runs the attention inbox',
    );
    assert.ok(!program.commands.some((command) => command.name() === 'inboxCommand'));
  });
});
