import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createProgram } from '../src/cli/index.js';
import { showCommand } from '../src/cli/show.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { formatShowOutput, getSpecDetails } from '../src/core/status/show.js';
import { deriveTaskStatus } from '../src/core/status/state.js';
import { formatStatusOverview, getStatusOverview } from '../src/core/status/status.js';
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

function taskMd(title: string, verify = 'node verify.cjs'): string {
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
    // A deterministic local verifier so scaffolded tasks lint without the
    // planning-time placeholder sentinel.
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
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
verify: node verify.cjs
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

  it('getSpecDetails correlates planning sessions in start order for active and archived changes', async () => {
    const folderPath = await createChangeFolder(tmpDir, '001-planning-spec', 'Planning Spec');

    // Session B starts earliest, then A, then an unmatched start (C). A
    // malformed line and an unknown record type must be skipped silently.
    const planLog = [
      JSON.stringify({
        type: 'plan_started',
        sessionId: 'session-b',
        timestamp: '2026-09-17T09:00:00.000Z',
        data: {
          harness: 'codex',
          model: 'gpt-5',
          osqVersion: '0.1.0',
          briefHash: 'sha256:bbb',
        },
      }),
      JSON.stringify({
        type: 'plan_exited',
        sessionId: 'session-b',
        timestamp: '2026-09-17T09:00:03.000Z',
        data: {
          exitCode: 1,
          wallSeconds: 3,
          usage: {
            inputTokens: 987654,
            outputTokens: null,
            cachedTokens: null,
            reasoningTokens: null,
            cost: null,
          },
        },
      }),
      JSON.stringify({
        type: 'plan_started',
        sessionId: 'session-a',
        timestamp: '2026-09-17T10:00:00.000Z',
        data: {
          harness: 'opencode',
          model: 'claude-x',
          agent: 'osq-planner',
          osqVersion: '0.1.0',
          briefHash: 'sha256:aaa',
        },
      }),
      'this is not valid json',
      JSON.stringify({
        type: 'plan_paused',
        sessionId: 'session-d',
        timestamp: '2026-09-17T10:05:00.000Z',
        data: {},
      }),
      JSON.stringify({
        type: 'plan_exited',
        sessionId: 'session-a',
        timestamp: '2026-09-17T10:00:12.500Z',
        data: {
          exitCode: 0,
          wallSeconds: 12.5,
          usage: {
            inputTokens: null,
            outputTokens: null,
            cachedTokens: null,
            reasoningTokens: null,
            cost: null,
          },
        },
      }),
      JSON.stringify({
        type: 'plan_started',
        sessionId: 'session-c',
        timestamp: '2026-09-17T11:00:00.000Z',
        data: {
          harness: 'agy',
          model: 'agy-default',
          osqVersion: '0.1.0',
          briefHash: 'sha256:ccc',
        },
      }),
    ].join('\n');
    await fs.mkdir(path.join(folderPath, '.run'), { recursive: true });
    await fs.writeFile(path.join(folderPath, '.run', 'plan.jsonl'), `${planLog}\n`, 'utf8');

    const details = await getSpecDetails(tmpDir, '001', DEFAULT_CONFIG);
    const sessions = details.planningSessions;

    assert.equal(sessions.length, 3);
    assert.deepEqual(
      sessions.map((s) => s.sessionId),
      ['session-b', 'session-a', 'session-c'],
    );

    assert.equal(sessions[0].startTime, '2026-09-17T09:00:00.000Z');
    assert.equal(sessions[0].harness, 'codex');
    assert.equal(sessions[0].model, 'gpt-5');
    assert.equal(sessions[0].exitCode, 1);
    assert.equal(sessions[0].wallSeconds, 3);
    assert.equal(sessions[0].agent, undefined);

    assert.equal(sessions[1].harness, 'opencode');
    assert.equal(sessions[1].model, 'claude-x');
    assert.equal(sessions[1].agent, 'osq-planner');
    assert.equal(sessions[1].exitCode, 0);
    assert.equal(sessions[1].wallSeconds, 12.5);

    // Unmatched start retains identity but renders unavailable outcome.
    assert.equal(sessions[2].harness, 'agy');
    assert.equal(sessions[2].exitCode, null);
    assert.equal(sessions[2].wallSeconds, null);

    // Token data and artifact hashes stay out of the inspection surface.
    for (const session of sessions) {
      assert.equal('inputTokens' in session, false);
      assert.equal('usage' in session, false);
      assert.equal('briefHash' in session, false);
    }
    assert.equal(JSON.stringify(sessions).includes('987654'), false);
    assert.equal(JSON.stringify(sessions).includes('sha256:'), false);

    // Archived changes resolve planning sessions through the same path.
    const archiveFolder = path.join(tmpDir, CHANGE_SPECS_DIR, 'archive', '003-archived-planning');
    await fs.mkdir(path.join(archiveFolder, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(archiveFolder, 'spec.md'), specMd('Archived Planning'), 'utf8');
    await fs.writeFile(
      path.join(archiveFolder, 'tasks', '1.md'),
      taskMd('Archived Planning Task'),
      'utf8',
    );
    await fs.mkdir(path.join(archiveFolder, '.run'), { recursive: true });
    await fs.writeFile(
      path.join(archiveFolder, '.run', 'plan.jsonl'),
      `${JSON.stringify({
        type: 'plan_started',
        sessionId: 'archived-1',
        timestamp: '2026-09-18T08:00:00.000Z',
        data: {
          harness: 'codex',
          model: 'gpt-5',
          osqVersion: '0.1.0',
          briefHash: 'sha256:ddd',
        },
      })}\n`,
      'utf8',
    );

    const archived = await getSpecDetails(tmpDir, '003', DEFAULT_CONFIG);
    assert.equal(archived.isArchived, true);
    assert.deepEqual(
      archived.planningSessions.map((s) => s.sessionId),
      ['archived-1'],
    );
    assert.equal(archived.planningSessions[0].exitCode, null);
    assert.equal(archived.planningSessions[0].wallSeconds, null);
  });

  it('renders Planning Sessions before the event timeline without exposing usage', async () => {
    const folderPath = await createChangeFolder(tmpDir, '001-render-spec', 'Render Spec');
    await fs.mkdir(path.join(folderPath, '.run', 'events'), { recursive: true });
    await fs.writeFile(
      path.join(folderPath, '.run', 'events', '1.jsonl'),
      `${JSON.stringify({ type: 'started', timestamp: '2026-09-17T10:00:00.000Z' })}\n`,
      'utf8',
    );
    await fs.writeFile(
      path.join(folderPath, '.run', 'plan.jsonl'),
      `${[
        JSON.stringify({
          type: 'plan_started',
          sessionId: 'render-a',
          timestamp: '2026-09-17T10:00:00.000Z',
          data: {
            harness: 'opencode',
            model: 'claude-x',
            agent: 'osq-planner',
            osqVersion: '0.1.0',
            briefHash: 'sha256:aaa',
          },
        }),
        JSON.stringify({
          type: 'plan_exited',
          sessionId: 'render-a',
          timestamp: '2026-09-17T10:00:12.500Z',
          data: {
            exitCode: 0,
            wallSeconds: 12.5,
            usage: {
              inputTokens: 987654,
              outputTokens: null,
              cachedTokens: null,
              reasoningTokens: null,
              cost: null,
            },
          },
        }),
        JSON.stringify({
          type: 'plan_started',
          sessionId: 'render-b',
          timestamp: '2026-09-17T11:00:00.000Z',
          data: {
            harness: 'agy',
            model: 'agy-default',
            osqVersion: '0.1.0',
            briefHash: 'sha256:bbb',
          },
        }),
      ].join('\n')}\n`,
      'utf8',
    );

    const details = await getSpecDetails(tmpDir, '001', DEFAULT_CONFIG);
    const text = formatShowOutput(details);

    const planningIndex = text.indexOf('Planning Sessions:');
    const timelineIndex = text.indexOf('Event Timeline:');
    assert.ok(planningIndex >= 0, 'Planning Sessions section should render');
    assert.ok(timelineIndex >= 0, 'Event Timeline section should render');
    assert.ok(
      planningIndex < timelineIndex,
      'Planning Sessions should appear before Event Timeline',
    );

    assert.ok(text.includes('opencode/claude-x'));
    assert.ok(text.includes('agent: osq-planner'));
    assert.ok(text.includes('exit: 0'));
    assert.ok(text.includes('wall: 13s'));
    assert.ok(text.includes('agy/agy-default'));
    assert.ok(text.includes('exit: unavailable'));
    assert.ok(text.includes('wall: unavailable'));

    assert.equal(text.includes('987654'), false);
    assert.equal(text.includes('inputTokens'), false);
    assert.equal(text.includes('sha256:'), false);

    let capturedOutput = '';
    await showCommand('001', {
      cwd: tmpDir,
      config: DEFAULT_CONFIG,
      stdout: (msg) => {
        capturedOutput = msg;
      },
    });
    assert.ok(capturedOutput.includes('Planning Sessions:'));
  });

  it('lists observed records through the same fields and ordering as owned records', async () => {
    const folderPath = await createChangeFolder(tmpDir, '001-mixed-source', 'Mixed Source');
    await fs.mkdir(path.join(folderPath, '.run', 'events'), { recursive: true });
    await fs.writeFile(
      path.join(folderPath, '.run', 'events', '1.jsonl'),
      `${JSON.stringify({ type: 'started', timestamp: '2026-09-17T09:00:00.000Z' })}\n`,
      'utf8',
    );

    const planLog = [
      // Source-less legacy record: reads as owned and stays readable.
      JSON.stringify({
        type: 'plan_started',
        sessionId: 'legacy-1',
        timestamp: '2026-09-17T08:00:00.000Z',
        data: {
          harness: 'codex',
          model: 'gpt-legacy',
          osqVersion: '0.1.0',
          briefHash: 'sha256:legacy',
        },
      }),
      JSON.stringify({
        type: 'plan_exited',
        sessionId: 'legacy-1',
        timestamp: '2026-09-17T08:00:05.000Z',
        data: {
          exitCode: 0,
          wallSeconds: 5,
          usage: {
            inputTokens: 111,
            outputTokens: null,
            cachedTokens: null,
            reasoningTokens: null,
            cost: null,
          },
        },
      }),
      // Explicit owned record with an agent.
      JSON.stringify({
        type: 'plan_started',
        sessionId: 'owned-1',
        timestamp: '2026-09-17T09:00:00.000Z',
        source: 'owned',
        data: {
          harness: 'opencode',
          model: 'oc-owned',
          agent: 'osq-planner',
          osqVersion: '0.1.0',
          briefHash: 'sha256:owned',
        },
      }),
      JSON.stringify({
        type: 'plan_exited',
        sessionId: 'owned-1',
        timestamp: '2026-09-17T09:00:12.500Z',
        source: 'owned',
        data: {
          exitCode: 1,
          wallSeconds: 12.5,
          usage: {
            inputTokens: null,
            outputTokens: null,
            cachedTokens: null,
            reasoningTokens: null,
            cost: null,
          },
        },
      }),
      // Observed record with a nullable model and no matched exit.
      JSON.stringify({
        type: 'plan_started',
        sessionId: 'observed-1',
        timestamp: '2026-09-17T10:00:00.000Z',
        source: 'observed',
        data: {
          harness: 'claude',
          model: null,
          osqVersion: '0.1.0',
          briefHash: 'sha256:observed',
        },
      }),
      'not json',
    ].join('\n');
    await fs.writeFile(path.join(folderPath, '.run', 'plan.jsonl'), `${planLog}\n`, 'utf8');

    const details = await getSpecDetails(tmpDir, '001', DEFAULT_CONFIG);
    const sessions = details.planningSessions;

    assert.equal(sessions.length, 3);
    assert.deepEqual(
      sessions.map((session) => session.sessionId),
      ['legacy-1', 'owned-1', 'observed-1'],
    );

    // Legacy, owned, and observed rows expose the same fields.
    assert.deepEqual(
      sessions.map((session) => [session.harness, session.model, session.exitCode]),
      [
        ['codex', 'gpt-legacy', 0],
        ['opencode', 'oc-owned', 1],
        ['claude', null, null],
      ],
    );
    assert.equal(sessions[1].agent, 'osq-planner');
    assert.equal(sessions[2].wallSeconds, null);
    assert.equal(sessions[2].agent, undefined);

    // No usage, transcript, or artifact hashes leak into the projection.
    for (const session of sessions) {
      assert.equal('inputTokens' in session, false);
      assert.equal('usage' in session, false);
      assert.equal('briefHash' in session, false);
    }
    assert.equal(JSON.stringify(sessions).includes('111'), false);
    assert.equal(JSON.stringify(sessions).includes('sha256:'), false);

    const text = formatShowOutput(details);
    assert.ok(text.includes('codex/gpt-legacy'));
    assert.ok(text.includes('opencode/oc-owned'));
    // A null observed model renders as unavailable like any missing value.
    assert.ok(text.includes('claude/unavailable'));
    assert.ok(text.includes('exit: unavailable'));
    assert.ok(text.includes('wall: unavailable'));
    assert.equal(text.includes('111'), false);
    assert.equal(text.includes('sha256:'), false);
    // The timeline still renders after the planning projection.
    assert.ok(text.indexOf('Planning Sessions:') < text.indexOf('Event Timeline:'));
  });

  it('missing and malformed planning logs leave task details and timeline intact', async () => {
    // No plan.log at all.
    const folderPath = await createChangeFolder(tmpDir, '001-missing-plan', 'Missing Plan');
    const runDir = path.join(folderPath, '.run');
    await fs.mkdir(path.join(runDir, 'events'), { recursive: true });
    await fs.writeFile(
      path.join(runDir, 'events', '1.jsonl'),
      `${JSON.stringify({ type: 'started', timestamp: '2026-09-17T10:00:00.000Z' })}\n${JSON.stringify(
        {
          type: 'recertification',
          timestamp: '2026-09-17T10:05:00.000Z',
          data: {
            task: '1',
            outcome: 'passed',
            differingPaths: [],
            attribution: [],
            command: 'node verify.cjs',
            exitCode: 0,
            output: '',
            timedOut: false,
          },
        },
      )}\n`,
      'utf8',
    );
    await fs.mkdir(path.join(runDir, 'results'), { recursive: true });
    await fs.writeFile(path.join(runDir, 'results', '1.md'), '## Changed\n- kept\n', 'utf8');

    const withoutLog = await getSpecDetails(tmpDir, '001', DEFAULT_CONFIG);
    assert.deepEqual(withoutLog.planningSessions, []);
    assert.equal(withoutLog.tasks.length, 1);
    assert.ok(withoutLog.tasks[0].resultContent?.includes('kept'));
    assert.equal(withoutLog.recertifications.length, 1);
    assert.equal(withoutLog.timeline.length, 2);

    // Entirely malformed planning log.
    await fs.writeFile(path.join(runDir, 'plan.jsonl'), 'not json\nalso not json\n', 'utf8');
    const malformed = await getSpecDetails(tmpDir, '001', DEFAULT_CONFIG);
    assert.deepEqual(malformed.planningSessions, []);
    assert.equal(malformed.tasks.length, 1);
    assert.ok(malformed.tasks[0].resultContent?.includes('kept'));
    assert.equal(malformed.recertifications.length, 1);
    assert.equal(malformed.timeline.length, 2);
    const text = formatShowOutput(malformed);
    assert.ok(text.includes('(no planning sessions)'));
    assert.ok(text.includes('kept'));
    assert.ok(text.includes('Recertifications:'));
    assert.ok(text.includes('Event Timeline:'));
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

  it('derives ordered recertification rows with attribution from typed events', async () => {
    const folderPath = await createChangeFolder(tmpDir, '001-recert-spec', 'Recert Spec');
    await fs.writeFile(path.join(folderPath, 'tasks', '2.md'), taskMd('Second Task'), 'utf8');
    const eventsDir = path.join(folderPath, '.run', 'events');
    await fs.mkdir(eventsDir, { recursive: true });

    const passed = {
      type: 'recertification',
      timestamp: '2026-09-17T10:00:00.000Z',
      data: {
        task: '1',
        outcome: 'passed',
        differingPaths: ['src/b.ts (modified)', 'src/a.ts (added)'],
        attribution: [
          { path: 'src/a.ts (added)', attribution: '2' },
          { path: 'src/b.ts (modified)', attribution: 'ambiguous' },
        ],
        command: 'node verify.cjs',
        exitCode: 0,
        output: 'ok',
        timedOut: false,
        recordedHash: 'sha256:old',
        currentHash: 'sha256:new',
      },
    };
    const requeued = {
      type: 'recertification',
      timestamp: '2026-09-17T11:00:00.000Z',
      data: {
        task: '2',
        outcome: 'requeued',
        differingPaths: ['src/c.ts (deleted)'],
        attribution: [{ path: 'src/c.ts (deleted)', attribution: 'unknown' }],
        command: 'node verify.cjs',
        exitCode: 1,
        output: 'boom',
        timedOut: false,
        recordedHash: 'sha256:x',
        currentHash: 'sha256:y',
        attempt: 3,
        reason: 'scope_regression',
      },
    };
    await fs.writeFile(
      path.join(eventsDir, '1.jsonl'),
      `${JSON.stringify(passed)}\n${JSON.stringify({
        type: 'regressed',
        timestamp: '2026-09-17T09:00:00.000Z',
        data: { reason: 'scope_regression' },
      })}\n`,
      'utf8',
    );
    await fs.writeFile(path.join(eventsDir, '2.jsonl'), `${JSON.stringify(requeued)}\n`, 'utf8');
    // A change-level stream must never contribute a task recertification row.
    await fs.writeFile(path.join(eventsDir, 'change.jsonl'), `${JSON.stringify(passed)}\n`, 'utf8');

    const details = await getSpecDetails(tmpDir, '001', DEFAULT_CONFIG);

    assert.equal(details.recertifications.length, 2);
    const [first, second] = details.recertifications;
    assert.equal(first.taskNumber, '1');
    assert.equal(first.timestamp, '2026-09-17T10:00:00.000Z');
    assert.equal(first.outcome, 'passed');
    assert.deepEqual(first.differingPaths, ['src/a.ts (added)', 'src/b.ts (modified)']);
    assert.deepEqual(first.attribution, [
      { path: 'src/a.ts (added)', attribution: '2' },
      { path: 'src/b.ts (modified)', attribution: 'ambiguous' },
    ]);
    assert.equal(first.verify, 'node verify.cjs');
    assert.equal(first.exitCode, 0);
    assert.equal(first.timedOut, false);

    assert.equal(second.taskNumber, '2');
    assert.equal(second.timestamp, '2026-09-17T11:00:00.000Z');
    assert.equal(second.outcome, 'requeued');
    assert.equal(second.verify, 'node verify.cjs');
    assert.equal(second.exitCode, 1);
    assert.equal(second.timedOut, false);
    assert.deepEqual(second.attribution, [{ path: 'src/c.ts (deleted)', attribution: 'unknown' }]);

    // The raw append-only timeline is untouched by the derived projection.
    assert.equal(details.timeline.length, 4);
    assert.equal(
      details.timeline.some((event) => event.type === 'regressed'),
      true,
    );
  });

  it('derives recertification rows for archived changes', async () => {
    const archiveFolder = path.join(tmpDir, CHANGE_SPECS_DIR, 'archive', '050-archived-recert');
    await fs.mkdir(path.join(archiveFolder, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(archiveFolder, 'spec.md'), specMd('Archived Recert'), 'utf8');
    await fs.writeFile(
      path.join(archiveFolder, 'tasks', '1.md'),
      taskMd('Archived Recert Task'),
      'utf8',
    );
    const eventsDir = path.join(archiveFolder, '.run', 'events');
    await fs.mkdir(eventsDir, { recursive: true });
    await fs.writeFile(
      path.join(eventsDir, '1.jsonl'),
      `${JSON.stringify({
        type: 'recertification',
        timestamp: '2026-09-18T08:00:00.000Z',
        data: {
          task: '1',
          outcome: 'passed',
          differingPaths: ['src/a.ts (modified)'],
          attribution: [{ path: 'src/a.ts (modified)', attribution: 'ambiguous' }],
          command: 'node verify.cjs',
          exitCode: 0,
          output: '',
          timedOut: false,
          recordedHash: 'sha256:old',
          currentHash: 'sha256:new',
        },
      })}\n`,
      'utf8',
    );

    const details = await getSpecDetails(tmpDir, '050', DEFAULT_CONFIG);
    assert.equal(details.isArchived, true);
    assert.equal(details.recertifications.length, 1);
    assert.equal(details.recertifications[0].outcome, 'passed');
    assert.equal(details.recertifications[0].attribution[0].attribution, 'ambiguous');
  });

  it('orders recertification rows by valid timestamp then numeric task and event order', async () => {
    const folderPath = await createChangeFolder(tmpDir, '001-order-spec', 'Order Spec');
    const eventsDir = path.join(folderPath, '.run', 'events');
    await fs.mkdir(eventsDir, { recursive: true });

    const make = (task: string, outcome: 'passed' | 'requeued', timestamp: string) =>
      JSON.stringify({
        type: 'recertification',
        timestamp,
        data: {
          task,
          outcome,
          differingPaths: [],
          attribution: [],
          command: 'node verify.cjs',
          exitCode: 0,
          output: '',
          timedOut: false,
          recordedHash: 'sha256:old',
          currentHash: 'sha256:new',
        },
      });

    // Two same-timestamp events for task 1, a same-timestamp task 2, and an
    // earlier task 3.
    await fs.writeFile(
      path.join(eventsDir, '1.jsonl'),
      `${make('1', 'passed', '2026-09-17T10:00:00.000Z')}\n${make('1', 'requeued', '2026-09-17T10:00:00.000Z')}\n`,
      'utf8',
    );
    await fs.writeFile(
      path.join(eventsDir, '2.jsonl'),
      `${make('2', 'passed', '2026-09-17T10:00:00.000Z')}\n`,
      'utf8',
    );
    await fs.writeFile(
      path.join(eventsDir, '3.jsonl'),
      `${make('3', 'requeued', '2026-09-17T09:00:00.000Z')}\n`,
      'utf8',
    );

    const details = await getSpecDetails(tmpDir, '001', DEFAULT_CONFIG);
    assert.deepEqual(
      details.recertifications.map((row) => [row.taskNumber, row.outcome]),
      [
        ['3', 'requeued'],
        ['1', 'passed'],
        ['1', 'requeued'],
        ['2', 'passed'],
      ],
    );
  });

  it('renders malformed recertification data as unavailable without hiding other output', async () => {
    const folderPath = await createChangeFolder(tmpDir, '001-malformed-spec', 'Malformed Spec');
    const eventsDir = path.join(folderPath, '.run', 'events');
    await fs.mkdir(eventsDir, { recursive: true });
    await fs.writeFile(
      path.join(eventsDir, '4.jsonl'),
      `${JSON.stringify({
        type: 'recertification',
        timestamp: 'not-a-date',
        data: {
          outcome: 'other',
          differingPaths: 'not-an-array',
          attribution: [null, 42, { path: 'src/x.ts (modified)' }, { path: 'src/y.ts' }],
          command: 123,
          exitCode: 'nope',
          timedOut: 'yes',
        },
      })}\n${JSON.stringify({ type: 'recertification', timestamp: null })}\n`,
      'utf8',
    );
    await fs.writeFile(
      path.join(eventsDir, '1.jsonl'),
      `${JSON.stringify({ type: 'started', timestamp: '2026-09-17T10:00:00.000Z' })}\n`,
      'utf8',
    );

    const details = await getSpecDetails(tmpDir, '001', DEFAULT_CONFIG);
    assert.equal(details.recertifications.length, 2);

    const malformed = details.recertifications[0];
    assert.equal(malformed.taskNumber, '4');
    assert.equal(malformed.timestamp, null);
    assert.equal(malformed.outcome, null);
    assert.deepEqual(malformed.differingPaths, []);
    assert.deepEqual(malformed.attribution, [
      { path: 'src/x.ts (modified)', attribution: 'unknown' },
      { path: 'src/y.ts', attribution: 'unknown' },
    ]);
    assert.equal(malformed.verify, null);
    assert.equal(malformed.exitCode, null);
    assert.equal(malformed.timedOut, null);

    const noData = details.recertifications[1];
    assert.equal(noData.taskNumber, '4');
    assert.equal(noData.timestamp, null);
    assert.equal(noData.outcome, null);
    assert.deepEqual(noData.differingPaths, []);

    // Proposal, task, and timeline output still render.
    const text = formatShowOutput(details);
    assert.ok(text.includes('Malformed Spec'));
    assert.ok(text.includes('Tasks:'));
    assert.ok(text.includes('Event Timeline:'));
    assert.ok(text.includes('2026-09-17T10:00:00.000Z'));
    assert.ok(text.includes('Recertifications:'));
    assert.ok(text.includes('unavailable'));
    const recertSection = text.slice(
      text.indexOf('Recertifications:'),
      text.indexOf('Event Timeline:'),
    );
    assert.equal(recertSection.includes('[object Object]'), false);
  });

  it('renders and labels the Recertifications section only when rows exist', async () => {
    const folderPath = await createChangeFolder(tmpDir, '001-render-recert', 'Render Recert');
    const eventsDir = path.join(folderPath, '.run', 'events');
    await fs.mkdir(eventsDir, { recursive: true });
    await fs.writeFile(
      path.join(eventsDir, '1.jsonl'),
      `${JSON.stringify({ type: 'started', timestamp: '2026-09-17T09:00:00.000Z' })}\n`,
      'utf8',
    );

    const withoutRows = await getSpecDetails(tmpDir, '001', DEFAULT_CONFIG);
    assert.deepEqual(withoutRows.recertifications, []);
    const noSection = formatShowOutput(withoutRows);
    assert.equal(noSection.includes('Recertifications:'), false);
    assert.equal(noSection.includes('recertified'), false);

    const append = async (event: unknown) => {
      await fs.appendFile(path.join(eventsDir, '1.jsonl'), `${JSON.stringify(event)}\n`, 'utf8');
    };
    await append({
      type: 'recertification',
      timestamp: '2026-09-17T10:00:00.000Z',
      data: {
        task: '1',
        outcome: 'passed',
        differingPaths: ['src/a.ts (modified)'],
        attribution: [{ path: 'src/a.ts (modified)', attribution: '2' }],
        command: 'node verify.cjs',
        exitCode: 0,
        output: '',
        timedOut: false,
        recordedHash: 'sha256:old',
        currentHash: 'sha256:new',
      },
    });
    await append({
      type: 'recertification',
      timestamp: '2026-09-17T11:00:00.000Z',
      data: {
        task: '1',
        outcome: 'requeued',
        differingPaths: ['src/b.ts (modified)'],
        attribution: [{ path: 'src/b.ts (modified)', attribution: 'unknown' }],
        command: 'node verify.cjs',
        exitCode: 1,
        output: '',
        timedOut: true,
        recordedHash: 'sha256:old',
        currentHash: 'sha256:new',
      },
    });

    const details = await getSpecDetails(tmpDir, '001', DEFAULT_CONFIG);
    const text = formatShowOutput(details);
    assert.ok(text.includes('Recertifications:'));
    assert.ok(text.includes('recertified'));
    assert.ok(text.includes('requeued for agent work'));
    assert.ok(text.includes('attributed to task 2'));
    assert.ok(text.includes('unknown'));
    assert.ok(text.includes('Timed out: yes'));
    assert.ok(text.indexOf('Recertifications:') < text.indexOf('Event Timeline:'));
    assert.ok(text.indexOf('Planning Sessions:') < text.indexOf('Recertifications:'));
  });

  it('does not infer recertification history from done marker metadata', async () => {
    const folderPath = await createChangeFolder(tmpDir, '001-marker-only', 'Marker Only');
    const doneDir = path.join(folderPath, '.run', 'done');
    await fs.mkdir(doneDir, { recursive: true });
    await fs.writeFile(
      path.join(doneDir, '1'),
      `---
scope_hash: sha256:abc
recertified_at: 2026-09-17T10:00:00.000Z
recertification_count: 2
---
`,
      'utf8',
    );

    const details = await getSpecDetails(tmpDir, '001', DEFAULT_CONFIG);
    assert.deepEqual(details.recertifications, []);
    assert.equal(formatShowOutput(details).includes('Recertifications:'), false);
  });
});
