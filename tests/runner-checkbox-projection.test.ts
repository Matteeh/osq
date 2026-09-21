import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { hashChangeFolder } from '../src/core/hasher.js';
import { scaffoldProject } from '../src/core/init.js';
import { createNewSpec } from '../src/core/new.js';
import { parseTaskList } from '../src/core/parser.js';
import { deriveSpecState } from '../src/core/state.js';
import { MockAdapter } from '../src/harness/mock.js';
import { tickTaskCheckbox, tickTaskCheckboxContent } from '../src/watcher/outcome.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function writeTask(specFolder: string, taskNumber: string, verify: string): Promise<void> {
  const taskPath = path.join(specFolder, 'tasks', `${taskNumber}.md`);
  const task = [
    '---',
    `title: When task ${taskNumber} passes, the checkbox is projected`,
    `verify: ${verify}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] works',
  ].join('\n');
  await fs.writeFile(taskPath, `${task}\n`, 'utf8');
}

async function listFiles(dir: string, base = dir): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(full, base)));
    } else {
      files.push(path.relative(base, full));
    }
  }
  return files.sort();
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

describe('tickTaskCheckboxContent format handling', () => {
  it('ticks a matching item in a flat numbered checklist without touching neighbours', () => {
    const content = [
      '# Tasks',
      '',
      '- [ ] 1. When first condition, first outcome',
      '- [ ] 2. When second condition, second outcome',
    ].join('\n');

    const updated = tickTaskCheckboxContent(content, '1');
    assert.ok(updated.includes('- [x] 1. When first condition, first outcome'));
    assert.ok(updated.includes('- [ ] 2. When second condition, second outcome'));
  });

  it('ticks a matching item in a grouped numbered checklist under its section header', () => {
    const content = [
      '# Tasks',
      '',
      '## 1. Configuration and Dependencies',
      '',
      '- [ ] 1. When configuration is loaded, paths are typed',
      '- [ ] 2. When dependencies are pinned, the validator resolves',
      '',
      '## 2. Parsing and Templates',
      '',
      '- [ ] 3. When change folders are parsed, proposal.md is supported',
    ].join('\n');

    const updated = tickTaskCheckboxContent(content, '2');
    assert.ok(updated.includes('- [x] 2. When dependencies are pinned'));
    assert.ok(updated.includes('- [ ] 1. When configuration is loaded'));
    assert.ok(updated.includes('- [ ] 3. When change folders are parsed'));
  });

  it('ticks a grouped unnumbered item whose number lives on the section header', () => {
    const content = [
      '# Tasks',
      '',
      '## 1. First section',
      '',
      '- [ ] When first thing happens, first outcome occurs',
      '',
      '## 2. Second section',
      '',
      '- [ ] When second thing happens, second outcome occurs',
    ].join('\n');

    const updated = tickTaskCheckboxContent(content, '2');
    assert.ok(updated.includes('- [x] When second thing happens'));
    assert.ok(updated.includes('- [ ] When first thing happens'));
  });

  it('is idempotent and leaves already ticked checkboxes untouched', () => {
    const content = [
      '# Tasks',
      '',
      '- [x] 1. Already done',
      '- [X] 2. Also done',
      '- [ ] 3. Pending',
    ].join('\n');

    const once = tickTaskCheckboxContent(content, '1');
    assert.equal(once, content);
    assert.equal(tickTaskCheckboxContent(once, '1'), once);
  });

  it('prefers an explicit item number over the enclosing section number', () => {
    const content = [
      '# Tasks',
      '',
      '## 5. Checkbox Projection',
      '',
      '- [ ] 6. Different task',
      '- [ ] 5. Matching task',
    ].join('\n');

    const updated = tickTaskCheckboxContent(content, '5');
    assert.ok(updated.includes('- [ ] 6. Different task'));
    assert.ok(updated.includes('- [x] 5. Matching task'));
  });
});

describe('Runner checkbox projection', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-checkbox-projection-test-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Checkbox Projection');
    specFolder = spec.folderPath;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes the ticked checkbox through tickTaskCheckbox', async () => {
    const tasksMdPath = path.join(specFolder, 'tasks.md');
    const before = await fs.readFile(tasksMdPath, 'utf8');
    assert.ok(before.includes('- [ ] 1.'));

    await tickTaskCheckbox(specFolder, '1');

    const after = await fs.readFile(tasksMdPath, 'utf8');
    assert.ok(after.includes('- [x] 1.'));
    assert.ok(!after.includes('- [ ] 1.'));
  });

  it('is a no-op when tasks.md is absent', async () => {
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-checkbox-missing-'));
    try {
      await tickTaskCheckbox(emptyDir, '1');
      assert.equal(await exists(path.join(emptyDir, 'tasks.md')), false);
    } finally {
      await fs.rm(emptyDir, { recursive: true, force: true });
    }
  });

  it('does not invalidate the approved hash or modify .run/ markers', async () => {
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const runDir = path.join(specFolder, '.run');
    const approvedPath = path.join(runDir, 'approved');
    const approvedBefore = await fs.readFile(approvedPath, 'utf8');
    const runFilesBefore = await listFiles(runDir);
    const hashBefore = await hashChangeFolder(specFolder);

    await tickTaskCheckbox(specFolder, '1');

    assert.equal(await hashChangeFolder(specFolder), hashBefore);
    assert.equal(await fs.readFile(approvedPath, 'utf8'), approvedBefore);
    assert.deepEqual(await listFiles(runDir), runFilesBefore);

    const tasksContent = await fs.readFile(path.join(specFolder, 'tasks.md'), 'utf8');
    assert.ok(tasksContent.includes('- [x] 1.'));
  });

  it('derives task and spec state from .run/ markers, never tasks.md checkboxes', async () => {
    // Source-level guard: the runner must not parse the checklist for state.
    const runnerSource = await fs.readFile(
      path.join(REPO_ROOT, 'src', 'watcher', 'runner.ts'),
      'utf8',
    );
    assert.ok(!runnerSource.includes('parseTaskList'), 'runner.ts must not import parseTaskList');
    assert.ok(
      !runnerSource.includes('.checked'),
      'runner.ts must not read checklist checked flags',
    );

    // Functional guard: a ticked checkbox with no done marker stays pending.
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    await tickTaskCheckbox(specFolder, '1');

    const state = await deriveSpecState(tmpDir, specFolder);
    assert.equal(state.tasks[0].status, 'pending');
    assert.notEqual(state.status, 'done');
  });

  it('writes .run/done/<n> and ticks tasks.md after an independent verify pass', async () => {
    await writeTask(specFolder, '1', 'node -e "process.exit(0)"');
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const adapter = new MockAdapter();
    adapter.resetBehavior();

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);

    assert.equal(result.success, true);
    await fs.stat(path.join(specFolder, '.run', 'done', '1'));

    const tasksContent = await fs.readFile(path.join(specFolder, 'tasks.md'), 'utf8');
    assert.ok(tasksContent.includes('- [x] 1.'));
    assert.ok(!tasksContent.includes('- [ ] 1.'));
  });
});

describe('Archived task checkboxes', () => {
  it('all fifteen (or more) archived tasks.md files are fully ticked', async () => {
    const candidates = [path.join(REPO_ROOT, 'openspec', 'changes', 'archive')];
    let archiveDir: string | null = null;
    for (const candidate of candidates) {
      if (await exists(candidate)) {
        archiveDir = candidate;
        break;
      }
    }
    assert.ok(archiveDir, 'an archive directory must exist');

    const entries = await fs.readdir(archiveDir, { withFileTypes: true });
    const tasksFiles: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const tasksPath = path.join(archiveDir, entry.name, 'tasks.md');
      if (await exists(tasksPath)) {
        tasksFiles.push(tasksPath);
      }
    }

    assert.ok(
      tasksFiles.length >= 15,
      `expected at least 15 archived tasks.md files, found ${tasksFiles.length}`,
    );

    for (const tasksPath of tasksFiles) {
      const content = await fs.readFile(tasksPath, 'utf8');
      const items = parseTaskList(content);
      assert.ok(items.length > 0, `${tasksPath} has no checklist items`);
      const unchecked = items.filter((item) => !item.checked);
      assert.equal(
        unchecked.length,
        0,
        `${tasksPath} has unchecked items: ${unchecked.map((item) => item.title).join(', ')}`,
      );
    }
  });
});
