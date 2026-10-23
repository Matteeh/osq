import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { computeTaskScopeHash } from '../src/core/run/scope-hash.js';
import { auditScopeRegressions } from '../src/watcher/regression.js';

const SCOPE = 'src/a.ts';
const TIMEOUT_SECONDS = 600;
const H1 = 'sha256:recorded-task-1';
const H2 = 'sha256:recorded-task-2';

interface Fixture {
  root: string;
  specFolder: string;
  runDir: string;
}

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

function taskMd(number: number): string {
  return [
    '---',
    `title: Task ${number}`,
    'verify: node verify.cjs',
    'scope:',
    `  - ${SCOPE}`,
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    `- [ ] task ${number} holds`,
    '',
  ].join('\n');
}

async function setup(taskCount = 3): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-scope-latest-credit-'));
  roots.push(root);
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  const specFolder = path.join(root, 'openspec', 'changes', '001-latest-credit');
  const runDir = path.join(specFolder, '.run');
  await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
  for (let n = 1; n <= taskCount; n++) {
    await fs.writeFile(path.join(specFolder, 'tasks', `${n}.md`), taskMd(n), 'utf8');
  }
  return { root, specFolder, runDir };
}

async function writeDone(
  fixture: Fixture,
  taskNumber: number,
  scopeHash: string,
  scopeFiles: Record<string, string | null>,
): Promise<void> {
  await fs.mkdir(path.join(fixture.runDir, 'done'), { recursive: true });
  const lines = [
    '---',
    `scope_hash: ${JSON.stringify(scopeHash)}`,
    'scope_resolver: 2',
    'build_stamp: "stamp"',
    'exit_code: 0',
    `scope_files: ${JSON.stringify(scopeFiles)}`,
    '---',
    '',
  ];
  await fs.writeFile(
    path.join(fixture.runDir, 'done', String(taskNumber)),
    lines.join('\n'),
    'utf8',
  );
}

async function appendFileChanged(
  fixture: Fixture,
  taskNumber: number,
  filePath: string,
): Promise<void> {
  const eventsDir = path.join(fixture.runDir, 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  const event = {
    type: 'file_changed',
    timestamp: new Date().toISOString(),
    data: { path: filePath },
  };
  await fs.appendFile(path.join(eventsDir, `${taskNumber}.jsonl`), `${JSON.stringify(event)}\n`);
}

async function audit(fixture: Fixture) {
  return auditScopeRegressions({
    projectRoot: fixture.root,
    specFolderPath: fixture.specFolder,
    eligibleTaskNumbers: ['1'],
    verifyTimeoutSeconds: TIMEOUT_SECONDS,
    record: false,
  });
}

interface Row {
  name: string;
  task2: string | null;
  task3: string | null;
  attribution: string;
}

const ROWS: Row[] = [
  { name: 'task 3 records the current hash', task2: H2, task3: 'current', attribution: '3' },
  { name: 'task 2 records the current hash', task2: 'current', task3: H2, attribution: '2' },
  {
    name: 'task 2 records the current hash and task 3 no hash',
    task2: 'current',
    task3: null,
    attribution: '2',
  },
  { name: 'both tasks record the older hash', task2: H2, task3: H2, attribution: 'ambiguous' },
  { name: 'neither task records a hash', task2: null, task3: null, attribution: 'ambiguous' },
];

describe('Scope path credit from typed file-change evidence', () => {
  for (const row of ROWS) {
    it(`credits the latest of two later tasks when ${row.name}`, async () => {
      const fixture = await setup();
      await fs.writeFile(path.join(fixture.root, SCOPE), 'current\n', 'utf8');
      const current = await computeTaskScopeHash(fixture.root, [SCOPE]);
      const currentHash = current.fileHashes[SCOPE] ?? null;
      await writeDone(fixture, 1, 'sha256:stale-task-1', { [SCOPE]: H1 });
      await writeDone(
        fixture,
        2,
        'sha256:task-2',
        row.task2 === null ? {} : { [SCOPE]: rowValue(row.task2, currentHash) },
      );
      await writeDone(
        fixture,
        3,
        'sha256:task-3',
        row.task3 === null ? {} : { [SCOPE]: rowValue(row.task3, currentHash) },
      );
      await appendFileChanged(fixture, 2, SCOPE);
      await appendFileChanged(fixture, 3, SCOPE);

      const result = await audit(fixture);

      assert.equal(result.stale.length, 1);
      assert.deepEqual(result.stale[0]?.attribution, [
        { path: `${SCOPE} (modified)`, attribution: row.attribution },
      ]);
    });
  }
});

function rowValue(recorded: string, currentHash: string | null): string | null {
  return recorded === 'current' ? currentHash : H2;
}
