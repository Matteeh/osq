import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createProgram } from '../src/cli/index.js';
import { reportCommand } from '../src/cli/report.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import {
  type MetricsReport,
  formatMetricsReport,
  generateReport,
  getMetricsReport,
} from '../src/core/report.js';

const CHANGE_SPECS_DIR = path.join('openspec', 'changes');

function specMd(title: string): string {
  return `---
title: ${title}
depends_on: []
features:
  reads: []
  writes: []
---
## Goal

${title} goal.
`;
}

function taskMd(title: string): string {
  return `---
title: ${title}
verify: node -e "process.exit(0)"
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] ${title} criteria
`;
}

/**
 * Creates a change folder under the configured `openspec/changes` root by
 * copying the scaffolded template. Metrics/report aggregation reads
 * `paths.specs`, which is `openspec/changes` after the 016 migration.
 */
async function createChangeFolder(
  root: string,
  folderName: string,
  title: string,
): Promise<string> {
  const folderPath = path.join(root, CHANGE_SPECS_DIR, folderName);
  await fs.cp(path.join(root, 'specs', '_template'), folderPath, { recursive: true });
  await fs.writeFile(path.join(folderPath, 'spec.md'), specMd(title), 'utf8');
  return folderPath;
}

/** Creates a change folder under `openspec/changes/archive`. */
async function createArchivedFolder(
  root: string,
  folderName: string,
  title: string,
  taskTitles: string[],
): Promise<string> {
  const folderPath = path.join(root, CHANGE_SPECS_DIR, 'archive', folderName);
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'spec.md'), specMd(title), 'utf8');
  for (let i = 0; i < taskTitles.length; i++) {
    await fs.writeFile(
      path.join(folderPath, 'tasks', `${i + 1}.md`),
      taskMd(taskTitles[i]),
      'utf8',
    );
  }
  return folderPath;
}

