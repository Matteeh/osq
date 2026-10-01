import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { type CliCapture, runCliCaptured } from './cli-capture.js';

const ARCHIVE_DIR = path.join('openspec', 'changes', 'archive');
const ALPHA = '010-alpha';

const TABLE_LIST = [
  'changes(id, folder, title, archived_on, goal, tasks, attempts, halts, elapsed_seconds, cost, planner)',
  'requirements(change, capability, kind, requirement, renamed_from)',
  'tasks(change, task, title, attempts, done)',
  'dead_attempts(change, task, reason)',
  'disclosures(change, task, section, text)',
].join('\n');

const REFUSALS = [
  "insert into changes (id) values ('x')",
  'delete from changes',
  "update changes set title = 'x'",
  'pragma table_info(changes)',
  "attach database ':memory:' as other",
  'select * from sqlite_master',
  'select 1; delete from changes',
];

const STRINGS = (data: Record<string, unknown>): string => JSON.stringify(data);

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

/** A fresh temporary project root, removed after the test. */
async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-query-command-'));
  roots.push(root);
  return root;
}

/** Writes one file under the root, creating parent folders. */
async function write(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

const DELTA = `# Spec Delta: cli-foundation

## ADDED Requirements

### Requirement: Added thing

Text.
`;

/** One archived change with a requirement and all three real disclosures. */
async function writeArchive(root: string): Promise<void> {
  const base = path.join(ARCHIVE_DIR, ALPHA);
  await write(
    root,
    path.join(base, 'proposal.md'),
    '---\ntitle: Alpha change\n---\n## Goal\n\nDo the alpha thing.\n',
  );
  await write(root, path.join(base, 'specs', 'cli-foundation', 'spec.md'), DELTA);
  await write(
    root,
    path.join(base, 'tasks', '1.md'),
    '---\ntitle: First alpha task\n---\n# First\n',
  );
  await write(root, path.join(base, '.run', 'approved'), '');
  await write(
    root,
    path.join(base, '.run', 'manifest.json'),
    JSON.stringify({ planner: 'planner-alpha', approvedAt: '2026-10-01T08:00:00.000Z' }),
  );
  await write(
    root,
    path.join(base, '.run', 'events', 'change.jsonl'),
    `${STRINGS({ type: 'archived', timestamp: '2026-10-01T09:00:00.000Z', data: {} })}\n`,
  );
  await write(
    root,
    path.join(base, '.run', 'events', '1.jsonl'),
    [
      STRINGS({ type: 'started', data: {} }),
      STRINGS({ type: 'tokens', data: { cost: 0.5 } }),
      STRINGS({ type: 'done', data: {} }),
    ]
      .join('\n')
      .concat('\n'),
  );
  await write(root, path.join(base, '.run', 'done', '1'), '');
  await write(
    root,
    path.join(base, '.run', 'results', '1.md'),
    [
      '## Deviated',
      '',
      'line one',
      'line two',
      '',
      '## Missing context',
      '',
      `${root}/secret and ${os.homedir()}/secret`,
      '',
      'Touched: tasks/1.md',
      '',
    ].join('\n'),
  );
}

/** Every file under the root, keyed by its relative path. */
async function snapshot(root: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const walk = async (rel: string): Promise<void> => {
    for (const entry of await fs.readdir(path.join(root, rel), { withFileTypes: true })) {
      const child = path.join(rel, entry.name);
      if (entry.isDirectory()) await walk(child);
      else files.set(child, await fs.readFile(path.join(root, child), 'utf8'));
    }
  };
  await walk('.');
  return files;
}

/** The stdout lines of a captured run, joined by newlines. */
function stdoutText(capture: CliCapture): string {
  return capture.lines
    .filter((line) => line.stream === 'stdout')
    .map((line) => line.text)
    .join('\n');
}

/** The stderr lines of a captured run, joined by newlines. */
function stderrText(capture: CliCapture): string {
  return capture.lines
    .filter((line) => line.stream === 'stderr')
    .map((line) => line.text)
    .join('\n');
}

describe('osq query', () => {
  it('runs one SELECT and prints a header row with its rows', async () => {
    const root = await makeRoot();
    await writeArchive(root);

    const capture = await runCliCaptured(root, [
      'query',
      'select id, folder, title from changes order by folder',
    ]);

    assert.equal(capture.exitCode, undefined);
    assert.equal(
      stdoutText(capture),
      ['id\tfolder\ttitle', '010\t010-alpha\tAlpha change'].join('\n'),
    );
  });

  it('joins two history tables', async () => {
    const root = await makeRoot();
    await writeArchive(root);

    const capture = await runCliCaptured(root, [
      'query',
      'select changes.folder, requirements.requirement from changes ' +
        'join requirements on changes.folder = requirements.change ' +
        'order by requirements.requirement',
    ]);

    assert.equal(capture.exitCode, undefined);
    assert.equal(stdoutText(capture), ['folder\trequirement', '010-alpha\tAdded thing'].join('\n'));
  });

  it('runs a WITH statement', async () => {
    const root = await makeRoot();
    await writeArchive(root);

    const capture = await runCliCaptured(root, [
      'query',
      'with c as (select folder from changes) select folder from c',
    ]);

    assert.equal(capture.exitCode, undefined);
    assert.equal(stdoutText(capture), ['folder', '010-alpha'].join('\n'));
  });

  it('prints a JSON array of objects under --json', async () => {
    const root = await makeRoot();
    await writeArchive(root);

    const capture = await runCliCaptured(root, [
      'query',
      'select id, folder from changes',
      '--json',
    ]);

    assert.equal(capture.exitCode, undefined);
    assert.deepEqual(JSON.parse(stdoutText(capture)), [{ id: '010', folder: '010-alpha' }]);
  });

  it('prints a null as an empty field', async () => {
    const root = await makeRoot();
    await writeArchive(root);

    const capture = await runCliCaptured(root, [
      'query',
      "select renamed_from from requirements where kind = 'added'",
    ]);

    assert.equal(capture.exitCode, undefined);
    assert.equal(stdoutText(capture), 'renamed_from\n');
  });

  it('escapes newlines and rewrites the project and home paths', async () => {
    const root = await makeRoot();
    await writeArchive(root);

    const deviated = await runCliCaptured(root, [
      'query',
      "select text from disclosures where section = 'deviated'",
    ]);
    assert.equal(stdoutText(deviated), 'text\nline one\\nline two');

    const context = await runCliCaptured(root, [
      'query',
      "select text from disclosures where section = 'missing_context'",
    ]);
    assert.equal(stdoutText(context), 'text\n./secret and ~/secret');
  });

  it('lists every table and column and exits zero with no statement', async () => {
    const root = await makeRoot();
    await writeArchive(root);

    const capture = await runCliCaptured(root, ['query']);

    assert.equal(capture.exitCode, undefined);
    assert.equal(capture.lines.length, 1);
    assert.equal(stdoutText(capture), TABLE_LIST);
  });

  it('refuses every write, pragma, attach, unknown table, and second statement', async () => {
    const root = await makeRoot();
    await writeArchive(root);
    const before = await snapshot(root);

    for (const select of REFUSALS) {
      const capture = await runCliCaptured(root, ['query', select]);
      assert.equal(capture.exitCode, 1, `expected a refusal for: ${select}`);
      const error = stderrText(capture);
      for (const line of TABLE_LIST.split('\n')) {
        assert.ok(error.includes(line), `refusal for ${select} is missing: ${line}`);
      }
    }

    assert.deepEqual(await snapshot(root), before);
  });
});
