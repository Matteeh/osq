import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  EXECUTOR_STEPS,
  MANAGED_AGENTS_MD_BODY,
  MANAGED_PLANNER_BLOCK,
  OSQ_END_MARKER,
  OSQ_START_MARKER,
} from '../src/core/foundation/init-blocks.js';
import { buildExecutorPrompt } from '../src/harness/prompt.js';
import type { SpawnTaskOptions } from '../src/harness/types.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const OLD_EXECUTOR_STEP = 'then only the delta specs and capability specs it names';
const OLD_PLANNER_TEXT = 'the capability specs this change touches';

const NEW_EXECUTOR_STEP =
  '1. Read your task file, its parent `proposal.md`, and the delta specs it names. From living capability specs, read only the requirements the task or proposal names; `osq spec <capability> <requirement>` prints one. Nothing else.';

const NEW_PLANNER_STEP = [
  '1. Read `AGENTS.md`, the requirements this change touches, and one recent',
  "   archived change end to end. `osq spec <capability>` lists a living spec's",
  '   requirements and `osq spec <capability> <requirement>` prints one; read',
  '   those, not whole capability specs.',
].join('\n');

/** Slice the single managed block, markers included, out of a document. */
function extractManagedBlock(content: string): string {
  const start = content.indexOf(OSQ_START_MARKER);
  const end = content.indexOf(OSQ_END_MARKER);
  assert.notEqual(start, -1, 'document should contain OSQ_START_MARKER');
  assert.ok(end > start, 'OSQ_END_MARKER should follow OSQ_START_MARKER');
  return content.slice(start, end + OSQ_END_MARKER.length);
}

let tmpDir: string;

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-requirement-reading-'));
});

after(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function options(): SpawnTaskOptions {
  return {
    projectRoot: tmpDir,
    specFolderPath: path.join(tmpDir, 'openspec', 'changes', '121-test'),
    taskNumber: '2',
    taskTitle: 'When a task reads its requirements',
    verifyCommand: 'node -e "process.exit(0)"',
    scope: ['src/core/foundation/init-blocks.ts'],
    entry: ['src/core/foundation/init-blocks.ts'],
    skills: [],
    tier: 'coding',
  };
}

describe('executor requirement reading', () => {
  it('asks for named requirements in the constant, the block, and the prompt', () => {
    assert.equal(EXECUTOR_STEPS[0], NEW_EXECUTOR_STEP);
    const prompt = buildExecutorPrompt(options());

    for (const text of [EXECUTOR_STEPS.join('\n'), MANAGED_AGENTS_MD_BODY, prompt]) {
      assert.ok(text.includes(NEW_EXECUTOR_STEP), 'each should hold the new step 1');
      assert.equal(text.includes(OLD_EXECUTOR_STEP), false);
    }
  });

  it('keeps the repository copies of the executor block current', async () => {
    const copies = ['AGENTS.md', path.join('.opencode', 'agent', 'osq-coder.md')];
    for (const copy of copies) {
      const content = await fs.readFile(path.join(repoRoot, copy), 'utf8');
      const block = extractManagedBlock(content);
      assert.ok(block.includes(NEW_EXECUTOR_STEP), `${copy} should hold the new step 1`);
      assert.equal(
        block.includes(OLD_EXECUTOR_STEP),
        false,
        `${copy} should not hold the old step`,
      );
    }
  });
});

describe('planner requirement reading', () => {
  it('asks for the touched requirements in the managed planner block', () => {
    assert.ok(MANAGED_PLANNER_BLOCK.includes(NEW_PLANNER_STEP));
    assert.equal(MANAGED_PLANNER_BLOCK.includes(OLD_PLANNER_TEXT), false);
  });

  it('keeps the repository copies of the planner block current', async () => {
    const copies = ['PLANNER.md', path.join('templates', 'PLANNER.md')];
    for (const copy of copies) {
      const content = await fs.readFile(path.join(repoRoot, copy), 'utf8');
      const block = extractManagedBlock(content);
      assert.ok(block.includes(NEW_PLANNER_STEP), `${copy} should hold the new step 1`);
      assert.equal(
        block.includes(OLD_PLANNER_TEXT),
        false,
        `${copy} should not hold the old step 1`,
      );
    }
  });
});
