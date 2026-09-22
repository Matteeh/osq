import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { doneCommand } from '../src/cli/done.js';
import { createProgram } from '../src/cli/index.js';
import { reportCommand } from '../src/cli/report.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { markTaskDoneManual } from '../src/core/lifecycle/done.js';
import { formatMetricsReport, getMetricsReport } from '../src/core/report/report.js';
import { parseFrontmatter } from '../src/core/spec/parser.js';

const TASKS_MD = `# Tasks

## 3. Manual Task Completion

- [ ] 3. When human marks task done, osq done records manual frontmatter and event
- [ ] 4. When task title includes and, linter omits warning
`;

async function writeTask(specFolder: string, taskNumber: string): Promise<void> {
  await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
  const task = [
    '---',
    `title: Task ${taskNumber}`,
    'verify: node -e "process.exit(0)"',
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    `- [ ] criterion ${taskNumber}`,
  ].join('\n');
  await fs.writeFile(path.join(specFolder, 'tasks', `${taskNumber}.md`), `${task}\n`, 'utf8');
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

async function setupProject(): Promise<{ root: string; specFolder: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-done-manual-'));
  await scaffoldProject(root);
  const spec = await createNewSpec(root, 'Manual Done');
  return { root, specFolder: spec.folderPath };
}

describe('osq done command registration', () => {
  it('registers done <id> <task> with a required --manual option', () => {
    const program = createProgram();
    const doneCmd = program.commands.find((command) => command.name() === 'done');

    assert.ok(doneCmd, 'done command should be registered');
    assert.equal(doneCmd.registeredArguments[0].name(), 'id');
    assert.equal(doneCmd.registeredArguments[1].name(), 'task');

    const manual = doneCmd.options.find((option) => option.long === '--manual');
    assert.ok(manual, 'done command should declare --manual');
    assert.equal(manual.required, true);
  });
});

describe('manual task completion', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    const setup = await setupProject();
    tmpDir = setup.root;
    specFolder = setup.specFolder;
    await writeTask(specFolder, '3');
    await fs.writeFile(path.join(specFolder, 'tasks.md'), TASKS_MD, 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes manual frontmatter, appends a done_manual event, and ticks the checkbox', async () => {
    await doneCommand('001', '3', {
      manual: 'flaky network in CI',
      cwd: tmpDir,
      config: DEFAULT_CONFIG,
    });

    const marker = await fs.readFile(path.join(specFolder, '.run', 'done', '3'), 'utf8');
    const { data } = parseFrontmatter(marker);
    assert.equal(data.manual, true);
    assert.equal(data.reason, 'flaky network in CI');

    const eventContent = await fs.readFile(
      path.join(specFolder, '.run', 'events', '3.jsonl'),
      'utf8',
    );
    const events = eventContent
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as { type: string; data: { task: string; reason: string } });
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'done_manual');
    assert.equal(events[0].data.task, '3');
    assert.equal(events[0].data.reason, 'flaky network in CI');

    const tasksMd = await fs.readFile(path.join(specFolder, 'tasks.md'), 'utf8');
    assert.match(tasksMd, /- \[x\] 3\./);
    assert.match(tasksMd, /- \[ \] 4\./);
  });

  it('refuses to mark a task that does not exist', async () => {
    await assert.rejects(
      () => markTaskDoneManual(tmpDir, '001', '9', 'nope', DEFAULT_CONFIG),
      /Task "9" was not found/,
    );
    assert.equal(await exists(path.join(specFolder, '.run', 'done', '9')), false);
  });

  it('requires a non-empty manual reason', async () => {
    await assert.rejects(
      () => markTaskDoneManual(tmpDir, '001', '3', '   ', DEFAULT_CONFIG),
      /reason is required/,
    );
    assert.equal(await exists(path.join(specFolder, '.run', 'done', '3')), false);
  });
});

describe('report manual vs verified accounting', () => {
  describe('active specs', () => {
    let tmpDir: string;
    let specFolder: string;

    beforeEach(async () => {
      const setup = await setupProject();
      tmpDir = setup.root;
      specFolder = setup.specFolder;
      for (const taskNumber of ['1', '2', '3']) {
        await writeTask(specFolder, taskNumber);
      }
      await fs.mkdir(path.join(specFolder, '.run', 'done'), { recursive: true });
      await fs.writeFile(
        path.join(specFolder, '.run', 'done', '1'),
        '---\nscope_hash: "sha256:abc"\nexit_code: 0\n---\n2026-01-01T00:00:00.000Z\n',
        'utf8',
      );
      await markTaskDoneManual(tmpDir, '001', '2', 'first manual', DEFAULT_CONFIG);
      await markTaskDoneManual(tmpDir, '001', '3', 'second manual', DEFAULT_CONFIG);
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('counts verified and manual completions separately', async () => {
      const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);

      assert.equal(report.now.total, 3);
      assert.equal(report.now.done, 3);
      assert.equal(report.now.verified, 1);
      assert.equal(report.now.manual, 2);

      const text = formatMetricsReport(report);
      assert.ok(text.includes('Done: 3'));
      assert.ok(text.includes('Verified done: 1'));
      assert.ok(text.includes('Manual done: 2'));

      const json = await reportCommand({
        cwd: tmpDir,
        config: DEFAULT_CONFIG,
        json: true,
        stdout: () => {},
      });
      const parsed = JSON.parse(json) as {
        now: { done: number; verified: number; manual: number };
      };
      assert.equal(parsed.now.done, 3);
      assert.equal(parsed.now.verified, 1);
      assert.equal(parsed.now.manual, 2);
    });
  });

  describe('archived specs', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-manual-archive-'));
      await scaffoldProject(tmpDir);
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('counts manual done markers as manual', async () => {
      const folderPath = path.join(tmpDir, 'openspec', 'changes', 'archive', '001-archived');
      await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
      await fs.writeFile(
        path.join(folderPath, 'spec.md'),
        '---\ntitle: Archived\nfeatures:\n  reads: []\n---\n## Goal\nArchived\n',
        'utf8',
      );
      await writeTask(folderPath, '1');
      await writeTask(folderPath, '2');

      await fs.mkdir(path.join(folderPath, '.run', 'events'), { recursive: true });
      await fs.writeFile(
        path.join(folderPath, '.run', 'events', '1.jsonl'),
        `${JSON.stringify({
          type: 'done_manual',
          timestamp: '2026-01-01T00:00:00.000Z',
          data: { task: '1', reason: 'manual event' },
        })}\n`,
        'utf8',
      );
      await fs.mkdir(path.join(folderPath, '.run', 'done'), { recursive: true });
      await fs.writeFile(
        path.join(folderPath, '.run', 'done', '1'),
        '---\nmanual: true\nreason: "manual marker"\n---\n2026-01-01T00:00:00.000Z\n',
        'utf8',
      );
      await fs.writeFile(
        path.join(folderPath, '.run', 'done', '2'),
        '---\nmanual: true\nreason: "manual marker"\n---\n2026-01-01T00:00:00.000Z\n',
        'utf8',
      );

      const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);

      assert.equal(report.now.total, 2);
      assert.equal(report.now.done, 2);
      assert.equal(report.now.verified, 0);
      assert.equal(report.now.manual, 2);
    });
  });
});
