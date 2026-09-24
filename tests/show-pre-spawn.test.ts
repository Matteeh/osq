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

describe('osq show pre-spawn verify', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-show-pre-spawn-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('prints the latest pre-spawn outcome per task and keeps the timeline', async () => {
    const folderPath = path.join(tmpDir, CHANGE_SPECS_DIR, '001-pre-spawn-spec');
    await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(folderPath, 'spec.md'), specMd('Pre Spawn Spec'), 'utf8');
    await fs.writeFile(
      path.join(folderPath, 'tasks', '1.md'),
      taskMd('Mismatched Task', 'node task-one.cjs'),
      'utf8',
    );
    await fs.writeFile(
      path.join(folderPath, 'tasks', '2.md'),
      taskMd('Matched Task', 'node task-two.cjs'),
      'utf8',
    );
    await fs.writeFile(
      path.join(folderPath, 'tasks', '3.md'),
      taskMd('Unavailable Task', 'node task-three.cjs'),
      'utf8',
    );
    await fs.writeFile(
      path.join(folderPath, 'tasks', '4.md'),
      taskMd('Post Only Task', 'node task-four.cjs'),
      'utf8',
    );

    const eventsDir = path.join(folderPath, '.run', 'events');
    await fs.mkdir(eventsDir, { recursive: true });

    // Task 1: an earlier matching pre-spawn run, a later mismatching one, and a
    // post-spawn run that must never override the latest pre-spawn result.
    await writeEvents(eventsDir, '1', [
      {
        type: 'verify_ran',
        timestamp: '2026-09-17T10:00:00.000Z',
        data: { exitCode: 1, phase: 'pre_spawn', expected: 'red', mismatch: false },
      },
      {
        type: 'verify_ran',
        timestamp: '2026-09-17T10:01:00.000Z',
        data: { exitCode: 1, phase: 'pre_spawn', expected: 'red', mismatch: true },
      },
      { type: 'started', timestamp: '2026-09-17T10:02:00.000Z' },
      {
        type: 'verify_ran',
        timestamp: '2026-09-17T10:05:00.000Z',
        data: { exitCode: 0 },
      },
    ]);

    // Task 2: a matching pre-spawn run.
    await writeEvents(eventsDir, '2', [
      {
        type: 'verify_ran',
        timestamp: '2026-09-17T11:00:00.000Z',
        data: { exitCode: 0, phase: 'pre_spawn', expected: 'red', mismatch: false },
      },
    ]);

    // Task 3: missing exit code and expected state render as unavailable.
    await writeEvents(eventsDir, '3', [
      {
        type: 'verify_ran',
        timestamp: '2026-09-17T12:00:00.000Z',
        data: { phase: 'pre_spawn', mismatch: false },
      },
    ]);

    // Task 4: only a post-spawn run, so no pre-spawn line exists.
    await writeEvents(eventsDir, '4', [
      {
        type: 'verify_ran',
        timestamp: '2026-09-17T13:00:00.000Z',
        data: { exitCode: 0 },
      },
    ]);

    let captured = '';
    await showCommand('001', {
      cwd: tmpDir,
      config: DEFAULT_CONFIG,
      stdout: (msg) => {
        captured = msg;
      },
    });
    const text = captured;

    const first = taskBlock(text, 'Mismatched Task');
    assert.ok(
      first.includes('      Pre-spawn verify: started red: verify fails'),
      `task 1 should read a red start, got:\n${first}`,
    );
    // Directly after the Verify line.
    const firstLines = first.split('\n');
    const verifyIndex = firstLines.findIndex((line) => line.trim().startsWith('Verify:'));
    assert.ok(verifyIndex >= 0, 'task 1 Verify line should render');
    assert.equal(firstLines[verifyIndex + 1], '      Pre-spawn verify: started red: verify fails');

    const second = taskBlock(text, 'Matched Task');
    assert.ok(
      second.includes('      Pre-spawn verify: started green, but it declared red'),
      `task 2 should read a green start declared red, got:\n${second}`,
    );

    const third = taskBlock(text, 'Unavailable Task');
    assert.ok(
      third.includes('      Pre-spawn verify: unavailable'),
      `task 3 should read unavailable values, got:\n${third}`,
    );

    // A task without a pre-spawn event prints no line.
    const fourth = taskBlock(text, 'Post Only Task');
    assert.equal(fourth.includes('Pre-spawn verify:'), false);

    // The raw timeline still lists both pre-spawn and post-spawn runs.
    assert.ok(text.includes('2026-09-17T10:01:00.000Z'));
    assert.ok(text.includes('2026-09-17T10:05:00.000Z'));
    assert.equal(text.split('\n').filter((line) => line.includes('[Task 1] verify_ran')).length, 3);
  });
});
