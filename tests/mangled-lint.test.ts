import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { OPENSPEC_EXPECTED_VERSION, lintChangeFolder } from '../src/core/linter.js';

const CHANGE_ID = '001-mangled';

/**
 * Install a fake project-local OpenSpec binary pinned to the expected version,
 * so artifact linting reaches the mangled-file checks instead of failing closed
 * on a missing validator.
 */
async function installFakeOpenSpec(projectRoot: string): Promise<void> {
  const binDir = path.join(projectRoot, 'node_modules', '.bin');
  await fs.mkdir(binDir, { recursive: true });

  const script = `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ valid: true, issues: [] }));
process.exit(0);
`;
  await fs.writeFile(path.join(binDir, 'openspec'), script, { mode: 0o755 });

  const manifestDir = path.join(projectRoot, 'node_modules', '@fission-ai', 'openspec');
  await fs.mkdir(manifestDir, { recursive: true });
  await fs.writeFile(
    path.join(manifestDir, 'package.json'),
    JSON.stringify({ name: '@fission-ai/openspec', version: OPENSPEC_EXPECTED_VERSION }),
    'utf8',
  );
}

const VALID_PROPOSAL = `---
title: Mangled Test Change
depends_on: []
verify: node -e "process.exit(0)"
features:
  reads: []
---
## Goal

Goal.

## Contract

| A | B |
|---|---|
| 1 | 2 |

## Non-goals

None.

## Delta

None.
`;

const VALID_TASK = `---
title: Valid task
verify: node -e "process.exit(0)"
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] passes
`;

describe('mangled change folder linting', () => {
  let tmpDir: string;
  let changeFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-mangled-'));
    await scaffoldProject(tmpDir);
    changeFolder = path.join(tmpDir, 'openspec', 'changes', CHANGE_ID);
    await fs.mkdir(path.join(changeFolder, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(changeFolder, 'proposal.md'), VALID_PROPOSAL, 'utf8');
    await fs.writeFile(path.join(changeFolder, 'tasks', '1.md'), VALID_TASK, 'utf8');
    await installFakeOpenSpec(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('accepts clean files containing newlines and tabs', async () => {
    const withTab = VALID_PROPOSAL.replace('Goal.', 'Goal.\n\n\tIndented detail.');
    await fs.writeFile(path.join(changeFolder, 'proposal.md'), withTab, 'utf8');

    const result = await lintChangeFolder(tmpDir, changeFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(result.errors.length, 0);
  });

  it('rejects a nested file containing a bell character', async () => {
    const nestedDir = path.join(changeFolder, 'notes');
    await fs.mkdir(nestedDir, { recursive: true });
    await fs.writeFile(path.join(nestedDir, 'nested.md'), 'hello\x07world\n', 'utf8');

    const result = await lintChangeFolder(tmpDir, changeFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.includes('notes/nested.md') && e.includes('0x07')),
      result.errors.join('\n'),
    );
  });

  it('rejects a backspace character in a task file', async () => {
    const taskPath = path.join(changeFolder, 'tasks', '1.md');
    await fs.writeFile(taskPath, `${VALID_TASK}\x08`, 'utf8');

    const result = await lintChangeFolder(tmpDir, changeFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.includes('control character') && e.includes('0x08')),
      result.errors.join('\n'),
    );
  });

  it('rejects a carriage return in a task file', async () => {
    const taskPath = path.join(changeFolder, 'tasks', '1.md');
    await fs.writeFile(taskPath, VALID_TASK.replace('\n', '\r'), 'utf8');

    const result = await lintChangeFolder(tmpDir, changeFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.includes('control character') && e.includes('0x0D')),
      result.errors.join('\n'),
    );
  });

  it('rejects a DEL control character in a change file', async () => {
    await fs.writeFile(path.join(changeFolder, 'proposal.md'), `${VALID_PROPOSAL}\x7F`, 'utf8');

    const result = await lintChangeFolder(tmpDir, changeFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.includes('control character') && e.includes('0x7F')),
      result.errors.join('\n'),
    );
  });

  it('ignores prohibited control characters under .run/', async () => {
    const runDir = path.join(changeFolder, '.run');
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'scratch.md'), 'ignore\x07me\n', 'utf8');

    const result = await lintChangeFolder(tmpDir, changeFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true, result.errors.join('\n'));
  });

  it('rejects fused acceptance lines in a task file', async () => {
    const taskPath = path.join(changeFolder, 'tasks', '1.md');
    const fused = VALID_TASK.replace('- [ ] passes', '- [ ] item one - [ ] item two');
    await fs.writeFile(taskPath, fused, 'utf8');

    const result = await lintChangeFolder(tmpDir, changeFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.includes('fused acceptance lines') && e.includes('line')),
      result.errors.join('\n'),
    );
  });

  it('allows a single acceptance item per line', async () => {
    const taskPath = path.join(changeFolder, 'tasks', '1.md');
    await fs.writeFile(
      taskPath,
      VALID_TASK.replace('- [ ] passes', '- [ ] first\n- [ ] second'),
      'utf8',
    );

    const result = await lintChangeFolder(tmpDir, changeFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true, result.errors.join('\n'));
  });

  it('approveSpec refuses to seal a change folder with a control character', async () => {
    await fs.writeFile(
      path.join(changeFolder, 'proposal.md'),
      VALID_PROPOSAL.replace('Goal.', 'Goal\x07.'),
      'utf8',
    );

    await assert.rejects(
      () => approveSpec(tmpDir, '001', DEFAULT_CONFIG),
      (error: unknown) => error instanceof Error && error.message.includes('control character'),
    );

    const approved = await fs
      .stat(path.join(changeFolder, '.run', 'approved'))
      .then(() => true)
      .catch(() => false);
    assert.equal(approved, false);
  });
});
