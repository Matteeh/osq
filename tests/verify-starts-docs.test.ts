import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MANAGED_PLANNER_BLOCK } from '../src/core/foundation/init-blocks.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readFile(relative: string): Promise<string> {
  return fs.readFile(path.join(REPO_ROOT, relative), 'utf8');
}

async function readReadme(): Promise<string> {
  const raw = await readFile('README.md');
  // Collapse line wrapping so prose phrases match regardless of where they break.
  return raw.replace(/\s+/g, ' ');
}

function section(readme: string, heading: string, next: string): string {
  const start = readme.indexOf(heading);
  assert.ok(start >= 0, `README must contain ${heading}`);
  const end = readme.indexOf(next, start + heading.length);
  assert.ok(end >= 0, `README must contain ${next} after ${heading}`);
  return readme.slice(start, end);
}

describe('verify starts documentation', () => {
  it('managed planner block states the red rule, the shared verify, and the honest any rule', () => {
    const block = MANAGED_PLANNER_BLOCK.replace(/\s+/g, ' ');

    assert.doesNotMatch(block, /use `any` when either start is fine/);
    assert.match(block, /verify_starts: red/, 'the block must state the red rule');
    assert.match(
      block,
      /names a test the task creates/i,
      'the red rule must name a test the task creates',
    );
    assert.match(block, /new test file may share/i, 'the block must allow a shared verify');
    assert.match(
      block,
      /`any` is only for a task that can honestly start either way/,
      'the block must limit any to honest either-way starts',
    );
  });

  it('PLANNER.md and templates/PLANNER.md carry the same planner guidance', async () => {
    for (const relative of ['PLANNER.md', 'templates/PLANNER.md']) {
      const text = (await readFile(relative)).replace(/\s+/g, ' ');
      assert.match(text, /verify_starts: red/, `${relative} must state the red rule`);
      assert.match(text, /new test file may share/i, `${relative} must allow a shared verify`);
      assert.match(
        text,
        /`any` is only for a task that can honestly start either way/,
        `${relative} must limit any to honest either-way starts`,
      );
    }
  });

  it('automatic retry bullet names verify_path_missing', async () => {
    const readme = await readReadme();
    const retry = section(readme, '**Automatic retry.**', '**Stuck tasks.**');

    assert.ok(
      retry.includes('verify_path_missing'),
      'the automatic retry bullet must name verify_path_missing',
    );
  });

  it('dead reasons list verify_path_missing and explain it', async () => {
    const readme = await readReadme();
    const dead = section(readme, 'Dead reasons:', '## Harnesses');

    assert.ok(
      dead.includes('verify_path_missing'),
      'the dead reasons must name verify_path_missing',
    );
    assert.match(
      dead,
      /did not exist after the agent exited/i,
      'the dead reasons must say the named path was missing after the agent exited',
    );
  });

  it('approval digest bullet adds verify_starts_conflict and stops saying five', async () => {
    const readme = await readReadme();
    const digest = section(readme, '**Approval digest.**', '**Verification gate.**');

    assert.ok(
      digest.includes('verify_starts_conflict'),
      'the approval digest bullet must name verify_starts_conflict',
    );
    assert.doesNotMatch(digest, /\bfive\b/i, 'the approval digest bullet must stop saying five');
    assert.match(
      digest,
      /declares `?green`? or `?any`?/i,
      'the flag must say in plain words when it fires',
    );
  });

  it('pre-spawn bullet records missing named paths without counting a red mismatch', async () => {
    const readme = await readReadme();
    const preSpawn = section(readme, '**Pre-spawn verify check.**', '**Automatic retry.**');

    assert.match(
      preSpawn,
      /missingPaths|missing named path/i,
      'the pre-spawn bullet must say missing named paths are recorded',
    );
    assert.match(
      preSpawn,
      /do(?:es)? not count as a mismatch/i,
      'the pre-spawn bullet must say a missing named path does not count as a mismatch',
    );
    assert.match(preSpawn, /`red` task/i, 'the exception must apply to a red task');
  });
});
