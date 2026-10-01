import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CommandError } from '../src/cli/command-error.js';
import { digestCommand } from '../src/cli/digest.js';
import { createProgram } from '../src/cli/index.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';

const ARCHIVE_DIR = path.join('openspec', 'changes', 'archive');
const APPROVED_AT = '2026-09-28T11:58:00.000Z';
const ARCHIVED_AT = '2026-09-28T12:00:00.000Z';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-digest-command-'));
  roots.push(root);
  return root;
}

async function writeFile(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

const DELTA = [
  '# Spec Delta: CAPABILITY',
  '',
  '## ADDED Requirements',
  '',
  '### Requirement: Added one',
  '',
  'Text.',
  '',
  '## MODIFIED Requirements',
  '',
  '### Requirement: Modified one',
  '',
  'Text.',
  '',
  '## REMOVED Requirements',
  '',
  '### Requirement: Removed one',
  '',
  'Text.',
  '',
  '## RENAMED Requirements',
  '',
  '- FROM: `### Requirement: Old name`',
  '- TO: `### Requirement: New name`',
  '',
].join('\n');

interface ArchiveOptions {
  readonly title?: string;
  readonly goal?: string;
  readonly decisions?: readonly string[];
  readonly capabilities?: readonly string[];
  readonly cost?: readonly [number, number];
  readonly models?: readonly [string, string];
  readonly dead?: boolean;
  readonly halt?: boolean;
}

async function writeArchive(
  root: string,
  folder: string,
  options: ArchiveOptions = {},
): Promise<void> {
  const base = path.join(ARCHIVE_DIR, folder);
  const decisions = options.decisions ?? [];
  const proposal = [
    '---',
    `title: ${options.title ?? folder}`,
    '---',
    '## Goal',
    '',
    options.goal ?? 'Do the thing.',
    '',
    ...(options.decisions === undefined
      ? []
      : ['## Decisions', '', ...decisions.map((number) => `- ADR ${number}: follow it.`), '']),
  ].join('\n');
  await writeFile(root, path.join(base, 'proposal.md'), proposal);
  for (const capability of options.capabilities ?? []) {
    await writeFile(
      root,
      path.join(base, 'specs', capability, 'spec.md'),
      DELTA.replace('CAPABILITY', capability),
    );
  }
  await writeFile(root, path.join(base, 'tasks', '1.md'), '# Task 1\n');
  await writeFile(root, path.join(base, 'tasks', '2.md'), '# Task 2\n');
  await writeFile(root, path.join(base, '.run', 'approved'), '');
  await writeFile(
    root,
    path.join(base, '.run', 'manifest.json'),
    JSON.stringify({ approvedAt: APPROVED_AT, planner: 'planner-model' }),
  );
  const [costOne, costTwo] = options.cost ?? [1.25, 0.75];
  const [modelOne, modelTwo] = options.models ?? ['model-a', 'model-b'];
  const events: unknown[] = [
    { type: 'tool', data: { summary: 'TOOL_SECRET' } },
    { type: 'verify_ran', data: { exitCode: 0, output: 'VERIFY_SECRET' } },
    { type: 'started', data: { model: modelOne } },
    { type: 'tokens', data: { cost: costOne } },
    ...(options.dead ? [{ type: 'dead', data: { task: '1', reason: 'scope_violation' } }] : []),
    ...(options.halt ? [{ type: 'retry', data: {} }] : []),
    { type: 'started', data: { model: modelTwo } },
    { type: 'tokens', data: { cost: costTwo } },
    { type: 'done' },
  ];
  await writeFile(
    root,
    path.join(base, '.run', 'events', '1.jsonl'),
    `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
  );
  await writeFile(root, path.join(base, '.run', 'results', '1.md'), 'RESULT_SECRET body.\n');
  await writeFile(
    root,
    path.join(base, '.run', 'events', 'change.jsonl'),
    `${JSON.stringify({ type: 'archived', timestamp: ARCHIVED_AT, data: {} })}\n`,
  );
}

async function writeDecision(root: string, number: string, date: string): Promise<void> {
  const adr = [
    '---',
    'status: accepted',
    'applies_to: all',
    'rule: Follow the rule.',
    '---',
    `# ${number}. Digest rule`,
    '',
    `Date: ${date}.`,
    '',
  ].join('\n');
  await writeFile(root, path.join('decisions', `${number}-digest-rule.md`), adr);
}

async function writeCompleteArchive(root: string): Promise<string> {
  await writeArchive(root, '001-complete', {
    title: 'A recorded change',
    goal: 'First line of the goal.\nSecond line.',
    decisions: ['007'],
    capabilities: ['cli-foundation'],
    dead: true,
    halt: true,
  });
  await writeDecision(root, '007', '2026-09-28');
  return path.join(root, ARCHIVE_DIR, '001-complete');
}

const COMPLETE_MARKDOWN = [
  '# osq digest: 001',
  '',
  '## 001 A recorded change',
  '',
  'Archived: 2026-09-28',
  '',
  '### Goal',
  '',
  'First line of the goal.',
  'Second line.',
  '',
  '### Requirements',
  '',
  '#### cli-foundation',
  '',
  '- Added: Added one',
  '- Modified: Modified one',
  '- Removed: Removed one',
  '- Renamed: Old name → New name',
  '',
  '### Decisions',
  '',
  '- ADR 007: Follow the rule.',
  '',
  '### Tasks',
  '',
  '- Tasks: 2',
  '- Attempts: 2',
  '- Dead: task 1 (scope_violation)',
  '- Halts that needed a human: 1',
  '',
  '### Run',
  '',
  '- Elapsed: 2m',
  '- Cost: $2.00',
  '- Models: model-a, model-b; planner planner-model',
].join('\n');

describe('osq digest command', () => {
  it('renders every field of a fixture archive in Markdown', async () => {
    const root = await makeRoot();
    await writeCompleteArchive(root);

    const output = await digestCommand({
      cwd: root,
      config: DEFAULT_CONFIG,
      ids: ['001'],
      stdout: () => {},
    });

    assert.equal(output, COMPLETE_MARKDOWN);
  });

  it('emits a JSON document with stable ids and period null', async () => {
    const root = await makeRoot();
    await writeCompleteArchive(root);

    const output = await digestCommand({
      cwd: root,
      config: DEFAULT_CONFIG,
      ids: ['001'],
      json: true,
      stdout: () => {},
    });
    const doc = JSON.parse(output);

    assert.equal(doc.schemaVersion, 1);
    assert.equal(doc.period, null);
    assert.deepEqual(doc.selection, { kind: 'ids', ids: ['001'] });
    assert.equal(doc.changes.length, 1);
    assert.equal(doc.changes[0].id, '001');
    assert.equal(doc.changes[0].capabilities[0].added[0].id, '001/cli-foundation/added/Added one');
    assert.deepEqual(doc.changes[0].capabilities[0].renamed[0], {
      id: '001/cli-foundation/renamed/New name',
      name: 'New name',
      from: 'Old name',
    });
    assert.deepEqual(doc.changes[0].decisions[0], {
      id: 'ADR-007',
      number: '007',
      rule: 'Follow the rule.',
    });
  });

  it('keeps no path, tool summary, verify output, or result body', async () => {
    const root = await makeRoot();
    const folder = await writeCompleteArchive(root);
    const markdown = await digestCommand({
      cwd: root,
      config: DEFAULT_CONFIG,
      ids: ['001'],
      stdout: () => {},
    });
    const json = await digestCommand({
      cwd: root,
      config: DEFAULT_CONFIG,
      ids: ['001'],
      json: true,
      stdout: () => {},
    });

    for (const output of [markdown, json]) {
      for (const forbidden of [
        'TOOL_SECRET',
        'VERIFY_SECRET',
        'RESULT_SECRET',
        root,
        folder,
        '001-complete',
      ]) {
        assert.equal(output.includes(forbidden), false, `leaked ${forbidden}`);
      }
    }
  });

  it('prints the same bytes on repeated Markdown and JSON runs', async () => {
    const root = await makeRoot();
    await writeCompleteArchive(root);
    const run = (json: boolean) =>
      digestCommand({ cwd: root, config: DEFAULT_CONFIG, ids: ['001'], json, stdout: () => {} });

    const firstMarkdown = await run(false);
    const secondMarkdown = await run(false);
    const firstJson = await run(true);
    const secondJson = await run(true);

    assert.equal(firstMarkdown, secondMarkdown);
    assert.equal(firstJson, secondJson);
  });

  it('writes the digest to --out and prints nothing', async () => {
    const root = await makeRoot();
    await writeCompleteArchive(root);
    let printed = '';
    const output = await digestCommand({
      cwd: root,
      config: DEFAULT_CONFIG,
      ids: ['001'],
      out: 'digest.md',
      stdout: (msg) => {
        printed = msg;
      },
    });

    assert.equal(printed, '');
    const written = await fs.readFile(path.join(root, 'digest.md'), 'utf8');
    assert.equal(written, `${output}\n`);
    assert.equal(written, `${COMPLETE_MARKDOWN}\n`);
  });

  it('says so in Markdown for an empty range', async () => {
    const root = await makeRoot();
    await writeArchive(root, '001-old', {});
    await writeFile(
      root,
      path.join(ARCHIVE_DIR, '001-old', '.run', 'events', 'change.jsonl'),
      `${JSON.stringify({ type: 'archived', timestamp: '2026-09-01T00:00:00.000Z', data: {} })}\n`,
    );

    const sinceOnly = await digestCommand({
      cwd: root,
      config: DEFAULT_CONFIG,
      ids: [],
      since: '2026-10-01',
      stdout: () => {},
    });
    assert.equal(
      sinceOnly,
      '# osq digest: since 2026-10-01\n\nNo changes archived since 2026-10-01.',
    );

    const bounded = await digestCommand({
      cwd: root,
      config: DEFAULT_CONFIG,
      ids: [],
      since: '2026-10-01',
      until: '2026-10-05',
      stdout: () => {},
    });
    assert.equal(
      bounded,
      '# osq digest: 2026-10-01 to 2026-10-05\n\nNo changes archived from 2026-10-01 to 2026-10-05.',
    );
  });

  it('leaves out every cost and model with --no-cost', async () => {
    const root = await makeRoot();
    await writeCompleteArchive(root);
    for (const json of [false, true]) {
      const output = await digestCommand({
        cwd: root,
        config: DEFAULT_CONFIG,
        ids: ['001'],
        json,
        cost: false,
        stdout: () => {},
      });
      for (const forbidden of ['Cost', '$', 'model-a', 'model-b', 'planner']) {
        assert.equal(output.includes(forbidden), false, `leaked ${forbidden} (json=${json})`);
      }
    }
  });

  it('turns a selection refusal into a CommandError', async () => {
    const root = await makeRoot();
    await assert.rejects(
      digestCommand({ cwd: root, config: DEFAULT_CONFIG, ids: [] }),
      (error: unknown) => {
        assert.ok(error instanceof CommandError);
        assert.equal(error.message, 'Give change ids or --since <date>');
        return true;
      },
    );
  });

  it('registers digest with its five options', () => {
    const program = createProgram();
    const digest = program.commands.find((command) => command.name() === 'digest');

    assert.ok(digest);
    const longs = digest.options.map((option) => option.long);
    for (const flag of ['--since', '--until', '--json', '--out', '--no-cost']) {
      assert.ok(longs.includes(flag), `missing ${flag}`);
    }
  });

  it("digests this repository's own archive for 129", async () => {
    const output = await digestCommand({
      cwd: repoRoot,
      config: DEFAULT_CONFIG,
      ids: ['129'],
      stdout: () => {},
    });

    assert.ok(
      output.includes('A change the default branch stops also ends at plan it, archived or not'),
    );
    assert.ok(
      output.includes('128 made a stuck, blocked, or regressed task end at one action: `osq plan'),
    );
    assert.equal(output.includes(repoRoot), false);
    assert.equal(output.includes('/home/'), false);
  });
});
