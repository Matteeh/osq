import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { showCommand } from '../src/cli/show.js';
import { statusCommand } from '../src/cli/status.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { writeUsagePause } from '../src/core/run/usage-pause.js';
import { formatNextStep, readNextStep } from '../src/core/status/next-step.js';

const CHANGES_DIR = path.join('openspec', 'changes');

function proposalMd(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    `${title} goal.`,
    '',
  ].join('\n');
}

function taskMd(): string {
  return [
    '---',
    'title: Pending task',
    'verify: node verify.cjs',
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] does the thing',
    '',
  ].join('\n');
}

/** An approved change 007 with one pending task, so its state is running. */
async function createApprovedChange(root: string): Promise<string> {
  const folderPath = path.join(root, CHANGES_DIR, '007-pricing');
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMd('Pricing'), 'utf8');
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), taskMd(), 'utf8');
  await fs.mkdir(path.join(folderPath, '.run'), { recursive: true });
  await fs.writeFile(path.join(folderPath, '.run', 'approved'), 'sha256:fixture\n', 'utf8');
  return folderPath;
}

async function capture(run: (stdout: (text: string) => void) => Promise<string>): Promise<string> {
  let captured = '';
  await run((text) => {
    captured = text;
  });
  return captured;
}

describe('usage pause next step', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-usage-pause-next-step-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('Paused format', async () => {
    const folderPath = await createApprovedChange(root);
    await writeUsagePause(folderPath, {
      task: '1',
      until: '2099-01-01T09:30:00.000Z',
      source: 'harness',
    });

    const step = await readNextStep(root, folderPath, DEFAULT_CONFIG);
    assert.deepEqual(step, {
      state: 'running',
      command: 'osq show 007',
      detail: 'paused until 2099-01-01 09:30 UTC',
    });
    assert.equal(
      formatNextStep(step),
      'running (paused until 2099-01-01 09:30 UTC) — osq show 007',
    );

    const show = await capture((stdout) =>
      showCommand('007', { cwd: root, config: DEFAULT_CONFIG, stdout }),
    );
    assert.ok(
      show.includes('Next: running (paused until 2099-01-01 09:30 UTC) — osq show 007'),
      show,
    );

    const status = await capture((stdout) =>
      statusCommand({ cwd: root, config: DEFAULT_CONFIG, stdout }),
    );
    assert.ok(
      status.includes('  next: running (paused until 2099-01-01 09:30 UTC) — osq show 007'),
      status,
    );
  });

  it('Passed pause format', async () => {
    const folderPath = await createApprovedChange(root);
    await writeUsagePause(folderPath, {
      task: '1',
      until: '2000-01-01T00:00:00.000Z',
      source: 'wait',
    });

    const step = await readNextStep(root, folderPath, DEFAULT_CONFIG);
    assert.deepEqual(step, { state: 'running', command: 'osq show 007', detail: null });
    assert.equal(formatNextStep(step), 'running — osq show 007');

    const show = await capture((stdout) =>
      showCommand('007', { cwd: root, config: DEFAULT_CONFIG, stdout }),
    );
    assert.ok(show.includes('Next: running — osq show 007'), show);
    assert.ok(!show.includes('paused until'), show);

    const status = await capture((stdout) =>
      statusCommand({ cwd: root, config: DEFAULT_CONFIG, stdout }),
    );
    assert.ok(status.includes('  next: running — osq show 007'), status);
    assert.ok(!status.includes('paused until'), status);
  });
});
