import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { formatInboxText, projectNeedsYou } from '../src/core/status/inbox.js';
import { formatNextStep, readNextStep } from '../src/core/status/next-step.js';
import { getStatusOverview } from '../src/core/status/status.js';

const CONFIG: OsqConfig = DEFAULT_CONFIG;

function proposalMd(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'verify: node verify.cjs',
    'depends_on: []',
    '---',
    '## Goal',
    `${title} goal.`,
    '',
  ].join('\n');
}

function taskMd(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'verify: node task.cjs',
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    `- [ ] ${title} criterion`,
    '',
  ].join('\n');
}

async function writeMarker(folderPath: string, rel: string, content: string): Promise<void> {
  const target = path.join(folderPath, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** An approved change whose change-level regression marker is present. */
async function createChangeHaltedAtChangeLevel(
  root: string,
  folderName: string,
  title: string,
): Promise<string> {
  const dir = path.join(root, 'openspec', 'changes', folderName);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(title), 'utf8');
  await fs.writeFile(path.join(dir, 'tasks', '1.md'), taskMd('Task one'), 'utf8');
  await writeMarker(dir, path.join('.run', 'approved'), 'sha256:fixture\n');
  await writeMarker(
    dir,
    path.join('.run', 'regressed', 'change.md'),
    '---\nreason: worktree_dirty\n---\n',
  );
  return dir;
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-change-halt-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('change-level halt hint', () => {
  it('names osq retry <id> change in the inbox when no task is dead or regressed', async () => {
    const dir = await createChangeHaltedAtChangeLevel(tmpDir, '004-change', 'Change regression');
    const step = await readNextStep(tmpDir, dir, CONFIG);
    assert.equal(step.state, 'dead');
    assert.equal(step.command, 'osq retry 004 change');
    assert.equal(formatNextStep(step), 'dead — osq retry 004 change');

    const overview = await getStatusOverview(tmpDir, CONFIG);
    const items = projectNeedsYou(overview);
    const changeRegressed = items.find((item) => item.kind === 'change-regressed');
    assert.ok(changeRegressed, 'expected a change-regressed item');
    assert.equal(changeRegressed.change.id, '004');
    assert.equal(changeRegressed.task, null);
    assert.equal(changeRegressed.command, 'osq retry 004 change');

    const text = formatInboxText({
      needsYou: items,
      running: [],
      landed: [],
    });
    assert.ok(
      text.includes('  004: Change regression — change regressed — osq retry 004 change'),
      text,
    );
  });

  it('points a change regression at osq retry <id> change as the next step', async () => {
    const dir = await createChangeHaltedAtChangeLevel(tmpDir, '007-reg', 'Reg');
    const step = await readNextStep(tmpDir, dir, CONFIG);
    assert.deepEqual(step, { state: 'dead', command: 'osq retry 007 change', detail: null });
  });
});
