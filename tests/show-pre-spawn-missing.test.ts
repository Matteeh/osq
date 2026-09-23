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

describe('osq show pre-spawn verify missing paths', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-show-pre-spawn-missing-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('names the recorded missing paths and leaves runs without them unchanged', async () => {
    const folderPath = path.join(tmpDir, CHANGE_SPECS_DIR, '001-pre-spawn-missing-spec');
    await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(folderPath, 'spec.md'), specMd('Pre Spawn Missing Spec'), 'utf8');
    await fs.writeFile(
      path.join(folderPath, 'tasks', '1.md'),
      taskMd('Missing Paths Task', 'node task-one.cjs'),
      'utf8',
    );
    await fs.writeFile(
      path.join(folderPath, 'tasks', '2.md'),
      taskMd('No Missing Paths Task', 'node task-two.cjs'),
      'utf8',
    );
    await fs.writeFile(
      path.join(folderPath, 'tasks', '3.md'),
      taskMd('Malformed Missing Paths Task', 'node task-three.cjs'),
      'utf8',
    );

    const eventsDir = path.join(folderPath, '.run', 'events');
    await fs.mkdir(eventsDir, { recursive: true });

    // Task 1: a passing pre-spawn run that recorded two missing named paths.
    await writeEvents(eventsDir, '1', [
      {
        type: 'verify_ran',
        timestamp: '2026-09-17T10:00:00.000Z',
        data: {
          exitCode: 0,
          phase: 'pre_spawn',
          expected: 'red',
          mismatch: false,
          missingPaths: ['tests/a.test.ts', 'tests/b.test.ts'],
        },
      },
    ]);

    // Task 2: a matching pre-spawn run with no recorded missing paths.
    await writeEvents(eventsDir, '2', [
      {
        type: 'verify_ran',
        timestamp: '2026-09-17T11:00:00.000Z',
        data: { exitCode: 0, phase: 'pre_spawn', expected: 'red', mismatch: false },
      },
    ]);

    // Task 3: a malformed missing-path value must not change the line.
    await writeEvents(eventsDir, '3', [
      {
        type: 'verify_ran',
        timestamp: '2026-09-17T12:00:00.000Z',
        data: {
          exitCode: 0,
          phase: 'pre_spawn',
          expected: 'red',
          mismatch: false,
          missingPaths: [42],
        },
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

    const first = taskBlock(text, 'Missing Paths Task');
    assert.ok(
      first.includes(
        '      Pre-spawn verify: exit 0, expected red, matched, missing tests/a.test.ts, tests/b.test.ts',
      ),
      `task 1 should name its missing paths, got:\n${first}`,
    );
    const firstLines = first.split('\n');
    const verifyIndex = firstLines.findIndex((line) => line.trim().startsWith('Verify:'));
    assert.ok(verifyIndex >= 0, 'task 1 Verify line should render');
    assert.equal(
      firstLines[verifyIndex + 1],
      '      Pre-spawn verify: exit 0, expected red, matched, missing tests/a.test.ts, tests/b.test.ts',
    );

    const second = taskBlock(text, 'No Missing Paths Task');
    assert.ok(
      second.includes('      Pre-spawn verify: exit 0, expected red, matched\n'),
      `task 2 should keep the unchanged line, got:\n${second}`,
    );

    const third = taskBlock(text, 'Malformed Missing Paths Task');
    assert.ok(
      third.includes('      Pre-spawn verify: exit 0, expected red, matched\n'),
      `task 3 should keep the unchanged line, got:\n${third}`,
    );
  });

  it('keeps the line unchanged for an empty missing-path list', async () => {
    const folderPath = path.join(tmpDir, CHANGE_SPECS_DIR, '001-empty-missing-spec');
    await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(folderPath, 'spec.md'), specMd('Empty Missing Spec'), 'utf8');
    await fs.writeFile(
      path.join(folderPath, 'tasks', '1.md'),
      taskMd('Empty Missing Paths Task', 'node task-one.cjs'),
      'utf8',
    );

    const eventsDir = path.join(folderPath, '.run', 'events');
    await fs.mkdir(eventsDir, { recursive: true });
    await writeEvents(eventsDir, '1', [
      {
        type: 'verify_ran',
        timestamp: '2026-09-17T10:00:00.000Z',
        data: {
          exitCode: 0,
          phase: 'pre_spawn',
          expected: 'red',
          mismatch: false,
          missingPaths: [],
        },
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

    const block = taskBlock(captured, 'Empty Missing Paths Task');
    assert.ok(
      block.includes('      Pre-spawn verify: exit 0, expected red, matched\n'),
      `empty missing paths should keep the unchanged line, got:\n${block}`,
    );
  });
});
