import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { showCommand } from '../src/cli/show.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
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

function taskMd(title: string, verify: string): string {
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

/** The rendered tasks section for one task, from its row to the next task row. */
function taskBlock(text: string, title: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.includes(`. ${title} [`));
  assert.ok(start >= 0, `task row for ${title} should render`);
  const block: string[] = [lines[start]];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}\[[ x>!]\] \d+\. /.test(lines[i])) break;
    block.push(lines[i]);
  }
  return block.join('\n');
}

/** Append one JSONL event to a numbered task stream. */
async function writeEvents(
  eventsDir: string,
  taskNumber: string,
  events: Record<string, unknown>[],
): Promise<void> {
  const body = events.map((event) => JSON.stringify(event)).join('\n');
  await fs.writeFile(path.join(eventsDir, `${taskNumber}.jsonl`), `${body}\n`, 'utf8');
}

describe('osq show retries and stuck tasks', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-show-retries-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('counts automatic retries and marks a task that is still stuck', async () => {
    const folderPath = path.join(tmpDir, CHANGE_SPECS_DIR, '001-retry-spec');
    await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(folderPath, 'spec.md'), specMd('Retry Spec'), 'utf8');
    await fs.writeFile(
      path.join(folderPath, 'tasks', '1.md'),
      taskMd('Retried Stuck Task', 'node task-one.cjs'),
      'utf8',
    );
    await fs.writeFile(
      path.join(folderPath, 'tasks', '2.md'),
      taskMd('Plain Task', 'node task-two.cjs'),
      'utf8',
    );

    const eventsDir = path.join(folderPath, '.run', 'events');
    await fs.mkdir(eventsDir, { recursive: true });

    // Task 1: a pre-spawn run, a manual retry, an automatic retry, then a stuck
    // event. Both derived lines must render after the verify lines.
    await writeEvents(eventsDir, '1', [
      {
        type: 'verify_ran',
        timestamp: '2026-09-17T10:00:00.000Z',
        data: { exitCode: 1, phase: 'pre_spawn', expected: 'red', mismatch: true },
      },
      {
        type: 'retry',
        timestamp: '2026-09-17T10:01:00.000Z',
        data: { task: 1, reason: 'verify_red', attempt: 2 },
      },
      {
        type: 'retry',
        timestamp: '2026-09-17T10:02:00.000Z',
        data: { task: 1, reason: 'verify_red', attempt: 3, automatic: true },
      },
      {
        type: 'stuck',
        timestamp: '2026-09-17T10:03:00.000Z',
        data: { task: 1, fingerprint: 'sha256:abc123' },
      },
    ]);

    // Task 2 has no retry and no stuck event, so it prints neither line.
    await writeEvents(eventsDir, '2', [
      { type: 'started', timestamp: '2026-09-17T11:00:00.000Z', data: { attempt: 1 } },
    ]);

    let captured = '';
    await showCommand('001', {
      cwd: tmpDir,
      config: DEFAULT_CONFIG,
      stdout: (msg) => {
        captured = msg;
      },
    });

    const first = taskBlock(captured, 'Retried Stuck Task');
    assert.ok(
      first.includes('      Retries: 2 (1 automatic)'),
      `task 1 should count both retries, got:\n${first}`,
    );
    assert.ok(
      first.includes('      Stuck: same failure twice (sha256:abc123)'),
      `task 1 should render its stuck fingerprint, got:\n${first}`,
    );

    const firstLines = first.split('\n');
    const verifyIndex = firstLines.findIndex((line) => line.startsWith('      Verify:'));
    const preSpawnIndex = firstLines.findIndex((line) =>
      line.startsWith('      Pre-spawn verify:'),
    );
    const retriesIndex = firstLines.findIndex((line) => line.startsWith('      Retries:'));
    const stuckIndex = firstLines.findIndex((line) => line.startsWith('      Stuck:'));
    assert.ok(verifyIndex >= 0 && preSpawnIndex >= 0 && retriesIndex >= 0 && stuckIndex >= 0);
    assert.ok(retriesIndex > verifyIndex && retriesIndex > preSpawnIndex);
    assert.ok(stuckIndex > retriesIndex);

    const second = taskBlock(captured, 'Plain Task');
    assert.equal(second.includes('Retries:'), false, `task 2 should have no retries:\n${second}`);
    assert.equal(second.includes('Stuck:'), false, `task 2 should not be stuck:\n${second}`);
  });

  it('drops the stuck line when a retry came after it', async () => {
    const folderPath = path.join(tmpDir, CHANGE_SPECS_DIR, '002-retried-spec');
    await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(folderPath, 'spec.md'), specMd('Retried Spec'), 'utf8');
    await fs.writeFile(
      path.join(folderPath, 'tasks', '1.md'),
      taskMd('Human Retried Task', 'node task-one.cjs'),
      'utf8',
    );

    const eventsDir = path.join(folderPath, '.run', 'events');
    await fs.mkdir(eventsDir, { recursive: true });
    await writeEvents(eventsDir, '1', [
      {
        type: 'stuck',
        timestamp: '2026-09-17T10:00:00.000Z',
        data: { task: 1, fingerprint: 'sha256:dead' },
      },
      {
        type: 'retry',
        timestamp: '2026-09-17T10:05:00.000Z',
        data: { task: 1, reason: 'verify_red', attempt: 2 },
      },
    ]);

    let captured = '';
    await showCommand('002', {
      cwd: tmpDir,
      config: DEFAULT_CONFIG,
      stdout: (msg) => {
        captured = msg;
      },
    });

    const block = taskBlock(captured, 'Human Retried Task');
    assert.ok(block.includes('      Retries: 1 (0 automatic)'), `retries should render:\n${block}`);
    assert.equal(block.includes('Stuck:'), false, `a later retry clears stuck:\n${block}`);
  });
});
