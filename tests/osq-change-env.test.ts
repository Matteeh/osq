import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { runCheck } from '../src/core/lifecycle/verification-record.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { getArchiveDir } from '../src/core/status/layout.js';
import { MockAdapter } from '../src/harness/mock.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { archiveSpecFolder } from '../src/watcher/archiver.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

const PRINT_CHANGE = "console.log(process.env.OSQ_CHANGE ?? '');\n";
const PASS_SCRIPT = 'process.exit(0);\n';
const TASKS_MD = `# Tasks

- [ ] 1. When the watcher runs a verify, the command sees its change folder
`;

interface ParsedEvent {
  type: string;
  timestamp?: string;
  data?: Record<string, unknown>;
}

/** Adapter that writes a result file so the runner proceeds to verification. */
class FileWritingAdapter implements HarnessAdapter {
  readonly name = 'file-writer';

  async setup(_projectRoot: string, _config: OsqConfig): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
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

async function readEvents(folderPath: string, target: string): Promise<ParsedEvent[]> {
  const raw = await fs
    .readFile(path.join(folderPath, '.run', 'events', `${target}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as ParsedEvent);
}

function proposalFor(verify: string): string {
  return `---
title: OSQ change environment
depends_on: []
verify: ${verify}
features:
  reads: []
---
## Goal

Exercise the verify change-folder environment.

## Surface

None.
`;
}

function taskMarkdown(verify: string): string {
  return [
    '---',
    'title: When the watcher runs a verify, the command sees its change folder',
    `verify: ${verify}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] the verify sees its change folder',
    '',
  ].join('\n');
}

describe('OSQ_CHANGE in a task verify through runTask', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-change-env-task-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'pass.cjs'), PASS_SCRIPT, 'utf8');
    await fs.writeFile(path.join(tmpDir, 'print-change.cjs'), PRINT_CHANGE, 'utf8');
    specFolder = path.join(tmpDir, 'openspec', 'changes', '001-osq-change');
    await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(specFolder, 'proposal.md'), proposalFor('node pass.cjs'), 'utf8');
    await fs.writeFile(path.join(specFolder, 'tasks.md'), TASKS_MD, 'utf8');
    await fs.writeFile(
      path.join(specFolder, 'tasks', '1.md'),
      taskMarkdown('node print-change.cjs'),
      'utf8',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('records the change folder as the task verify output', async () => {
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, new FileWritingAdapter());

    assert.equal(result.success, true);
    const postSpawn = (await readEvents(specFolder, '1')).filter(
      (event) => event.type === 'verify_ran' && event.data?.phase !== 'pre_spawn',
    );
    assert.equal(postSpawn.length, 1);
    assert.equal(
      String(postSpawn[0]?.data?.output).trim(),
      path.relative(tmpDir, specFolder).split(path.sep).join('/'),
    );
  });
});

describe('OSQ_CHANGE in the change-level verify through the watcher cycle', () => {
  let root: string;

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('records the change folder for the proposal verify', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-change-env-loop-'));
    await installFakeValidator(root);
    await scaffoldProject(root);
    await fs.writeFile(path.join(root, 'pass.cjs'), PASS_SCRIPT, 'utf8');
    await fs.writeFile(path.join(root, 'print-change.cjs'), PRINT_CHANGE, 'utf8');

    const spec = await createNewSpec(root, 'OSQ Change Environment');
    const folder = spec.folderPath;
    await fs.writeFile(path.join(folder, 'tasks', '1.md'), taskMarkdown('node pass.cjs'), 'utf8');
    const proposalPath = path.join(folder, 'proposal.md');
    const proposal = await fs.readFile(proposalPath, 'utf8');
    await fs.writeFile(
      proposalPath,
      proposal.replace(/^verify:.*$/m, 'verify: node print-change.cjs'),
      'utf8',
    );
    await approveSpec(root, '001', DEFAULT_CONFIG);

    const summary = await runWatcherOnce(root, DEFAULT_CONFIG, new MockAdapter());
    assert.equal(summary.specsArchived, 1);

    const archiveDir = getArchiveDir(DEFAULT_CONFIG.paths.openspecRoot, root);
    const entries = await fs.readdir(archiveDir);
    assert.equal(entries.length, 1);
    const archived = path.join(archiveDir, entries[0] as string);

    const changeVerifies = (await readEvents(archived, 'change')).filter(
      (event) => event.type === 'verify_ran',
    );
    assert.ok(changeVerifies.length > 0, 'the change-level verify should run');
    for (const event of changeVerifies) {
      assert.equal(
        String(event.data?.output).trim(),
        path.relative(root, folder).split(path.sep).join('/'),
      );
    }
  });
});

describe('OSQ_CHANGE removed from an archived check', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-change-env-check-'));
    await fs.writeFile(path.join(root, 'print-change.cjs'), PRINT_CHANGE, 'utf8');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('runs the check with no OSQ_CHANGE while the test process has it set', async () => {
    const dir = path.join(root, 'openspec', 'changes', '001-check');
    await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'proposal.md'),
      [
        '---',
        'title: Check environment',
        'verify: node pass.cjs',
        'check: node print-change.cjs',
        '---',
        '## Goal',
        'A goal.',
        '## Human steps',
        '### After landing',
        'A step',
      ].join('\n'),
      'utf8',
    );
    await fs.writeFile(path.join(dir, 'tasks', '1.md'), '# Task\n', 'utf8');
    const archived = await archiveSpecFolder(root, dir, DEFAULT_CONFIG);

    const previous = process.env.OSQ_CHANGE;
    process.env.OSQ_CHANGE = archived;
    try {
      const result = await runCheck(root, '001', DEFAULT_CONFIG);
      assert.equal(result.check.exitCode, 0);
      assert.equal(result.check.output.trim(), '');
    } finally {
      if (previous === undefined) Reflect.deleteProperty(process.env, 'OSQ_CHANGE');
      else process.env.OSQ_CHANGE = previous;
    }
  });
});
