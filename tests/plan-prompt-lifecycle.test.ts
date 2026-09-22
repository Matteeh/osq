import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { hashChangeFolder } from '../src/core/hasher.js';
import { scaffoldProject } from '../src/core/init.js';
import { getArchiveDir } from '../src/core/layout.js';
import { lintChangeFolder } from '../src/core/linter.js';
import { retrySpec } from '../src/core/retry.js';
import { AgyAdapter } from '../src/harness/agy.js';
import { checkAndArchiveSpec } from '../src/watcher/archiver.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

interface ParsedEvent {
  type: string;
  data?: Record<string, unknown>;
}

const CHANGE_DIR_NAME = '001-prompt-lifecycle';
const PASSING = 'node verify-pass.cjs';
const FAILING = 'node verify-fail.cjs';
const PASS_SCRIPT = 'process.exit(0);\n';
const FAIL_SCRIPT = 'process.exit(1);\n';
const PROMPT_BYTES = 'transient opening prompt\n';

/**
 * Real on-disk harness binary for the actual `AgyAdapter`. It writes the result
 * file the runner expects, so the whole task lifecycle runs without a mock.
 */
const FAKE_HARNESS_SCRIPT = `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const specFolder = process.env.OSQ_SPEC_FOLDER;
const taskNumber = process.env.OSQ_TASK_NUMBER;
if (specFolder && taskNumber) {
  const resultsDir = path.join(specFolder, '.run', 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(path.join(resultsDir, taskNumber + '.md'), '# Result\\n', 'utf8');
}
process.exit(0);
`;

const ADDED_DELTA = `# Spec Delta: sample

## ADDED Requirements

### Requirement: Sample behavior
The system SHALL behave.

#### Scenario: Works
- **WHEN** invoked
- **THEN** works
`;

const MODIFIED_DELTA = `# Spec Delta: sample

## MODIFIED Requirements

### Requirement: Absent behavior
The system SHALL modify an absent requirement.

#### Scenario: Works
- **WHEN** invoked
- **THEN** works
`;

function proposal(changeVerify: string): string {
  return [
    '---',
    'title: Prompt lifecycle',
    'depends_on: []',
    `verify: ${changeVerify}`,
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    'Exercise the transient planning prompt lifecycle.',
    '## Contract',
    '| Input | Expected Output |',
    '|---|---|',
    '| a | b |',
    '## Non-goals',
    'None.',
    '## Delta',
    'None.',
  ].join('\n');
}

