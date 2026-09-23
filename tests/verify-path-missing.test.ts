import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { getArchiveDir } from '../src/core/status/layout.js';
import { MockAdapter } from '../src/harness/mock.js';
import { buildExecutorPrompt } from '../src/harness/prompt.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

const EXISTING_TEST = 'tests/old.test.ts';
const MISSING_TEST = 'tests/new.test.ts';
const TASK_VERIFY = `node pass.cjs ${EXISTING_TEST} ${MISSING_TEST}`;
const PLAIN_VERIFY = 'node pass.cjs';
const PASS_SCRIPT = 'process.exit(0);\n';

const TASKS_MD = `# Tasks

- [ ] 1. When the verify names a missing file, the task dies
`;

interface ParsedEvent {
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

function proposalFor(verify: string): string {
  return `---
title: Verify path missing
depends_on: []
verify: ${verify}
features:
  reads: []
---
## Goal

Exercise the missing named-path check.

## Surface

None.
`;
}

function taskMarkdown(verify: string): string {
  return [
    '---',
    'title: When the verify names a missing file, the task dies',
    `verify: ${verify}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] the missing path is refused',
    '',
  ].join('\n');
}

/** Adapter that writes its result file plus any extra project-relative files. */
class FileWritingAdapter implements HarnessAdapter {
  readonly name = 'file-writer';
  spawnCalls = 0;

  constructor(private readonly files: readonly string[] = []) {}

  async setup(_projectRoot: string, _config: OsqConfig): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.spawnCalls += 1;
    for (const relative of this.files) {
      const target = path.join(options.projectRoot, relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, '// agent added\n', 'utf8');
    }
    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(
      path.join(resultsDir, `${options.taskNumber}.md`),
      '# Agent result\n',
      'utf8',
    );
    return { exitCode: 0 };
  }
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

describe('verify path check in runTask', () => {
  let tmpDir: string;
  let specFolder: string;

  async function writeChange(proposalVerify: string = PLAIN_VERIFY): Promise<void> {
    specFolder = path.join(tmpDir, 'openspec', 'changes', '001-verify-path');
    await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(specFolder, 'proposal.md'), proposalFor(proposalVerify), 'utf8');
    await fs.writeFile(path.join(specFolder, 'tasks.md'), TASKS_MD, 'utf8');
  }

  async function writeTask(verify: string): Promise<void> {
    await fs.writeFile(path.join(specFolder, 'tasks', '1.md'), taskMarkdown(verify), 'utf8');
  }

  async function readEvents(): Promise<ParsedEvent[]> {
    const raw = await fs
      .readFile(path.join(specFolder, '.run', 'events', '1.jsonl'), 'utf8')
      .catch(() => '');
    return raw
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as ParsedEvent);
  }

  function preSpawnEvents(events: ParsedEvent[]): ParsedEvent[] {
    return events.filter(
      (event) => event.type === 'verify_ran' && event.data?.phase === 'pre_spawn',
    );
  }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-verify-path-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'pass.cjs'), PASS_SCRIPT, 'utf8');
    await fs.mkdir(path.join(tmpDir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, EXISTING_TEST), '// existing test\n', 'utf8');
    await writeChange();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('kills the task with verify_path_missing before the verify runs', async () => {
    await writeTask(TASK_VERIFY);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    const adapter = new FileWritingAdapter();

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);

    assert.equal(result.success, false);
    assert.equal(result.reason, 'verify_path_missing');
    assert.equal(adapter.spawnCalls, 1);

    const marker = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.match(marker, /reason: verify_path_missing/);
    assert.match(marker, /command: "node pass\.cjs tests\/old\.test\.ts tests\/new\.test\.ts"/);
    assert.match(marker, /The task verify names paths that do not exist:/);
    assert.match(marker, /^- tests\/new\.test\.ts$/m);

    const events = await readEvents();
    const postSpawn = events.filter(
      (event) => event.type === 'verify_ran' && event.data?.phase !== 'pre_spawn',
    );
    assert.equal(postSpawn.length, 0, 'the task verify must not run');
    const dead = events.find((event) => event.type === 'dead');
    assert.deepEqual(dead?.data, { task: '1', reason: 'verify_path_missing' });
  });

  it('reaches done when the agent writes the named path', async () => {
    await writeTask(TASK_VERIFY);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    const adapter = new FileWritingAdapter([MISSING_TEST]);

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);

    assert.equal(result.success, true);
    assert.ok(await exists(path.join(tmpDir, MISSING_TEST)));
    const events = await readEvents();
    assert.ok(events.some((event) => event.type === 'done'));
    assert.ok(
      events.some((event) => event.type === 'verify_ran' && event.data?.phase !== 'pre_spawn'),
      'the task verify runs once the named path exists',
    );
  });

  it('behaves as today when the verify names no paths', async () => {
    await writeTask(PLAIN_VERIFY);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    const adapter = new FileWritingAdapter();

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);

    assert.equal(result.success, true);
    const events = await readEvents();
    const pre = preSpawnEvents(events);
    assert.equal(pre.length, 1);
    assert.equal('missingPaths' in (pre[0]?.data ?? {}), false);
    assert.ok(
      events.some((event) => event.type === 'verify_ran' && event.data?.phase !== 'pre_spawn'),
    );
  });

  it('records missingPaths and mismatch false when only the new path is absent', async () => {
    await writeTask(TASK_VERIFY);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, new FileWritingAdapter());

    assert.equal(result.reason, 'verify_path_missing');
    const pre = preSpawnEvents(await readEvents());
    assert.equal(pre.length, 1);
    assert.deepEqual(pre[0]?.data?.missingPaths, [MISSING_TEST]);
    assert.equal(pre[0]?.data?.expected, 'red');
    assert.equal(pre[0]?.data?.mismatch, false);
  });
});

const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

const LOOP_MISSING = `node verify.cjs ${EXISTING_TEST} ${MISSING_TEST}`;

/** Mock adapter that records spawns and writes the named test on its retry. */
class RetryingAdapter extends MockAdapter {
  readonly spawns: SpawnTaskOptions[] = [];

  override async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.spawns.push(options);
    if (options.attempt === 2) {
      const target = path.join(options.projectRoot, MISSING_TEST);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, '// agent added\n', 'utf8');
    }
    return super.spawn(options);
  }
}

interface LoopFixture {
  root: string;
  folder: string;
  runDir: string;
  config: OsqConfig;
  adapter: RetryingAdapter;
}

async function setupLoop(): Promise<LoopFixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-verify-path-loop-'));
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  await fs.mkdir(path.join(root, 'tests'), { recursive: true });
  await fs.writeFile(path.join(root, EXISTING_TEST), '// existing test\n', 'utf8');

  const spec = await createNewSpec(root, 'Verify Path Missing');
  const folder = spec.folderPath;
  await fs.writeFile(path.join(folder, 'tasks', '1.md'), taskMarkdown(LOOP_MISSING), 'utf8');
  const proposalPath = path.join(folder, 'proposal.md');
  const proposal = await fs.readFile(proposalPath, 'utf8');
  await fs.writeFile(
    proposalPath,
    proposal.replace(/^verify:.*$/m, 'verify: node verify.cjs'),
    'utf8',
  );
  await approveSpec(root, '001', DEFAULT_CONFIG);

  const config: OsqConfig = {
    ...DEFAULT_CONFIG,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off' },
  };
  return {
    root,
    folder,
    runDir: path.join(folder, '.run'),
    config,
    adapter: new RetryingAdapter(),
  };
}

async function readStream(folder: string): Promise<ParsedEvent[]> {
  const raw = await fs
    .readFile(path.join(folder, '.run', 'events', '1.jsonl'), 'utf8')
    .catch(() => '');
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as ParsedEvent);
}

describe('verify_path_missing through the watcher loop', () => {
  let fixture: LoopFixture;

  afterEach(async () => {
    if (fixture) await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it('retries the death automatically and the next prompt names the missing path', async () => {
    fixture = await setupLoop();

    const summary = await runWatcherOnce(fixture.root, fixture.config, fixture.adapter, undefined);

    assert.equal(summary.retried, 1);
    assert.equal(summary.tasksRun, 2);
    assert.equal(fixture.adapter.spawns.length, 2);

    const retrySpawn = fixture.adapter.spawns[1];
    assert.equal(retrySpawn?.attempt, 2);
    assert.equal(retrySpawn?.priorFailureReason, 'verify_path_missing');
    assert.match(retrySpawn?.priorFailureOutput ?? '', /tests\/new\.test\.ts/);
    assert.match(buildExecutorPrompt(retrySpawn as SpawnTaskOptions), /tests\/new\.test\.ts/);

    const archiveDir = getArchiveDir(fixture.config.paths.openspecRoot, fixture.root);
    const entries = (await fs.readdir(archiveDir)).sort();
    assert.equal(entries.length, 1, `expected one archived change, got ${entries.join(', ')}`);
    const archived = path.join(archiveDir, entries[0] as string);

    const events = await readStream(archived);
    assert.equal(
      events.filter((event) => event.type === 'retry' && event.data?.automatic === true).length,
      1,
    );
    assert.ok(events.some((event) => event.type === 'done'));
    assert.ok(await exists(path.join(archived, '.run', 'dead', '1.1.md')));
  });
});
