import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { lintChangeFolder } from '../src/core/spec/linter.js';
import { parseFrontmatter } from '../src/core/spec/parser.js';
import { installFakeValidator } from './helpers.js';

const CHANGE_ID = '001-yaml';

const PROPOSAL = `---
title: Frontmatter probe
depends_on: []
verify: pnpm verify
features:
  reads: []
---
## Goal

Probe frontmatter errors.

## Non-goals

None.

## Surface

None

## Contract

### Requirement: Probe behavior

The system SHALL probe deterministically.

#### Scenario: Probe works
- **WHEN** invoked
- **THEN** it works

## Delta

Delta specs declare behavior.
`;

const TASK = `---
title: When the probe runs, it passes
verify: node --test tests/a.test.ts
scope:
entry: []
skills: []
---
## Acceptance
- [ ] passes
`;

async function writeChangeFolder(root: string): Promise<string> {
  const folder = path.join(root, 'openspec', 'changes', CHANGE_ID);
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folder, 'proposal.md'), PROPOSAL, 'utf8');
  await fs.writeFile(path.join(folder, 'tasks', '1.md'), TASK, 'utf8');
  return folder;
}

/** Replace the one frontmatter line a test breaks, leaving every other line alone. */
async function replaceLine(target: string, pattern: RegExp, replacement: string): Promise<void> {
  const content = await fs.readFile(target, 'utf8');
  const updated = content.replace(pattern, replacement);
  assert.notEqual(updated, content, `pattern ${pattern} matched nothing in ${target}`);
  await fs.writeFile(target, updated, 'utf8');
}

describe('Frontmatter YAML errors', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-yaml-lint-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { verify: 'node verify.cjs' } }),
      'utf8',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('Other readers of frontmatter that does not parse', () => {
    const content = PROPOSAL.replace('title: Frontmatter probe', 'title: Lint: broken');

    const parsed = parseFrontmatter(content);

    assert.deepEqual(parsed.data, {});
    assert.equal(parsed.body, content);
  });
});

describe('Change document frontmatter YAML error', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-yaml-lint-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { verify: 'node verify.cjs' } }),
      'utf8',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('Proposal frontmatter that does not parse', async () => {
    const folder = await writeChangeFolder(tmpDir);
    const clean = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);
    assert.equal(clean.valid, true, clean.errors.join('\n'));

    await replaceLine(path.join(folder, 'proposal.md'), /^title:.*$/m, 'title: Lint: broken');

    const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.deepEqual(result.errors, [
      'proposal.md frontmatter is not valid YAML at line 2: Nested mappings are not allowed in compact mappings',
    ]);
    assert.ok(
      !result.errors.some((message) => message.includes('must declare a verify command')),
      result.errors.join('\n'),
    );
  });
});

describe('Task frontmatter YAML error', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-yaml-lint-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { verify: 'node verify.cjs' } }),
      'utf8',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('Task frontmatter that does not parse', async () => {
    const folder = await writeChangeFolder(tmpDir);
    const clean = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);
    assert.equal(clean.valid, true, clean.errors.join('\n'));

    await replaceLine(path.join(folder, 'tasks', '1.md'), /^title:.*$/m, 'title: When a: b, c');

    const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);
    const taskRepoPath = path.join('openspec', 'changes', CHANGE_ID, 'tasks', '1.md');

    assert.equal(result.valid, false);
    assert.deepEqual(result.errors, [
      'Task in 1.md frontmatter is not valid YAML at line 2: Nested mappings are not allowed in compact mappings',
    ]);
    assert.equal(result.findings.filter((finding) => finding.file === taskRepoPath).length, 1);
  });
});
