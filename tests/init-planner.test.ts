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
} from '../src/core/init.js';

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
  });

  it('repository PLANNER.md contains the current managed block between markers', async () => {
    const content = await fs.readFile(path.join(process.cwd(), 'PLANNER.md'), 'utf8');
    const startIndex = content.indexOf(OSQ_START_MARKER);
    const endIndex = content.indexOf(OSQ_END_MARKER);

    assert.ok(startIndex !== -1, 'PLANNER.md should contain OSQ_START_MARKER');
    assert.ok(endIndex > startIndex, 'OSQ_END_MARKER should follow OSQ_START_MARKER');
    assert.ok(content.includes(MANAGED_PLANNER_BLOCK));
  });
});
