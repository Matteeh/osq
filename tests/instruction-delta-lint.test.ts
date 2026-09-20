import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { lintChangeFolder } from '../src/core/linter.js';
import { installFakeValidator } from './helpers.js';

const CHANGE_ID = '001-instruction-delta';

const PROPOSAL = `---
title: Instruction Delta
depends_on: []
verify: node -e "process.exit(0)"
features:
  reads: []
---
## Goal

Reject instruction-shaped delta requirements.

## Contract

| A | B |
|---|---|
| 1 | 2 |

## Non-goals

None.

## Delta

Delta specs live beside the proposal.
`;

const TASK = `---
title: Valid task
verify: node -e "process.exit(0)"
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] passes
`;

/** Writes a capability delta with one requirement under the requested operation. */
async function writeDelta(
  changeFolder: string,
  capability: string,
  requirementName: string,
  operation = 'ADDED',
): Promise<void> {
  const dir = path.join(changeFolder, 'specs', capability);
  await fs.mkdir(dir, { recursive: true });
  const content = `# Spec Delta: ${capability}

## Purpose

Why this capability exists.

## ${operation} Requirements

### Requirement: ${requirementName}

The system SHALL behave declaratively.

#### Scenario: Works
- **WHEN** invoked
- **THEN** works
`;
  await fs.writeFile(path.join(dir, 'spec.md'), content, 'utf8');
}

describe('instruction-shaped delta linting', () => {
  let tmpDir: string;
  let changeFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-instruction-delta-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    changeFolder = path.join(tmpDir, 'openspec', 'changes', CHANGE_ID);
    await fs.mkdir(path.join(changeFolder, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(changeFolder, 'proposal.md'), PROPOSAL, 'utf8');
    await fs.writeFile(path.join(changeFolder, 'tasks', '1.md'), TASK, 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('rejects a requirement named with "Update"', async () => {
    await writeDelta(changeFolder, 'sample', 'Update configuration loading');

    const result = await lintChangeFolder(tmpDir, changeFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.includes('instruction-shaped') && e.includes('"update"')),
      result.errors.join('\n'),
    );
  });

  it('rejects a requirement named with "Document"', async () => {
    await writeDelta(changeFolder, 'sample', 'Document release process');

    const result = await lintChangeFolder(tmpDir, changeFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.includes('instruction-shaped') && e.includes('"document"')),
      result.errors.join('\n'),
    );
  });

  it('rejects instruction-shaped names case-insensitively', async () => {
    await writeDelta(changeFolder, 'sample', 'UPDATES the schema');

    const result = await lintChangeFolder(tmpDir, changeFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.includes('instruction-shaped')),
      result.errors.join('\n'),
    );
  });

  it('names the capability and requirement title in the error', async () => {
    await writeDelta(changeFolder, 'sample', 'Update configuration loading');

    const result = await lintChangeFolder(tmpDir, changeFolder, DEFAULT_CONFIG);

    assert.ok(
      result.errors.some(
        (e) =>
          e.startsWith('openspec:') &&
          e.includes('sample') &&
          e.includes('Update configuration loading'),
      ),
      result.errors.join('\n'),
    );
  });

  it('inspects MODIFIED and REMOVED requirement sections', async () => {
    await writeDelta(changeFolder, 'modified-cap', 'Update existing behavior', 'MODIFIED');
    await writeDelta(changeFolder, 'removed-cap', 'Document removed behavior', 'REMOVED');

    const result = await lintChangeFolder(tmpDir, changeFolder, DEFAULT_CONFIG);

    assert.ok(
      result.errors.some((e) => e.includes('modified-cap') && e.includes('"update"')),
      result.errors.join('\n'),
    );
    assert.ok(
      result.errors.some((e) => e.includes('removed-cap') && e.includes('"document"')),
      result.errors.join('\n'),
    );
  });

  it('accepts declarative delta requirements with zero errors', async () => {
    await writeDelta(changeFolder, 'sample', 'Configuration loading');

    const result = await lintChangeFolder(tmpDir, changeFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(result.errors.length, 0);
  });

  it('prevents approval of a change folder with an instruction-shaped delta', async () => {
    await writeDelta(changeFolder, 'sample', 'Update configuration loading');

    await assert.rejects(
      () => approveSpec(tmpDir, '001', DEFAULT_CONFIG),
      (error: unknown) => error instanceof Error && error.message.includes('instruction-shaped'),
    );

    const approvedPath = path.join(changeFolder, '.run', 'approved');
    const approvedExists = await fs
      .stat(approvedPath)
      .then(() => true)
      .catch(() => false);
    assert.equal(approvedExists, false);
  });
});
