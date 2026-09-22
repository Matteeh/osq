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
import { installFakeValidator } from './helpers.js';

interface ParsedEvent {
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

const CHANGE_VERIFY_PASS = `const fs = require('node:fs');
fs.appendFileSync('change-verify-ran.txt', 'ran\\n');
process.exit(0);
`;

const CHANGE_VERIFY_FAIL = `const fs = require('node:fs');
fs.appendFileSync('change-verify-ran.txt', 'ran\\n');
console.error('change verify exploded');
process.exit(3);
`;

function proposalFor(verify: string): string {
  return `---
title: Test gating
depends_on: []
verify: ${verify}
features:
  reads: []
---
## Goal

Exercise undeclared test change gating.
`;
}

const TASKS_MD = `# Tasks

- [ ] 1. When test gating applies, undeclared changes halt the task
`;

const PASSING_VERIFY = 'node verify.cjs';
const FAILING_VERIFY = 'node -e "process.exit(1)"';
const CHANGE_PASSING_VERIFY = 'node change-verify-pass.cjs';
const CHANGE_FAILING_VERIFY = 'node change-verify-fail.cjs';
const CHANGE_MARKER = 'change-verify-ran.txt';

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
  options: { verify: string; testsModify?: boolean; scope?: string[] },
): Promise<void> {
  const lines = [
    '---',
    'title: When test gating applies, undeclared changes halt the task',
    `verify: ${options.verify}`,
    `scope: [${(options.scope ?? []).join(', ')}]`,
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

  async function writeChangeFolder(proposalVerify: string = PASSING_VERIFY): Promise<void> {
    specFolder = path.join(tmpDir, 'openspec', 'changes', '001-test-gating');
    await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(specFolder, 'proposal.md'), proposalFor(proposalVerify), 'utf8');
    await fs.writeFile(path.join(specFolder, 'tasks.md'), TASKS_MD, 'utf8');
  }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-test-gating-test-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
    await fs.writeFile(path.join(tmpDir, 'change-verify-pass.cjs'), CHANGE_VERIFY_PASS, 'utf8');
    await fs.writeFile(path.join(tmpDir, 'change-verify-fail.cjs'), CHANGE_VERIFY_FAIL, 'utf8');

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
    assert.match(deadContent, /authorizing scope: tests\/existing\.test\.ts/);
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
    assert.match(deadContent, /authorizing scope: tests\/existing\.test\.ts/);

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

  it('tests.modify: true permits editing a preexisting test file in resolved scope', async () => {
    await writeTask(specFolder, {
      verify: PASSING_VERIFY,
      testsModify: true,
      scope: ['tests/existing.test.ts'],
    });
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

  it('tests.modify: true authorizes an in-scope deletion of a preexisting test', async () => {
    await writeTask(specFolder, {
      verify: PASSING_VERIFY,
      testsModify: true,
      scope: ['tests/existing.test.ts'],
    });
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const adapter = new FileMutatingAdapter(async () => {
      await fs.rm(existingTestPath);
    });

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.success, true);
    assert.equal(await exists(path.join(specFolder, '.run', 'done', '1')), true);
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.md')), false);
  });

  it('tests.modify: true still forbids a preexisting test outside the resolved scope', async () => {
    await writeTask(specFolder, {
      verify: FAILING_VERIFY,
      testsModify: true,
      scope: ['tests/other.test.ts'],
    });
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const adapter = new FileMutatingAdapter(async () => {
      await fs.writeFile(existingTestPath, '// edited out of scope\n', 'utf8');
    });

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.success, false);
    assert.equal(result.reason, 'undeclared_test_change');

    const deadContent = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.match(deadContent, /tests\/existing\.test\.ts \(modified\)/);
    assert.match(deadContent, /authorizing scope: tests\/existing\.test\.ts/);

    const events = await readEvents(specFolder, '1');
    assert.equal(
      events.some((event) => event.type === 'verify_ran'),
      false,
    );
  });

  it('sorts unauthorized diagnostics by test path and names each required scope entry', async () => {
    const aPath = path.join(tmpDir, 'tests', 'a.test.ts');
    const zPath = path.join(tmpDir, 'tests', 'z.test.ts');
    await fs.writeFile(aPath, '// a\n', 'utf8');
    await fs.writeFile(zPath, '// z\n', 'utf8');
    await writeTask(specFolder, { verify: FAILING_VERIFY });
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const adapter = new FileMutatingAdapter(async () => {
      await fs.writeFile(zPath, '// z edited\n', 'utf8');
      await fs.rm(aPath);
    });

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.reason, 'undeclared_test_change');

    const deadContent = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    const aIndex = deadContent.indexOf('tests/a.test.ts (deleted)');
    const zIndex = deadContent.indexOf('tests/z.test.ts (modified)');
    assert.ok(aIndex !== -1 && zIndex !== -1, deadContent);
    assert.ok(aIndex < zIndex, 'diagnostics must be sorted by project-relative path');
    assert.match(deadContent, /authorizing scope: tests\/a\.test\.ts/);
    assert.match(deadContent, /authorizing scope: tests\/z\.test\.ts/);
  });

  it('runs the enabled proposal verify after task verification and attributes its event to change', async () => {
    await writeChangeFolder(CHANGE_PASSING_VERIFY);
    await writeTask(specFolder, { verify: PASSING_VERIFY });
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const adapter = new FileMutatingAdapter(async () => {});
    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.success, true);
    assert.equal(await exists(path.join(tmpDir, CHANGE_MARKER)), true);
    assert.equal(await exists(path.join(specFolder, '.run', 'done', '1')), true);

    const changeEvents = await readEvents(specFolder, 'change');
    const verifyEvents = changeEvents.filter((event) => event.type === 'verify_ran');
    assert.equal(verifyEvents.length, 1);
    assert.equal(verifyEvents[0].data?.command, CHANGE_PASSING_VERIFY);
    assert.equal(verifyEvents[0].data?.exitCode, 0);
  });

  it('a failing proposal verify kills the task with change_verify_red and full evidence', async () => {
    await writeChangeFolder(CHANGE_FAILING_VERIFY);
    await writeTask(specFolder, { verify: PASSING_VERIFY });
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const adapter = new FileMutatingAdapter(async () => {});
    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.success, false);
    assert.equal(result.reason, 'change_verify_red');

    assert.equal(await exists(path.join(specFolder, '.run', 'done', '1')), false);
    const deadContent = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.match(deadContent, /reason: change_verify_red/);
    assert.match(deadContent, /command: "node change-verify-fail\.cjs"/);
    assert.match(deadContent, /exit_code: 3/);
    assert.match(deadContent, /change verify exploded/);

    const taskEvents = await readEvents(specFolder, '1');
    assert.equal(
      taskEvents.some((event) => event.type === 'done'),
      false,
    );
    const deadEvents = taskEvents.filter((event) => event.type === 'dead');
    assert.equal(deadEvents.length, 1);
    assert.deepEqual(deadEvents[0].data, { task: '1', reason: 'change_verify_red' });

    const changeEvents = await readEvents(specFolder, 'change');
    const verifyEvents = changeEvents.filter((event) => event.type === 'verify_ran');
    assert.equal(verifyEvents.length, 1);
    assert.equal(verifyEvents[0].data?.exitCode, 3);
  });

  it('disabling changeVerifyAfterTask skips the proposal verifier and completes', async () => {
    await writeChangeFolder(CHANGE_FAILING_VERIFY);
    await writeTask(specFolder, { verify: PASSING_VERIFY });
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    const disabledConfig = {
      ...DEFAULT_CONFIG,
      gates: { changeVerifyAfterTask: false },
    };

    const adapter = new FileMutatingAdapter(async () => {});
    const result = await runTask(tmpDir, specFolder, '1', disabledConfig, adapter);
    assert.equal(result.success, true);
    assert.equal(await exists(path.join(tmpDir, CHANGE_MARKER)), false);
    assert.equal(await exists(path.join(specFolder, '.run', 'done', '1')), true);
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.md')), false);

    const changeEvents = await readEvents(specFolder, 'change');
    assert.equal(
      changeEvents.some((event) => event.type === 'verify_ran'),
      false,
    );
  });

  it('a failing task verify stays verify_red and never runs the proposal verifier', async () => {
    await writeChangeFolder(CHANGE_PASSING_VERIFY);
    await writeTask(specFolder, { verify: FAILING_VERIFY });
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const adapter = new FileMutatingAdapter(async () => {});
    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.reason, 'verify_red');
    assert.equal(await exists(path.join(tmpDir, CHANGE_MARKER)), false);

    const changeEvents = await readEvents(specFolder, 'change');
    assert.equal(changeEvents.length, 0);
  });
});
