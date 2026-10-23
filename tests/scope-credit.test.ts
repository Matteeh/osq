import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { computeTaskScopeHash } from '../src/core/run/scope-hash.js';
import { readEndSegments } from '../src/core/run/scope-segments.js';
import { auditScopeRegressions } from '../src/watcher/regression.js';

const SCOPE = 'src/a.ts';
const TIMEOUT_SECONDS = 600;

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

async function setup(taskCount = 1): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-scope-credit-'));
  roots.push(root);
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  const specFolder = path.join(root, 'openspec', 'changes', '001-credit');
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

async function appendMeasuresEnd(
  fixture: Fixture,
  taskNumber: number,
  filePath: string,
  before: string | null,
  after: string | null,
): Promise<void> {
  const eventsDir = path.join(fixture.runDir, 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  const event = {
    type: 'measures',
    timestamp: new Date().toISOString(),
    data: { phase: 'end', scopeHashes: { [filePath]: { before, after } } },
  };
  await fs.appendFile(path.join(eventsDir, `${taskNumber}.jsonl`), `${JSON.stringify(event)}\n`);
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

describe('Measured scope segments', () => {
  it('drops a discarded attempt whose before repeats the previous kept before', async () => {
    const fixture = await setup(2);
    await appendMeasuresEnd(fixture, 2, SCOPE, 'h1', 'h2');
    await appendMeasuresEnd(fixture, 2, SCOPE, 'h1', 'h3');

    assert.deepEqual(await readEndSegments(fixture.specFolder, '2', SCOPE), [
      { before: 'h1', after: 'h3' },
    ]);
  });

  it('keeps both segments of an attempt that continues the chain', async () => {
    const fixture = await setup(2);
    await appendMeasuresEnd(fixture, 2, SCOPE, 'h1', 'h2');
    await appendMeasuresEnd(fixture, 2, SCOPE, 'h2', 'h3');

    assert.deepEqual(await readEndSegments(fixture.specFolder, '2', SCOPE), [
      { before: 'h1', after: 'h2' },
      { before: 'h2', after: 'h3' },
    ]);
  });
});

describe('Scope path credit from measured hashes', () => {
  it('credits a path from measured hashes when no typed event names it', async () => {
    const fixture = await setup(2);
    await fs.writeFile(path.join(fixture.root, SCOPE), 'current\n', 'utf8');
    const current = await computeTaskScopeHash(fixture.root, [SCOPE]);
    const currentHash = current.fileHashes[SCOPE] ?? null;
    await writeDone(fixture, 1, 'sha256:stale-task-1', { [SCOPE]: 'sha256:recorded-task-1' });
    await writeDone(fixture, 2, 'sha256:task-2', { [SCOPE]: currentHash });
    await appendMeasuresEnd(fixture, 2, SCOPE, 'sha256:recorded-task-1', currentHash);

    const result = await audit(fixture);

    assert.equal(result.stale.length, 1);
    assert.deepEqual(result.stale[0]?.attribution, [
      { path: `${SCOPE} (modified)`, attribution: '2', source: 'measures' },
    ]);
  });

  it('lets a typed file_changed event win over measured hashes', async () => {
    const fixture = await setup(3);
    await fs.writeFile(path.join(fixture.root, SCOPE), 'current\n', 'utf8');
    const current = await computeTaskScopeHash(fixture.root, [SCOPE]);
    const currentHash = current.fileHashes[SCOPE] ?? null;
    await writeDone(fixture, 1, 'sha256:stale-task-1', { [SCOPE]: 'sha256:recorded-task-1' });
    await writeDone(fixture, 2, 'sha256:task-2', { [SCOPE]: currentHash });
    await writeDone(fixture, 3, 'sha256:task-3', {});
    await appendMeasuresEnd(fixture, 2, SCOPE, 'sha256:recorded-task-1', currentHash);
    await appendFileChanged(fixture, 3, SCOPE);

    const result = await audit(fixture);

    assert.equal(result.stale.length, 1);
    assert.deepEqual(result.stale[0]?.attribution, [
      { path: `${SCOPE} (modified)`, attribution: '3' },
    ]);
  });

  it('credits the latest of two later tasks that measured the path', async () => {
    const fixture = await setup(3);
    await fs.writeFile(path.join(fixture.root, SCOPE), 'current\n', 'utf8');
    const current = await computeTaskScopeHash(fixture.root, [SCOPE]);
    const currentHash = current.fileHashes[SCOPE] ?? null;
    await writeDone(fixture, 1, 'sha256:stale-task-1', { [SCOPE]: 'sha256:recorded-task-1' });
    await writeDone(fixture, 2, 'sha256:task-2', { [SCOPE]: 'sha256:measured-task-2' });
    await writeDone(fixture, 3, 'sha256:task-3', { [SCOPE]: currentHash });
    await appendMeasuresEnd(fixture, 2, SCOPE, 'sha256:recorded-task-1', 'sha256:measured-task-2');
    await appendMeasuresEnd(fixture, 3, SCOPE, 'sha256:measured-task-2', currentHash);

    const result = await audit(fixture);

    assert.equal(result.stale.length, 1);
    assert.deepEqual(result.stale[0]?.attribution, [
      { path: `${SCOPE} (modified)`, attribution: '3', source: 'measures' },
    ]);
  });

  it('records ambiguous when neither of two later tasks measured the path records the current hash', async () => {
    const fixture = await setup(3);
    await fs.writeFile(path.join(fixture.root, SCOPE), 'current\n', 'utf8');
    const current = await computeTaskScopeHash(fixture.root, [SCOPE]);
    const currentHash = current.fileHashes[SCOPE] ?? null;
    await writeDone(fixture, 1, 'sha256:stale-task-1', { [SCOPE]: 'sha256:recorded-task-1' });
    await writeDone(fixture, 2, 'sha256:task-2', {});
    await writeDone(fixture, 3, 'sha256:task-3', {});
    await appendMeasuresEnd(fixture, 2, SCOPE, 'sha256:recorded-task-1', 'sha256:measured-task-2');
    await appendMeasuresEnd(fixture, 3, SCOPE, 'sha256:measured-task-2', currentHash);

    const result = await audit(fixture);

    assert.equal(result.stale.length, 1);
    assert.deepEqual(result.stale[0]?.attribution, [
      { path: `${SCOPE} (modified)`, attribution: 'ambiguous' },
    ]);
  });
});