function taskFile(verify: string): string {
  return `${[
    '---',
    'title: When the prompt is transient, hashes and lint ignore it',
    `verify: ${verify}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] observed',
  ].join('\n')}\n`;
}

describe('transient plan-prompt lifecycle', () => {
  let tmpDir: string;
  let specFolder: string;
  let archivedPath: string;
  let originalAgyPath: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-prompt-lifecycle-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'verify-pass.cjs'), PASS_SCRIPT, 'utf8');
    await fs.writeFile(path.join(tmpDir, 'verify-fail.cjs'), FAIL_SCRIPT, 'utf8');
    const fakeAgy = path.join(tmpDir, 'fake-agy.mjs');
    await fs.writeFile(fakeAgy, FAKE_HARNESS_SCRIPT, { mode: 0o755 });
    originalAgyPath = process.env.AGY_PATH;
    process.env.AGY_PATH = fakeAgy;
  });

  afterEach(async () => {
    if (originalAgyPath === undefined) {
      Reflect.deleteProperty(process.env, 'AGY_PATH');
    } else {
      process.env.AGY_PATH = originalAgyPath;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function exists(target: string): Promise<boolean> {
    return fs
      .stat(target)
      .then(() => true)
      .catch(() => false);
  }

  async function readEvents(root: string, target: string): Promise<ParsedEvent[]> {
    const raw = await fs
      .readFile(path.join(root, '.run', 'events', `${target}.jsonl`), 'utf8')
      .catch(() => '');
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ParsedEvent);
  }

  async function createChange(
    options: {
      changeVerify?: string;
      taskVerify?: string;
      withBrief?: boolean;
      withPrompt?: boolean;
      delta?: string;
    } = {},
  ): Promise<void> {
    specFolder = path.join(tmpDir, 'openspec', 'changes', CHANGE_DIR_NAME);
    archivedPath = path.join(
      getArchiveDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir),
      CHANGE_DIR_NAME,
    );
    await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
    await fs.writeFile(
      path.join(specFolder, 'proposal.md'),
      proposal(options.changeVerify ?? PASSING),
      'utf8',
    );
    await fs.writeFile(path.join(specFolder, 'tasks.md'), '# Tasks\n\n- [ ] 1. task 1\n', 'utf8');
    await fs.writeFile(
      path.join(specFolder, 'tasks', '1.md'),
      taskFile(options.taskVerify ?? PASSING),
      'utf8',
    );
    if (options.withBrief) {
      await fs.writeFile(
        path.join(specFolder, 'brief.md'),
        '---\ntitle: Brief\nplanner: null\n---\n# Brief\n\nLifecycle brief.\n',
        'utf8',
      );
    }
    if (options.withPrompt) {
      await fs.writeFile(path.join(specFolder, 'plan-prompt.md'), PROMPT_BYTES, 'utf8');
    }
    if (options.delta) {
      const dir = path.join(specFolder, 'specs', 'sample');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'spec.md'), options.delta, 'utf8');
    }
  }

  async function runSingleTask(): Promise<void> {
    const adapter = new AgyAdapter();
    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.success, true, JSON.stringify(result));
  }

  it('lint excludes the root prompt while keeping authored diagnostics', async () => {
    await createChange();
    const baseline = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(baseline.valid, true, baseline.errors.join('\n'));

    // Prohibited control characters and arbitrary bytes in the transient prompt
    // must not change any lint finding.
    await fs.writeFile(path.join(specFolder, 'plan-prompt.md'), 'prompt\x07bytes', 'utf8');
    const withPrompt = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(withPrompt.valid, true, withPrompt.errors.join('\n'));
    assert.deepEqual(withPrompt.errors, baseline.errors);
    assert.deepEqual(withPrompt.warnings, baseline.warnings);

    // Real authored diagnostics still fire while the prompt is present.
    await fs.writeFile(
      path.join(specFolder, 'tasks', '1.md'),
      taskFile('pnpm test && pnpm lint'),
      'utf8',
    );
    const broken = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(broken.valid, false);
    assert.ok(broken.errors.some((error) => error.includes('chains commands')));
  });

  it('hashChangeFolder ignores prompt add, edit, and removal but covers authored edits', async () => {
    await createChange();
    const approval = await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    const approvedHash = (
      await fs.readFile(path.join(specFolder, '.run', 'approved'), 'utf8')
    ).trim();
    assert.equal(approvedHash, approval.hash);

    const promptPath = path.join(specFolder, 'plan-prompt.md');
    await fs.writeFile(promptPath, 'first prompt\n', 'utf8');
    assert.equal(await hashChangeFolder(specFolder), approval.hash);
    await fs.writeFile(promptPath, 'second prompt\n', 'utf8');
    assert.equal(await hashChangeFolder(specFolder), approval.hash);
    await fs.rm(promptPath);
    assert.equal(await hashChangeFolder(specFolder), approval.hash);

    // A covered authored edit still changes the hash and is detectable.
    await fs.writeFile(path.join(specFolder, 'brief.md'), 'authored brief\n', 'utf8');
    assert.notEqual(await hashChangeFolder(specFolder), approval.hash);
  });

  it('re-approval after a prompt refresh keeps the same authored seal', async () => {
    await createChange();
    const first = await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    await fs.writeFile(path.join(specFolder, 'plan-prompt.md'), 'refreshed prompt v1\n', 'utf8');
    const second = await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    assert.equal(second.hash, first.hash);

    const seal = (await fs.readFile(path.join(specFolder, '.run', 'approved'), 'utf8')).trim();
    assert.equal(seal, first.hash);
  });

  it('runner conflict checking proceeds when only the prompt changed', async () => {
    await createChange();
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    await fs.writeFile(path.join(specFolder, 'plan-prompt.md'), 'refreshed prompt\n', 'utf8');

    await runSingleTask();
    assert.equal(await exists(path.join(specFolder, '.run', 'done', '1')), true);
  });

  it('retry integrity proceeds when only the prompt changed', async () => {
    await createChange();
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    await fs.mkdir(path.join(specFolder, '.run', 'dead'), { recursive: true });
    await fs.writeFile(
      path.join(specFolder, '.run', 'dead', '1.md'),
      '---\nreason: verify_red\n---\nfailed\n',
      'utf8',
    );
    await fs.writeFile(path.join(specFolder, 'plan-prompt.md'), 'refreshed prompt\n', 'utf8');

    const result = await retrySpec(tmpDir, '001', '1', DEFAULT_CONFIG);
    assert.equal(result.attempt, 2);
    assert.equal(result.reason, 'verify_red');
  });

  it('failing archive verification leaves the active prompt untouched', async () => {
    await createChange({ changeVerify: FAILING, withPrompt: true });
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    await runSingleTask();

    assert.equal(await checkAndArchiveSpec(tmpDir, specFolder, DEFAULT_CONFIG), false);

    assert.equal(await exists(specFolder), true);
    assert.equal(await exists(archivedPath), false);
    assert.equal(await fs.readFile(path.join(specFolder, 'plan-prompt.md'), 'utf8'), PROMPT_BYTES);
    assert.equal(await exists(path.join(specFolder, '.run', 'regressed', 'change.md')), true);
    const events = await readEvents(specFolder, 'change');
    assert.equal(
      events.some((event) => event.type === 'archived'),
      false,
    );
  });

  it('successful archive removes the prompt and retains authored and runtime content', async () => {
    await createChange({ withBrief: true, withPrompt: true, delta: ADDED_DELTA });
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    await runSingleTask();

    assert.equal(await checkAndArchiveSpec(tmpDir, specFolder, DEFAULT_CONFIG), true);

    assert.equal(await exists(specFolder), false);
    assert.equal(await exists(archivedPath), true);
    assert.equal(await exists(path.join(archivedPath, 'plan-prompt.md')), false);
    assert.equal(await exists(path.join(archivedPath, 'proposal.md')), true);
    assert.equal(await exists(path.join(archivedPath, 'brief.md')), true);
    assert.equal(await exists(path.join(archivedPath, 'tasks', '1.md')), true);
    assert.equal(await exists(path.join(archivedPath, '.run', 'done', '1')), true);
    assert.equal(await exists(path.join(archivedPath, 'specs', 'sample', 'spec.md')), true);

    // Delta application reached the living capability.
    assert.equal(await exists(path.join(tmpDir, 'openspec', 'specs', 'sample', 'spec.md')), true);

    const tasksMd = await fs.readFile(path.join(archivedPath, 'tasks.md'), 'utf8');
    assert.ok(tasksMd.includes('- [x] 1. task 1'));

    const events = await readEvents(archivedPath, 'change');
    assert.equal(events.filter((event) => event.type === 'archived').length, 1);
  });

  it('archiving succeeds and stays idempotent when the prompt is already absent', async () => {
    await createChange();
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    await runSingleTask();

    assert.equal(await checkAndArchiveSpec(tmpDir, specFolder, DEFAULT_CONFIG), true);
    assert.equal(await exists(path.join(archivedPath, 'plan-prompt.md')), false);
  });

  it('a delta failure during archive keeps the folder and prompt recoverable', async () => {
    await createChange({ withPrompt: true });
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    await runSingleTask();

    // Injected after approval so only the archive transition meets the bad delta.
    const deltaDir = path.join(specFolder, 'specs', 'sample');
    await fs.mkdir(deltaDir, { recursive: true });
    await fs.writeFile(path.join(deltaDir, 'spec.md'), MODIFIED_DELTA, 'utf8');

    await assert.rejects(() => checkAndArchiveSpec(tmpDir, specFolder, DEFAULT_CONFIG));

    assert.equal(await exists(specFolder), true);
    assert.equal(await exists(archivedPath), false);
    assert.equal(await fs.readFile(path.join(specFolder, 'plan-prompt.md'), 'utf8'), PROMPT_BYTES);
    const events = await readEvents(specFolder, 'change');
    assert.equal(
      events.some((event) => event.type === 'archived'),
      false,
    );
  });
});
