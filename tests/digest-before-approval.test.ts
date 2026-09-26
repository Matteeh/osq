import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { buildApprovalDigest, formatApprovalDigest } from '../src/core/spec/digest.js';

const TASK_VERIFY = 'node --import tsx --test tests/placeholder.test.ts';

function taskContent(): string {
  return `---\ntitle: Do the thing\nverify: ${TASK_VERIFY}\nscope:\n  - src/one.ts\nentry: []\nskills: []\n---\n## Acceptance\n- [ ] one line\n`;
}

function proposalContent(humanSteps: string): string {
  return `---\ntitle: Fixture\nverify: pnpm verify\n---\n## Goal\n\nDo a thing.\n\n## Human steps\n\n${humanSteps}\n`;
}

describe('digest steps before approval', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-digest-before-approval-'));
    await fs.mkdir(path.join(projectRoot, 'openspec', 'changes'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  async function makeChange(folder: string, humanSteps: string): Promise<string> {
    const folderPath = path.join(projectRoot, 'openspec', 'changes', folder);
    await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalContent(humanSteps), 'utf8');
    await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), taskContent(), 'utf8');
    return folderPath;
  }

  it('carries steps before approval and prints them right after the goal', async () => {
    const folder = await makeChange(
      '001-steps',
      '### Before approval\n\nCreate the test database\n\n### After landing\n\nDeploy it\n',
    );

    const digest = await buildApprovalDigest(projectRoot, folder, DEFAULT_CONFIG);

    assert.equal(digest.beforeApproval, 'Create the test database');
    assert.ok(digest.humanSteps.includes('### Before approval'));
    assert.ok(digest.humanSteps.includes('Deploy it'));

    const text = formatApprovalDigest(digest);
    const before = text.indexOf('Before approval, do these first:');
    const tasks = text.indexOf('Tasks:');
    assert.ok(before >= 0);
    assert.ok(before < tasks);
    assert.ok(text.includes('  Create the test database'));
    assert.ok(text.includes('Human steps:'));
  });

  it('formats exactly as before when human steps read None', async () => {
    const folder = await makeChange('002-none', 'None');

    const digest = await buildApprovalDigest(projectRoot, folder, DEFAULT_CONFIG);

    assert.equal(digest.beforeApproval, '');
    assert.equal(digest.humanSteps, 'None');

    const text = formatApprovalDigest(digest);
    assert.ok(!text.includes('Before approval'));
    assert.equal(
      text,
      [
        'Change: 002-none',
        'Goal: Do a thing.',
        'Tasks:',
        '  1. Do the thing (0 scope files)',
        'Capabilities:',
        '  (none)',
        'Human steps:',
        '  None',
      ].join('\n'),
    );
  });
});
