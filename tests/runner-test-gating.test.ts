import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { type RunTaskFailureReason, runTask } from '../src/watcher/runner.js';

interface ParsedEvent {
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

const PROPOSAL = `---
title: Test gating
depends_on: []
verify: node -e "process.exit(0)"
features:
  reads: []
  writes: []
---
## Goal

Exercise undeclared test change gating.
`;

const TASKS_MD = `# Tasks

- [ ] 1. When test gating applies, undeclared changes halt the task
`;

const PASSING_VERIFY = 'node -e "process.exit(0)"';
const FAILING_VERIFY = 'node -e "process.exit(1)"';

/**
 * Adapter that performs an arbitrary filesystem mutation while the task is
 * "running", then writes a result file. The mutation is the whole point: it lets
 * a test simulate an agent editing or deleting a preexisting test file without
 * touching the real `tests/` tree.
 */
class FileMutatingAdapter implements HarnessAdapter {
  readonly name = 'file-mutating';

  constructor(private readonly mutate: (projectRoot: string) => Promise<void>) {}

  async setup(_projectRoot: string, _config: unknown): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    await this.mutate(options.projectRoot);

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

async function writeTask(
  specFolder: string,
  options: { verify: string; testsModify?: boolean },
): Promise<void> {
  const lines = [
    '---',
    'title: When test gating applies, undeclared changes halt the task',
    `verify: ${options.verify}`,
    'scope: []',
    'entry: []',
    'skills: []',
  ];
  if (options.testsModify) {
    lines.push('tests:', '  modify: true');
  }
  lines.push('---', '## Acceptance', '- [ ] gating is enforced');

  const taskPath = path.join(specFolder, 'tasks', '1.md');
  await fs.writeFile(taskPath, `${lines.join('\n')}\n`, 'utf8');
}

async function readEvents(specFolder: string, taskNumber: string): Promise<ParsedEvent[]> {
  const eventFilePath = path.join(specFolder, '.run', 'events', `${taskNumber}.jsonl`);
  let raw = '';
  try {
    raw = await fs.readFile(eventFilePath, 'utf8');
  } catch {
    return [];
  }
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

describe('Runner test modification gating', () => {
  let tmpDir: string;
  let specFolder: string;
  let existingTestPath: string;

  async function writeChangeFolder(): Promise<void> {
    specFolder = path.join(tmpDir, 'openspec', 'changes', '001-test-gating');
    await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(specFolder, 'proposal.md'), PROPOSAL, 'utf8');
    await fs.writeFile(path.join(specFolder, 'tasks.md'), TASKS_MD, 'utf8');
  }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-test-gating-test-'));
    await scaffoldProject(tmpDir);

    existingTestPath = path.join(tmpDir, 'tests', 'existing.test.ts');
    await fs.mkdir(path.dirname(existingTestPath), { recursive: true });
    await fs.writeFile(existingTestPath, '// preexisting test\n', 'utf8');

    await writeChangeFolder();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('RunTaskFailureReason includes undeclared_test_change', () => {
    const reason: RunTaskFailureReason = 'undeclared_test_change';
    assert.equal(reason, 'undeclared_test_change');
  });

  it('records preexisting tests before spawn: a deletion is detected', async () => {
    await writeTask(specFolder, { verify: FAILING_VERIFY });
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const adapter = new FileMutatingAdapter(async () => {
      await fs.rm(existingTestPath);
    });

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.success, false);
    assert.equal(result.reason, 'undeclared_test_change');

    const deadContent = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.match(deadContent, /reason: undeclared_test_change/);
    assert.match(deadContent, /tests\/existing\.test\.ts \(deleted\)/);
  });

  it('a modified preexisting test writes the dead marker and dead event, and skips verify', async () => {
    await writeTask(specFolder, { verify: FAILING_VERIFY });
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const adapter = new FileMutatingAdapter(async () => {
      await fs.writeFile(existingTestPath, '// modified by the agent\n', 'utf8');
    });

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.success, false);
    assert.equal(result.reason, 'undeclared_test_change');

    const deadContent = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.match(deadContent, /reason: undeclared_test_change/);
    assert.match(deadContent, /tests\/existing\.test\.ts \(modified\)/);

    const events = await readEvents(specFolder, '1');
    const deadEvents = events.filter((event) => event.type === 'dead');
    assert.equal(deadEvents.length, 1);
    assert.deepEqual(deadEvents[0].data, { task: '1', reason: 'undeclared_test_change' });

    // The zero-trust verify gate is never reached.
    assert.equal(
      events.some((event) => event.type === 'verify_ran'),
      false,
      'verify must not run when undeclared test changes are detected',
    );
    assert.equal(await exists(path.join(specFolder, '.run', 'done', '1')), false);
  });

  it('creating a brand new test file without tests.modify proceeds to verify', async () => {
    await writeTask(specFolder, { verify: PASSING_VERIFY });
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const adapter = new FileMutatingAdapter(async () => {
      await fs.writeFile(path.join(tmpDir, 'tests', 'brand-new.test.ts'), '// new test\n', 'utf8');
    });

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.success, true);

    assert.equal(await exists(path.join(specFolder, '.run', 'done', '1')), true);
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.md')), false);

    const events = await readEvents(specFolder, '1');
    assert.equal(
      events.some((event) => event.type === 'verify_ran'),
      true,
    );
    assert.equal(
      events.some((event) => event.type === 'dead'),
      false,
    );
  });

  it('tests.modify: true permits editing a preexisting test file', async () => {
    await writeTask(specFolder, { verify: PASSING_VERIFY, testsModify: true });
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const adapter = new FileMutatingAdapter(async () => {
      await fs.writeFile(existingTestPath, '// intentionally edited\n', 'utf8');
    });

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.success, true);

    assert.equal(await exists(path.join(specFolder, '.run', 'done', '1')), true);
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.md')), false);

    const events = await readEvents(specFolder, '1');
    assert.equal(
      events.some((event) => event.type === 'dead'),
      false,
    );
    assert.equal(
      events.some((event) => event.type === 'verify_ran'),
      true,
    );
  });
});
