import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createProgram } from '../src/cli/index.js';
import { showCommand } from '../src/cli/show.js';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { formatShowOutput, getSpecDetails } from '../src/core/show.js';
import { deriveTaskStatus } from '../src/core/state.js';
import { formatStatusOverview, getStatusOverview } from '../src/core/status.js';
import { installFakeValidator } from './helpers.js';

const CHANGE_SPECS_DIR = path.join('openspec', 'changes');

function specMd(title: string): string {
  return `---
title: ${title}
depends_on: []
features:
  reads: []
---
## Goal

${title} goal.

## Contract

| Cmd | Output |
|---|---|
| osq test | ok |

## Non-goals

- none

## Delta

none
`;
}

function taskMd(title: string, verify = 'node -e "process.exit(0)"'): string {
  return `---
title: ${title}
verify: ${verify}
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] ${title} acceptance
`;
}

/**
 * Creates a change folder under the configured `openspec/changes` root with a
 * change document and a task execution unit. Written capabilities are supplied
 * by delta spec folders under `specs/`, not by frontmatter.
 */
async function createChangeFolder(
  root: string,
  folderName: string,
  title: string,
): Promise<string> {
  const folderPath = path.join(root, CHANGE_SPECS_DIR, folderName);
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'spec.md'), specMd(title), 'utf8');
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), taskMd(title), 'utf8');
  return folderPath;
}

