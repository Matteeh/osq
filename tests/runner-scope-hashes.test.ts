import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { parseFrontmatter } from '../src/core/parser.js';
import { MockAdapter } from '../src/harness/mock.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { writeDoneMarker } from '../src/watcher/outcome.js';
import { checkDoneTasksScopeHashes, computeTaskScopeHash } from '../src/watcher/regression.js';
import { runTask } from '../src/watcher/runner.js';

const PASSING_VERIFY = 'node -e "process.exit(0)"';

const PROPOSAL = `---
title: Scope hashes
depends_on: []
verify: node -e "process.exit(0)"
features:
  reads: []
  writes: []
---
## Goal

Exercise pre-spawn scope comparison.

## Contract

| Input | Expected Output |
|---|---|
| sample | sample |

## Non-goals

None.

## Delta

None.
`;

const TASKS_MD = `# Tasks

- [ ] 1. When task one runs, its scope is recorded
- [ ] 2. When task two runs, task one scope is compared
`;

function taskFile(title: string, scope: string): string {
  return `${[
    '---',
    `title: ${title}`,
    `verify: ${PASSING_VERIFY}`,
    'scope:',
    `  - ${scope}`,
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] should be observed',
  ].join('\n')}\n`;
}

interface ParsedEvent {
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

async function readEvents(specFolder: string, taskNumber: string): Promise<ParsedEvent[]> {
  const raw = await fs
    .readFile(path.join(specFolder, '.run', 'events', `${taskNumber}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

/** Adapter that records whether the runner actually spawned an agent. */
class CountingAdapter extends MockAdapter {
  spawnCalls = 0;

  override async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.spawnCalls += 1;
    return super.spawn(options);
  }
}

describe('Done marker scope hash frontmatter', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-done-hash-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes YAML frontmatter and an ISO timestamp when metadata is provided', async () => {
    const runDir = path.join(tmpDir, '.run');
    await writeDoneMarker(runDir, '3', {
      scopeHash: 'sha256:abc',
      buildStamp: 'deadbeef',
      exitCode: 0,
      fileHashes: { 'src/a.ts': 'sha256:aaa', 'src/missing.ts': null },
    });

    const content = await fs.readFile(path.join(runDir, 'done', '3'), 'utf8');
    const { data, body } = parseFrontmatter(content);
    assert.equal(data.scope_hash, 'sha256:abc');
    assert.equal(data.build_stamp, 'deadbeef');
    assert.equal(data.exit_code, 0);
    assert.deepEqual(data.scope_files, { 'src/a.ts': 'sha256:aaa', 'src/missing.ts': null });
    assert.ok(!Number.isNaN(Date.parse(body.trim())), 'body must carry an ISO timestamp');
  });

  it('keeps timestamp-only content when no metadata is provided', async () => {
    const runDir = path.join(tmpDir, '.run-legacy');
    await writeDoneMarker(runDir, '1');

    const content = await fs.readFile(path.join(runDir, 'done', '1'), 'utf8');
    assert.ok(!content.startsWith('---'));
    assert.ok(!Number.isNaN(Date.parse(content.trim())));
  });
});

describe('computeTaskScopeHash', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-scope-hash-'));
    await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'src', 'a.ts'), 'export const a = 1;\n', 'utf8');
    await fs.writeFile(path.join(tmpDir, 'src', 'b.ts'), 'export const b = 2;\n', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('is deterministic regardless of scope ordering', async () => {
    const first = await computeTaskScopeHash(tmpDir, ['src/a.ts', 'src/b.ts']);
    const second = await computeTaskScopeHash(tmpDir, ['src/b.ts', 'src/a.ts']);

    assert.equal(first.hash, second.hash);
    assert.match(first.hash, /^sha256:[0-9a-f]{64}$/);
    assert.match(first.fileHashes['src/a.ts'] ?? '', /^sha256:[0-9a-f]{64}$/);
  });

  it('changes when a scoped file content changes', async () => {
    const before = await computeTaskScopeHash(tmpDir, ['src/a.ts', 'src/b.ts']);
    await fs.writeFile(path.join(tmpDir, 'src', 'a.ts'), 'export const a = 99;\n', 'utf8');
    const after = await computeTaskScopeHash(tmpDir, ['src/a.ts', 'src/b.ts']);

    assert.notEqual(before.hash, after.hash);
    assert.notEqual(before.fileHashes['src/a.ts'], after.fileHashes['src/a.ts']);
    assert.equal(before.fileHashes['src/b.ts'], after.fileHashes['src/b.ts']);
  });

  it('records null for a missing scoped file', async () => {
    const result = await computeTaskScopeHash(tmpDir, ['src/missing.ts']);
    assert.equal(result.fileHashes['src/missing.ts'], null);
  });
});

describe('Pre-spawn scope comparison', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-pre-spawn-scope-'));
    await scaffoldProject(tmpDir);
    await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'src', 'a.ts'), 'export const a = 1;\n', 'utf8');
    await fs.writeFile(path.join(tmpDir, 'src', 'b.ts'), 'export const b = 2;\n', 'utf8');

    specFolder = path.join(tmpDir, 'openspec', 'changes', '001-scope-hashes');
    await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(specFolder, 'proposal.md'), PROPOSAL, 'utf8');
    await fs.writeFile(path.join(specFolder, 'tasks.md'), TASKS_MD, 'utf8');
    await fs.writeFile(
      path.join(specFolder, 'tasks', '1.md'),
      taskFile('When task one runs, its scope is recorded', 'src/a.ts'),
      'utf8',
    );
    await fs.writeFile(
      path.join(specFolder, 'tasks', '2.md'),
      taskFile('When task two runs, task one scope is compared', 'src/b.ts'),
      'utf8',
    );
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('records the completed scope hash in the done marker', async () => {
    const adapter: HarnessAdapter = new MockAdapter();
    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.success, true);

    const done = await fs.readFile(path.join(specFolder, '.run', 'done', '1'), 'utf8');
    const { data } = parseFrontmatter(done);
    const expected = await computeTaskScopeHash(tmpDir, ['src/a.ts']);
    assert.equal(data.scope_hash, expected.hash);
    assert.deepEqual(data.scope_files, expected.fileHashes);
    assert.equal(data.exit_code, 0);
  });

  it('proceeds to spawn when every earlier done scope is unchanged', async () => {
    const adapter = new CountingAdapter();
    const first = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(first.success, true);

    const second = await runTask(tmpDir, specFolder, '2', DEFAULT_CONFIG, adapter);
    assert.equal(second.success, true);
    assert.equal(adapter.spawnCalls, 2);
    assert.equal(await checkDoneTasksScopeHashes(tmpDir, specFolder, '2'), null);
  });

  it('detects a changed earlier scope and refuses to spawn', async () => {
    const first = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, new MockAdapter());
    assert.equal(first.success, true);

    await fs.writeFile(path.join(tmpDir, 'src', 'a.ts'), 'export const a = 2;\n', 'utf8');

    const adapter = new CountingAdapter();
    const second = await runTask(tmpDir, specFolder, '2', DEFAULT_CONFIG, adapter);

    assert.equal(second.success, false);
    assert.equal(second.reason, 'regressed');
    assert.equal(adapter.spawnCalls, 0, 'the agent must not be spawned on regression');
    assert.match(second.error ?? '', /src\/a\.ts \(modified\)/);

    const marker = await fs.readFile(path.join(specFolder, '.run', 'regressed', '1.md'), 'utf8');
    assert.match(marker, /src\/a\.ts \(modified\)/);

    const regression = await checkDoneTasksScopeHashes(tmpDir, specFolder, '2');
    assert.ok(regression);
    assert.equal(regression.taskNumber, '1');
    assert.deepEqual(regression.differingPaths, ['src/a.ts (modified)']);
    assert.match(regression.recordedHash, /^sha256:/);
    assert.match(regression.currentHash, /^sha256:/);

    const events = await readEvents(specFolder, '1');
    assert.ok(events.some((event) => event.type === 'regressed'));
  });

  it('reports a deleted earlier scope file as differing', async () => {
    const first = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, new MockAdapter());
    assert.equal(first.success, true);

    await fs.rm(path.join(tmpDir, 'src', 'a.ts'));

    const regression = await checkDoneTasksScopeHashes(tmpDir, specFolder, '2');
    assert.ok(regression);
    assert.deepEqual(regression.differingPaths, ['src/a.ts (deleted)']);
  });
});
