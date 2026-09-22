import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  MANAGED_PLANNER_BLOCK,
  OSQ_END_MARKER,
  OSQ_START_MARKER,
  scaffoldProject,
  updatePlannerMd,
} from '../src/core/foundation/init.js';

/** Slice the managed planner block out of a document, markers included. */
function extractManagedBlock(content: string): string {
  const startIndex = content.indexOf(OSQ_START_MARKER);
  const endIndex = content.indexOf(OSQ_END_MARKER);

  assert.ok(startIndex !== -1, 'content should contain OSQ_START_MARKER');
  assert.ok(endIndex > startIndex, 'OSQ_END_MARKER should follow OSQ_START_MARKER');
  return content.slice(startIndex, endIndex + OSQ_END_MARKER.length);
}

/** Slice the `### Tasks` planning guidance out of the managed block. */
function tasksGuidance(block: string): string {
  const startIndex = block.indexOf('### Tasks');
  const endIndex = block.indexOf('### Parent spec');

  assert.ok(startIndex !== -1, 'block should contain the Tasks guidance');
  assert.ok(endIndex > startIndex, 'Parent spec should follow the Tasks guidance');
  return block.slice(startIndex, endIndex);
}

describe('osq init PLANNER.md', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-init-planner-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('creates PLANNER.md with the managed block when missing', async () => {
    const updated = await updatePlannerMd(tmpDir);
    assert.equal(updated, true);

    const content = await fs.readFile(path.join(tmpDir, 'PLANNER.md'), 'utf8');
    assert.ok(content.startsWith('# Planning a change for osq'));
    assert.ok(content.includes(MANAGED_PLANNER_BLOCK));
    assert.ok(content.includes(OSQ_START_MARKER));
    assert.ok(content.includes(OSQ_END_MARKER));
  });

  it('replaces the managed block while preserving content outside the markers', async () => {
    const plannerPath = path.join(tmpDir, 'PLANNER.md');
    await fs.writeFile(
      plannerPath,
      `# House rules\n\nKeep this preamble.\n\n${OSQ_START_MARKER}\nstale block\n${OSQ_END_MARKER}\n\n## Appendix\n\nKeep this too.\n`,
    );

    const updated = await updatePlannerMd(tmpDir);
    assert.equal(updated, true);

    const content = await fs.readFile(plannerPath, 'utf8');
    assert.equal(content.includes('stale block'), false);
    assert.ok(content.startsWith('# House rules\n\nKeep this preamble.'));
    assert.ok(content.includes(MANAGED_PLANNER_BLOCK));
    assert.ok(content.includes('## Appendix\n\nKeep this too.'));
    assert.equal(content.split(OSQ_START_MARKER).length - 1, 1);
    assert.equal(content.split(OSQ_END_MARKER).length - 1, 1);
    assert.ok(content.includes('re-runnable against the final tree'));
    assert.ok(content.includes('name the shared file in the proposal'));
  });

  it('appends the managed block when markers are absent', async () => {
    const plannerPath = path.join(tmpDir, 'PLANNER.md');
    await fs.writeFile(plannerPath, '# House rules\n\nExisting content.\n');

    await updatePlannerMd(tmpDir);

    const content = await fs.readFile(plannerPath, 'utf8');
    assert.ok(content.startsWith('# House rules\n\nExisting content.'));
    assert.ok(content.includes(MANAGED_PLANNER_BLOCK));
    assert.equal(content.split(OSQ_START_MARKER).length - 1, 1);
    assert.equal(content.split(OSQ_END_MARKER).length - 1, 1);
  });

  it('managed block instructs planners to write files with the file tool', () => {
    assert.ok(
      MANAGED_PLANNER_BLOCK.includes('Write files with the file tool, never through a shell echo.'),
    );
  });

  it('managed block states the handoff read, write-boundary, lint, and no-approval rules', () => {
    assert.ok(MANAGED_PLANNER_BLOCK.includes('plan-prompt.md'));
    assert.ok(MANAGED_PLANNER_BLOCK.includes('Write only inside that change folder'));
    assert.ok(MANAGED_PLANNER_BLOCK.includes('osq lint <slug>'));
    assert.ok(MANAGED_PLANNER_BLOCK.includes('Never run `osq approve`'));
  });

  it('managed block encodes the slicing rule', () => {
    assert.ok(MANAGED_PLANNER_BLOCK.includes('real entry point'));
    assert.ok(MANAGED_PLANNER_BLOCK.includes('widen it or merge the task'));
    assert.ok(MANAGED_PLANNER_BLOCK.includes('outside its scope is a planning failure'));
  });

  it('managed block encodes the detail rule', () => {
    assert.ok(
      MANAGED_PLANNER_BLOCK.includes(
        'without signature blocks, numbered implementation steps, or line numbers',
      ),
    );
    assert.ok(MANAGED_PLANNER_BLOCK.includes('full signatures only for ports'));
  });

  it('managed block encodes the change-level verify rule', () => {
    assert.ok(MANAGED_PLANNER_BLOCK.includes('change-level `verify`'));
    assert.ok(MANAGED_PLANNER_BLOCK.includes('written after the goal'));
  });

  it('managed block requires final-tree verification inside the Tasks guidance', () => {
    const tasks = tasksGuidance(MANAGED_PLANNER_BLOCK);

    assert.ok(tasks.includes('verify: node -e "process.exit(0)"'));
    assert.ok(tasks.includes('planning sentinel, not trusted coverage'));
    assert.ok(tasks.includes('before approval'));
    assert.ok(tasks.includes('re-runnable against the final tree'));
    assert.ok(tasks.includes('watcher and archive recertification'));
  });

  it('managed block requires ordered shared-file ownership inside the Tasks guidance', () => {
    const tasks = tasksGuidance(MANAGED_PLANNER_BLOCK);

    assert.ok(tasks.includes('A file belongs to one task'));
    assert.ok(tasks.includes('later task after the owner'));
    assert.ok(tasks.includes('name the shared file in the proposal'));
  });

  it('repository PLANNER.md carries the file-tool instruction', async () => {
    const content = await fs.readFile(path.join(process.cwd(), 'PLANNER.md'), 'utf8');

    assert.ok(content.includes('Write files with the file tool, never through a shell echo.'));
  });

  it('scaffoldProject initializes PLANNER.md and reports it on InitResult', async () => {
    const result = await scaffoldProject(tmpDir);
    assert.equal(result.updatedPlannerMd, true);

    const content = await fs.readFile(path.join(tmpDir, 'PLANNER.md'), 'utf8');
    assert.ok(content.includes(OSQ_START_MARKER));
    assert.ok(content.includes(OSQ_END_MARKER));
    assert.equal(extractManagedBlock(content), MANAGED_PLANNER_BLOCK);
    assert.ok(content.includes('re-runnable against the final tree'));
    assert.ok(content.includes('A file belongs to one task'));
  });

  it('PLANNER.md, MANAGED_PLANNER_BLOCK, and templates/PLANNER.md are byte-for-byte equal', async () => {
    const planner = await fs.readFile(path.join(process.cwd(), 'PLANNER.md'), 'utf8');
    const template = await fs.readFile(path.join(process.cwd(), 'templates', 'PLANNER.md'), 'utf8');

    assert.equal(extractManagedBlock(planner), MANAGED_PLANNER_BLOCK);
    assert.equal(template, MANAGED_PLANNER_BLOCK);
    assert.ok(extractManagedBlock(planner).includes('re-runnable against the final tree'));
    assert.ok(extractManagedBlock(planner).includes('A file belongs to one task'));
  });
});