describe('osq show', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-show-test-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('getSpecDetails resolves change folder across active and archived directories', async () => {
    // 1. Create an active change folder
    await createChangeFolder(tmpDir, '001-active-spec', 'Active Spec');
    // 2. Create an archived change folder directly in the archive
    const archiveDir = path.join(tmpDir, CHANGE_SPECS_DIR, 'archive', '002-archived-spec');
    await fs.mkdir(path.join(archiveDir, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(archiveDir, 'spec.md'), specMd('Archived Spec'), 'utf8');
    await fs.writeFile(path.join(archiveDir, 'tasks', '1.md'), taskMd('Archived Task'), 'utf8');

    // Resolving active spec by ID, prefix, or slug
    const activeDetails1 = await getSpecDetails(tmpDir, '001', DEFAULT_CONFIG);
    assert.equal(activeDetails1.id, '001');
    assert.equal(activeDetails1.title, 'Active Spec');
    assert.equal(activeDetails1.isArchived, false);
    assert.equal(activeDetails1.folderName, '001-active-spec');

    const activeDetails2 = await getSpecDetails(tmpDir, '1', DEFAULT_CONFIG);
    assert.equal(activeDetails2.id, '001');

    const activeDetails3 = await getSpecDetails(tmpDir, 'active-spec', DEFAULT_CONFIG);
    assert.equal(activeDetails3.id, '001');

    // Resolving archived spec by ID, prefix, or slug
    const archivedDetails1 = await getSpecDetails(tmpDir, '002', DEFAULT_CONFIG);
    assert.equal(archivedDetails1.id, '002');
    assert.equal(archivedDetails1.title, 'Archived Spec');
    assert.equal(archivedDetails1.isArchived, true);
    assert.equal(archivedDetails1.folderName, '002-archived-spec');

    const archivedDetails2 = await getSpecDetails(tmpDir, '2', DEFAULT_CONFIG);
    assert.equal(archivedDetails2.id, '002');

    // Non-existent spec throws
    await assert.rejects(async () => {
      await getSpecDetails(tmpDir, '999', DEFAULT_CONFIG);
    }, /not found/i);
  });

  it('getSpecDetails extracts spec metadata, tasks, results, and dead markers', async () => {
    const folderPath = await createChangeFolder(tmpDir, '001-metadata-spec', 'Metadata Spec');

    // Update spec.md with rich content
    await fs.writeFile(
      path.join(folderPath, 'spec.md'),
      `---
title: Metadata Spec
depends_on: [001, 002]
features:
  reads: [cli-foundation]
---
## Goal

Inspect specs thoroughly.

## Contract

| Command | Expected Output |
|---|---|
| osq show 001 | detailed inspection |

## Non-goals

- No modification

## Delta

Update docs
`,
      'utf8',
    );

    // Written capabilities are declared by delta spec folders under `specs/`.
    const deltaDir = path.join(folderPath, 'specs', 'status-inspection');
    await fs.mkdir(deltaDir, { recursive: true });
    await fs.writeFile(path.join(deltaDir, 'spec.md'), '# delta\n', 'utf8');

    // Add task 2 and 3
    await fs.writeFile(
      path.join(folderPath, 'tasks', '2.md'),
      `---
title: Task Two
verify: node -e "process.exit(0)"
scope: [src/core/show.ts]
entry: [src/core/show.ts]
skills: []
---
## Acceptance
- [ ] Task two acceptance line
`,
      'utf8',
    );

    await fs.writeFile(
      path.join(folderPath, 'tasks', '3.md'),
      `---
title: Task Three
verify: node -e "process.exit(1)"
scope: [src/cli/show.ts]
entry: [src/cli/show.ts]
skills: []
---
## Acceptance
- [ ] Task three acceptance line
`,
      'utf8',
    );

    const runDir = path.join(folderPath, '.run');

    // Task 1: pending (no extra files)

    // Task 2: done with result file
    const doneDir = path.join(runDir, 'done');
    await fs.mkdir(doneDir, { recursive: true });
    await fs.writeFile(path.join(doneDir, '2'), '', 'utf8');

    const resultsDir = path.join(runDir, 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(
      path.join(resultsDir, '2.md'),
      `## Changed
- implemented task 2
## Next steps
- proceed to task 3
`,
      'utf8',
    );

    // Task 3: dead with dead marker
    const deadDir = path.join(runDir, 'dead');
    await fs.mkdir(deadDir, { recursive: true });
    await fs.writeFile(
      path.join(deadDir, '3.md'),
      `---
reason: verify_red
---
Verification command failed with exit code 1.
Stack trace info here.
`,
      'utf8',
    );

    const details = await getSpecDetails(tmpDir, '001', DEFAULT_CONFIG);

    // Check spec metadata
    assert.equal(details.id, '001');
    assert.equal(details.title, 'Metadata Spec');
    assert.deepEqual(details.dependsOn, ['001', '002']);
    assert.deepEqual(details.features.reads, ['cli-foundation']);
    assert.deepEqual(details.features.writes, ['status-inspection']);
    assert.ok(details.goal.includes('Inspect specs thoroughly.'));
    assert.ok(details.contract.includes('detailed inspection'));

    // Check tasks
    assert.equal(details.tasks.length, 3);

    const t1 = details.tasks.find((t) => t.taskNumber === '1');
    assert.ok(t1);
    assert.equal(t1.status, 'pending');
    assert.equal(t1.resultContent, undefined);
    assert.equal(t1.deadReason, undefined);

    const t2 = details.tasks.find((t) => t.taskNumber === '2');
    assert.ok(t2);
    assert.equal(t2.status, 'done');
    assert.equal(t2.title, 'Task Two');
    assert.deepEqual(t2.scope, ['src/core/show.ts']);
    assert.ok(t2.resultContent?.includes('implemented task 2'));
    assert.equal(t2.deadReason, undefined);

    const t3 = details.tasks.find((t) => t.taskNumber === '3');
    assert.ok(t3);
    assert.equal(t3.status, 'dead');
    assert.equal(t3.title, 'Task Three');
    assert.equal(t3.deadReason, 'verify_red');
    assert.ok(t3.deadDiagnostic?.includes('Verification command failed with exit code 1.'));
  });

  it('getSpecDetails parses event timeline from .run/events/<n>.jsonl', async () => {
    const folderPath = await createChangeFolder(tmpDir, '001-events-spec', 'Events Spec');
    const eventsDir = path.join(folderPath, '.run', 'events');
    await fs.mkdir(eventsDir, { recursive: true });

    // Task 1 events
    const task1Events = [
      JSON.stringify({ type: 'started', timestamp: '2026-09-17T10:00:00.000Z' }),
      JSON.stringify({
        type: 'file_changed',
        timestamp: '2026-09-17T10:01:00.000Z',
        data: { file: 'src/core/show.ts' },
      }),
    ].join('\n');
    await fs.writeFile(path.join(eventsDir, '1.jsonl'), `${task1Events}\n`, 'utf8');

    // Task 2 events (interleaved timestamps)
    const task2Events = [
      JSON.stringify({ type: 'started', timestamp: '2026-09-17T10:00:30.000Z' }),
      JSON.stringify({
        type: 'verify_ran',
        timestamp: '2026-09-17T10:02:00.000Z',
        data: { exitCode: 0 },
      }),
      JSON.stringify({
        type: 'exited',
        timestamp: '2026-09-17T10:03:00.000Z',
        data: { exitCode: 0 },
      }),
    ].join('\n');
    await fs.writeFile(path.join(eventsDir, '2.jsonl'), `${task2Events}\n`, 'utf8');

    const details = await getSpecDetails(tmpDir, '001', DEFAULT_CONFIG);

    // Total events = 5, chronologically ordered
    assert.equal(details.timeline.length, 5);
    assert.equal(details.timeline[0].type, 'started');
    assert.equal(details.timeline[0].taskNumber, '1');
    assert.equal(details.timeline[0].timestamp, '2026-09-17T10:00:00.000Z');

    assert.equal(details.timeline[1].type, 'started');
    assert.equal(details.timeline[1].taskNumber, '2');
    assert.equal(details.timeline[1].timestamp, '2026-09-17T10:00:30.000Z');

    assert.equal(details.timeline[2].type, 'file_changed');
    assert.equal(details.timeline[2].taskNumber, '1');
    assert.equal(details.timeline[2].timestamp, '2026-09-17T10:01:00.000Z');

    assert.equal(details.timeline[3].type, 'verify_ran');
    assert.equal(details.timeline[3].taskNumber, '2');

    assert.equal(details.timeline[4].type, 'exited');
    assert.equal(details.timeline[4].taskNumber, '2');
  });

  it('showCommand prints formatted spec inspection with results and events', async () => {
    const folderPath = await createChangeFolder(tmpDir, '001-inspection-spec', 'Inspection Spec');
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const runDir = path.join(folderPath, '.run');

    // Add dead marker for task 1
    const deadDir = path.join(runDir, 'dead');
    await fs.mkdir(deadDir, { recursive: true });
    await fs.writeFile(
      path.join(deadDir, '1.md'),
      `---
reason: verify_red
---
Diagnostic details: tests failed.
`,
      'utf8',
    );

    // Add result for task 1
    const resultsDir = path.join(runDir, 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(
      path.join(resultsDir, '1.md'),
      `## Changed
- added feature files
`,
      'utf8',
    );

    // Add events
    const eventsDir = path.join(runDir, 'events');
    await fs.mkdir(eventsDir, { recursive: true });
    await fs.writeFile(
      path.join(eventsDir, '1.jsonl'),
      `${JSON.stringify({ type: 'started', timestamp: '2026-09-17T10:00:00.000Z' })}\n`,
      'utf8',
    );

    const details = await getSpecDetails(tmpDir, '001', DEFAULT_CONFIG);
    const directFormatted = formatShowOutput(details);
    assert.ok(directFormatted.includes('Inspection Spec'));

    let capturedOutput = '';
    const output = await showCommand('001', {
      cwd: tmpDir,
      config: DEFAULT_CONFIG,
      stdout: (msg) => {
        capturedOutput = msg;
      },
    });

    const text = capturedOutput || output;
    assert.ok(text.includes('001-inspection-spec') || text.includes('001'));
    assert.ok(text.includes('Inspection Spec'));
    assert.ok(text.includes('Goal:'));
    assert.ok(text.includes('Contract:'));
    assert.ok(text.includes('verify_red'));
    assert.ok(text.includes('Diagnostic details: tests failed.'));
    assert.ok(text.includes('added feature files'));
    assert.ok(text.includes('2026-09-17T10:00:00.000Z'));
    assert.ok(text.includes('started'));
  });

  it('formats undeclared_test_change status line and show diagnostic details', async () => {
    const folderPath = await createChangeFolder(tmpDir, '001-gated-spec', 'Gated Spec');
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const deadDir = path.join(folderPath, '.run', 'dead');
    await fs.mkdir(deadDir, { recursive: true });
    await fs.writeFile(
      path.join(deadDir, '1.md'),
      `---
reason: undeclared_test_change
---
Preexisting test files were modified or deleted without tests.modify: true:
- tests/show.test.ts (modified)
`,
      'utf8',
    );

    // State derivation surfaces the reason on the task.
    const taskState = await deriveTaskStatus(folderPath, '1.md');
    assert.equal(taskState.status, 'dead');
    assert.equal(taskState.deadReason, 'undeclared_test_change');

    // Status formatting renders the reason tag.
    const overview = await getStatusOverview(tmpDir, DEFAULT_CONFIG);
    const statusText = formatStatusOverview(overview);
    assert.ok(statusText.includes('(reason: undeclared_test_change)'));

    // Show output surfaces the reason and the listed test files.
    const details = await getSpecDetails(tmpDir, '001', DEFAULT_CONFIG);
    assert.equal(details.tasks[0].deadReason, 'undeclared_test_change');
    const showText = formatShowOutput(details);
    assert.ok(showText.includes('undeclared_test_change'));
    assert.ok(showText.includes('Failure diagnostic:'));
    assert.ok(showText.includes('tests/show.test.ts (modified)'));
  });

  it('CLI registers show <id> command in commander program', () => {
    const program = createProgram();
    const showCmd = program.commands.find((cmd) => cmd.name() === 'show');

    assert.ok(showCmd, 'show command should be registered in CLI program');
    assert.ok(showCmd.description().length > 0, 'show command should have a description');
    assert.equal(showCmd.registeredArguments.length, 1);
    assert.equal(showCmd.registeredArguments[0].name(), 'id');
    assert.equal(showCmd.registeredArguments[0].required, true);
  });
});
