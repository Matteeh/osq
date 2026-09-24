import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { buildBaseOpeningPrompt } from '../src/cli/plan-queue.js';
import {
  EXECUTOR_STEPS,
  MANAGED_AGENTS_MD_BODY,
  MANAGED_PLANNER_BLOCK,
  OSQ_END_MARKER,
  OSQ_START_MARKER,
} from '../src/core/foundation/init-blocks.js';
import { scaffoldProject } from '../src/core/foundation/init.js';

/** Collapse the block's line wrapping so a quoted sentence can be asserted. */
function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Slice the single managed block, markers included, out of a document. */
function extractManagedBlock(content: string): string {
  const start = content.indexOf(OSQ_START_MARKER);
  const end = content.indexOf(OSQ_END_MARKER);
  assert.notEqual(start, -1, 'document should contain OSQ_START_MARKER');
  assert.ok(end > start, 'OSQ_END_MARKER should follow OSQ_START_MARKER');
  return content.slice(start, end + OSQ_END_MARKER.length);
}

describe('managed wording constants', () => {
  it('executor step 3 explains the expected red start', () => {
    const step = EXECUTOR_STEPS.find((line) => line.startsWith('3. '));
    assert.ok(step, 'executor step 3 should exist');
    assert.ok(
      flatten(step).includes(
        'A `verify` that names a file your task creates fails until that file exists, so starting red is expected.',
      ),
    );
  });

  it('managed AGENTS.md ownership line is addressed to executors and names planners', () => {
    assert.ok(
      flatten(MANAGED_AGENTS_MD_BODY).includes(
        '- Executors never edit `tasks.md` or any file under `.run/` except their result file; those belong to the watcher and the human. Planners write `tasks.md` and the task files.',
      ),
    );
  });

  it('planner block writes the folder unless the human asks to review first', () => {
    const block = flatten(MANAGED_PLANNER_BLOCK);
    assert.ok(
      block.includes(
        '2. Write the change folder. Stop after the task list only when the human asks to review it first; then reply with the parent spec, the task list (titles only), the capability specs this change will write, and any `## Human steps`, and say the change folder is not written yet.',
      ),
    );
    assert.equal(
      block.includes('Write the change folder only after the human approves the list'),
      false,
    );
  });

  it('planner block finishes by naming the exact approve command', () => {
    assert.ok(
      flatten(MANAGED_PLANNER_BLOCK).includes(
        '- Finish by telling the human, in chat, the task titles, that the change folder is written and `osq lint` passes, and the exact `osq approve <id>` to run. The human should not approve before that message.',
      ),
    );
  });

  it('parent spec guidance covers human steps, cross-capability deltas, and replacement', () => {
    const block = flatten(MANAGED_PLANNER_BLOCK);
    assert.ok(
      block.includes(
        '- Anything a task must not do itself goes under `## Human steps`, which never includes `osq approve`.',
      ),
    );
    assert.ok(
      block.includes(
        "- Guidance a task needs about another capability's code, such as how to test against it, goes into that capability's spec through a delta, not only into the task.",
      ),
    );
    assert.ok(
      block.includes(
        "- Replacing a requirement's behavior is a REMOVED requirement plus an ADDED one. A MODIFIED requirement must keep every scenario it already has; `osq lint` and archive refuse one that drops any.",
      ),
    );
  });
});

describe('plan prompt spec list label', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-managed-wording-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('labels the list and still lists every living spec', async () => {
    const specsDir = path.join(tmpDir, 'openspec', 'specs');
    await fs.mkdir(path.join(specsDir, 'alpha'), { recursive: true });
    await fs.mkdir(path.join(specsDir, 'beta'), { recursive: true });
    await fs.writeFile(path.join(specsDir, 'alpha', 'spec.md'), '# alpha\n', 'utf8');
    await fs.writeFile(path.join(specsDir, 'beta', 'spec.md'), '# beta\n', 'utf8');

    const prompt = await buildBaseOpeningPrompt({
      projectRoot: tmpDir,
      folderPath: path.join(tmpDir, 'openspec', 'changes', '001-test'),
      specId: '001',
      specTitle: 'Test',
      briefContent: 'Brief.\n',
      openspecRoot: 'openspec',
    });

    const sentence = 'All living specs. Read the ones this change writes or whose code it uses.';
    const headerIdx = prompt.indexOf('## Capability Specs');
    const sentenceIdx = prompt.indexOf(sentence);
    const alphaIdx = prompt.indexOf('- openspec/specs/alpha/spec.md');
    const betaIdx = prompt.indexOf('- openspec/specs/beta/spec.md');

    assert.notEqual(headerIdx, -1, 'prompt should carry the Capability Specs heading');
    assert.notEqual(sentenceIdx, -1, 'prompt should carry the label sentence');
    assert.notEqual(alphaIdx, -1, 'prompt should list every living spec');
    assert.notEqual(betaIdx, -1, 'prompt should list every living spec');
    assert.ok(headerIdx < sentenceIdx, 'sentence follows the heading');
    assert.ok(sentenceIdx < alphaIdx && sentenceIdx < betaIdx, 'sentence precedes the list');
  });
});

describe('osq init refreshes older managed blocks', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-managed-wording-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('replaces both stale managed blocks with the current constants', async () => {
    const oldAgents = `# Agents\n\n${OSQ_START_MARKER}\n## Executing a task\n\nold executor text\n${OSQ_END_MARKER}\n`;
    const oldPlanner = `# Planning a change for osq\n\n${OSQ_START_MARKER}\n## Planning a change\n\nold planner text\n${OSQ_END_MARKER}\n`;
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), oldAgents, 'utf8');
    await fs.writeFile(path.join(tmpDir, 'PLANNER.md'), oldPlanner, 'utf8');

    await scaffoldProject(tmpDir);

    const agents = await fs.readFile(path.join(tmpDir, 'AGENTS.md'), 'utf8');
    const planner = await fs.readFile(path.join(tmpDir, 'PLANNER.md'), 'utf8');

    assert.equal(extractManagedBlock(agents), MANAGED_AGENTS_MD_BODY);
    assert.equal(extractManagedBlock(planner), MANAGED_PLANNER_BLOCK);
    assert.equal(agents.includes('old executor text'), false);
    assert.equal(planner.includes('old planner text'), false);
  });
});