describe('osq report', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-test-'));
    await scaffoldProject(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('getMetricsReport aggregates spec and task counts across active and archived directories', async () => {
    // 1. Initially empty project
    const emptyReport = await getMetricsReport(tmpDir, DEFAULT_CONFIG);
    assert.equal(emptyReport.specs.total, 0);
    assert.equal(emptyReport.specs.active, 0);
    assert.equal(emptyReport.specs.archived, 0);
    assert.equal(emptyReport.tasks.total, 0);

    // 2. Create active spec with 2 tasks
    const activeFolder = await createChangeFolder(tmpDir, '001-active-spec', 'Active Spec');
    await fs.writeFile(path.join(activeFolder, 'tasks', '2.md'), taskMd('Active Task Two'), 'utf8');

    // 3. Create archived spec with 2 tasks
    await createArchivedFolder(tmpDir, '000-archived-spec', 'Archived Spec', [
      'Archived Task One',
      'Archived Task Two',
    ]);

    const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);

    assert.equal(report.specs.total, 2);
    assert.equal(report.specs.active, 1);
    assert.equal(report.specs.archived, 1);
    assert.equal(report.tasks.total, 4);
  });

  it('getMetricsReport calculates completion rate and dead tasks breakdown by reason', async () => {
    const folderPath = await createChangeFolder(
      tmpDir,
      '001-metrics-calculation-spec',
      'Metrics Calculation Spec',
    );
    const tasksDir = path.join(folderPath, 'tasks');
    const runDir = path.join(folderPath, '.run');

    // Create 4 tasks in total
    for (let i = 2; i <= 4; i++) {
      await fs.writeFile(path.join(tasksDir, `${i}.md`), taskMd(`Task ${i}`), 'utf8');
    }

    // Task 1: Done
    const doneDir = path.join(runDir, 'done');
    await fs.mkdir(doneDir, { recursive: true });
    await fs.writeFile(path.join(doneDir, '1'), '', 'utf8');

    // Task 2: Done
    await fs.writeFile(path.join(doneDir, '2'), '', 'utf8');

    // Task 3: Dead with reason verify_red
    const deadDir = path.join(runDir, 'dead');
    await fs.mkdir(deadDir, { recursive: true });
    await fs.writeFile(
      path.join(deadDir, '3.md'),
      `---
reason: verify_red
---
Verification command failed
`,
      'utf8',
    );

    // Task 4: Dead with reason crashed
    await fs.writeFile(
      path.join(deadDir, '4.md'),
      `---
reason: crashed
---
Process terminated unexpectedly
`,
      'utf8',
    );

    const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);

    assert.equal(report.tasks.total, 4);
    assert.equal(report.tasks.done, 2);
    assert.equal(report.tasks.dead, 2);
    assert.equal(report.tasks.running, 0);
    assert.equal(report.tasks.pending, 0);

    // 2 done out of 4 total = 50%
    assert.equal(report.completionRate, 50);

    // Dead tasks breakdown by reason
    assert.equal(report.failureBreakdown.verify_red, 1);
    assert.equal(report.failureBreakdown.crashed, 1);
  });

  it('getMetricsReport aggregates event durations, token usage, and file changes', async () => {
    const folderPath = await createChangeFolder(
      tmpDir,
      '001-event-aggregation-spec',
      'Event Aggregation Spec',
    );
    const eventsDir = path.join(folderPath, '.run', 'events');
    await fs.mkdir(eventsDir, { recursive: true });

    // Task 1: duration 10s (10000ms), 600 prompt, 200 candidate tokens, 2 file change events
    const task1Events = [
      JSON.stringify({
        type: 'started',
        timestamp: '2026-09-17T12:00:00.000Z',
      }),
      JSON.stringify({
        type: 'tokens',
        timestamp: '2026-09-17T12:00:02.000Z',
        data: { promptTokens: 600, candidateTokens: 200 },
      }),
      JSON.stringify({
        type: 'file_changed',
        timestamp: '2026-09-17T12:00:04.000Z',
        data: { file: 'src/core/foo.ts' },
      }),
      JSON.stringify({
        type: 'file_changed',
        timestamp: '2026-09-17T12:00:06.000Z',
        data: { file: 'src/cli/bar.ts' },
      }),
      JSON.stringify({
        type: 'exited',
        timestamp: '2026-09-17T12:00:10.000Z',
        data: { exitCode: 0 },
      }),
    ].join('\n');
    await fs.writeFile(path.join(eventsDir, '1.jsonl'), `${task1Events}\n`, 'utf8');

    // Create task 2 with 20s (20000ms), 400 prompt, 100 candidate tokens, 1 file change event (duplicate file)
    await fs.writeFile(path.join(folderPath, 'tasks', '2.md'), taskMd('Task 2'), 'utf8');

    const task2Events = [
      JSON.stringify({
        type: 'started',
        timestamp: '2026-09-17T12:10:00.000Z',
      }),
      JSON.stringify({
        type: 'tokens',
        timestamp: '2026-09-17T12:10:05.000Z',
        data: { promptTokens: 400, candidateTokens: 100 },
      }),
      JSON.stringify({
        type: 'file_changed',
        timestamp: '2026-09-17T12:10:10.000Z',
        data: { file: 'src/core/foo.ts' },
      }),
      JSON.stringify({
        type: 'exited',
        timestamp: '2026-09-17T12:10:20.000Z',
        data: { exitCode: 0 },
      }),
    ].join('\n');
    await fs.writeFile(path.join(eventsDir, '2.jsonl'), `${task2Events}\n`, 'utf8');

    const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);

    // Durations: 10000ms + 20000ms = 30000ms; avg = 15000ms
    assert.equal(report.durations.totalMs, 30000);
    assert.equal(report.durations.totalSeconds, 30);
    assert.equal(report.durations.avgMs, 15000);
    assert.equal(report.durations.avgSeconds, 15);

    // Tokens: input = 1000, output = 300, total = 1300
    assert.equal(report.tokens.input, 1000);
    assert.equal(report.tokens.output, 300);
    assert.equal(report.tokens.total, 1300);

    // File changes: 3 change events, 2 unique files ('src/core/foo.ts', 'src/cli/bar.ts')
    assert.equal(report.fileChanges.totalChanges, 3);
    assert.equal(report.fileChanges.uniqueCount, 2);
    assert.ok(report.fileChanges.uniqueFiles.includes('src/core/foo.ts'));
    assert.ok(report.fileChanges.uniqueFiles.includes('src/cli/bar.ts'));
  });

  it('reportCommand prints formatted terminal report and supports raw JSON output', async () => {
    const folderPath = await createChangeFolder(tmpDir, '001-reporting-spec', 'Reporting Spec');
    const doneDir = path.join(folderPath, '.run', 'done');
    await fs.mkdir(doneDir, { recursive: true });
    await fs.writeFile(path.join(doneDir, '1'), '', 'utf8');

    // 1. Text formatted output
    let capturedText = '';
    const textOutput = await reportCommand({
      cwd: tmpDir,
      config: DEFAULT_CONFIG,
      stdout: (msg) => {
        capturedText = msg;
      },
    });

    const output = capturedText || textOutput;
    const directFormatted = formatMetricsReport(await generateReport(tmpDir, DEFAULT_CONFIG));
    assert.equal(output, directFormatted);
    assert.ok(output.includes('Specs Summary'));
    assert.ok(output.includes('Tasks & Completion'));
    assert.ok(output.includes('Completion rate: 100'));
    assert.ok(output.includes('Execution Durations'));
    assert.ok(output.includes('Token Usage'));
    assert.ok(output.includes('File Changes'));

    // 2. JSON output
    let capturedJson = '';
    const jsonOutput = await reportCommand({
      cwd: tmpDir,
      config: DEFAULT_CONFIG,
      json: true,
      stdout: (msg) => {
        capturedJson = msg;
      },
    });

    const jsonStr = capturedJson || jsonOutput;
    const parsed = JSON.parse(jsonStr) as MetricsReport;
    assert.equal(parsed.specs.total, 1);
    assert.equal(parsed.tasks.total, 1);
    assert.equal(parsed.tasks.done, 1);
    assert.equal(parsed.completionRate, 100);
  });

  it('aggregates undeclared_test_change in the failure breakdown for text and JSON output', async () => {
    const folderPath = await createChangeFolder(
      tmpDir,
      '001-gated-report-spec',
      'Gated Report Spec',
    );
    const deadDir = path.join(folderPath, '.run', 'dead');
    await fs.mkdir(deadDir, { recursive: true });
    await fs.writeFile(
      path.join(deadDir, '1.md'),
      `---
reason: undeclared_test_change
---
Preexisting test files were modified or deleted without tests.modify: true:
- tests/report.test.ts (modified)
`,
      'utf8',
    );

    const report = await generateReport(tmpDir, DEFAULT_CONFIG);
    assert.equal(report.tasks.dead, 1);
    assert.equal(report.failureBreakdown.undeclared_test_change, 1);

    const formatted = formatMetricsReport(report);
    assert.ok(formatted.includes('Failure Breakdown:'));
    assert.ok(formatted.includes('undeclared_test_change: 1'));

    let capturedJson = '';
    const jsonOutput = await reportCommand({
      cwd: tmpDir,
      config: DEFAULT_CONFIG,
      json: true,
      stdout: (msg) => {
        capturedJson = msg;
      },
    });

    const parsed = JSON.parse(capturedJson || jsonOutput) as MetricsReport;
    assert.equal(parsed.failureBreakdown.undeclared_test_change, 1);
    assert.equal(parsed.tasks.dead, 1);
  });

  it('CLI registers report command in commander program', () => {
    const program = createProgram();
    const reportCmd = program.commands.find((cmd) => cmd.name() === 'report');

    assert.ok(reportCmd, 'report command should be registered in CLI program');
    assert.ok(reportCmd.description().length > 0, 'report command should have a description');

    const jsonOption = reportCmd.options.find((opt) => opt.long === '--json');
    assert.ok(jsonOption, 'report command should support --json option');
  });
});
