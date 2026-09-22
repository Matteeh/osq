import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { deriveSpecState, readChangeFolder } from '../src/core/status/state.js';

const TASK = `---
title: Task One
verify: node -e "process.exit(0)"
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] does the thing
`;

async function writeTask(folderPath: string, taskNumber: string): Promise<void> {
  const tasksDir = path.join(folderPath, 'tasks');
  await fs.mkdir(tasksDir, { recursive: true });
  await fs.writeFile(path.join(tasksDir, `${taskNumber}.md`), TASK, 'utf8');
}

describe('rejected dependency resolution', () => {
  let tmpDir: string;
  let dependent: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-state-rejected-'));
    await scaffoldProject(tmpDir);

    dependent = path.join(tmpDir, 'openspec', 'changes', '050-dependent');
    await writeTask(dependent, '1');
    await fs.mkdir(path.join(dependent, '.run'), { recursive: true });
    await fs.writeFile(
      path.join(dependent, 'proposal.md'),
      '---\ntitle: Dependent\nverify: node -e "process.exit(0)"\ndepends_on: [049]\n---\n## Goal\nx\n',
      'utf8',
    );
    // Approval keeps the dependent change out of the unapproved short-circuit.
    await fs.writeFile(path.join(dependent, '.run', 'approved'), 'sha256:abc\n', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('treats a rejected dependency as unmet even when the rejected folder is all-done', async () => {
    const rejected = path.join(tmpDir, 'openspec', 'changes', 'rejected', '049-rejected');
    await writeTask(rejected, '1');
    await fs.mkdir(path.join(rejected, '.run', 'done'), { recursive: true });
    await fs.writeFile(path.join(rejected, '.run', 'done', '1'), '', 'utf8');
    await fs.writeFile(path.join(rejected, '.run', 'approved'), 'sha256:abc\n', 'utf8');
    await fs.writeFile(
      path.join(rejected, 'proposal.md'),
      '---\ntitle: Rejected\nverify: node -e "process.exit(0)"\n---\n## Goal\nx\n',
      'utf8',
    );

    const snapshot = await readChangeFolder(tmpDir, dependent);
    assert.ok(
      snapshot.unmetDependencies.has('049'),
      `expected 049 to be unmet, got ${[...snapshot.unmetDependencies].join(', ')}`,
    );

    const state = await deriveSpecState(tmpDir, dependent);
    assert.equal(state.status, 'blocked');
  });

  it('lets an archived dependency satisfy resolution', async () => {
    const archived = path.join(tmpDir, 'openspec', 'changes', 'archive', '049-archived');
    await writeTask(archived, '1');
    await fs.mkdir(path.join(archived, '.run', 'done'), { recursive: true });
    await fs.writeFile(path.join(archived, '.run', 'done', '1'), '', 'utf8');

    const snapshot = await readChangeFolder(tmpDir, dependent);
    assert.equal(snapshot.unmetDependencies.size, 0);
  });
});
