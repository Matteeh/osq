import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { lintChangeFolder } from '../src/core/spec/linter.js';
import { installFakeValidator } from './helpers.js';

const CHANGE_ID = '001-duplicate-scenario';

const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

const TASK = `---
title: Valid task
verify: node verify.cjs
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] passes
`;

/** A proposal that relates to a delta and declares no capability reads. */
function proposal(): string {
  return `---
title: Repeated scenario names
depends_on: []
verify: node verify.cjs
features:
  reads: []
---
## Goal

Refuse a delta that gives a capability a second scenario with the same name.

## Contract

| A | B |
|---|---|
| 1 | 2 |

## Non-goals

None.

## Surface

None.

## Delta

Delta specs live beside the proposal.
`;
}

/** One requirement block whose scenarios each render a WHEN/THEN pair. */
function requirement(name: string, scenarios: readonly string[]): string {
  const rendered = scenarios
    .map(
      (scenario) => `#### Scenario: ${scenario}
- **WHEN** invoked
- **THEN** works`,
    )
    .join('\n\n');
  return `### Requirement: ${name}

The system SHALL behave declaratively.

${rendered}`;
}

/** A living capability spec holding the given requirements. */
function livingSpec(capability: string, requirements: readonly string[]): string {
  return `# ${capability} Specification

## Purpose

A purpose long enough to satisfy the merged spec check for this test.

## Requirements

${requirements.join('\n\n')}
`;
}

/** A delta spec rendered from its operation sections. */
function deltaSpec(capability: string, body: string): string {
  return `# Spec Delta: ${capability}

## Purpose

Why this capability exists, with enough words to matter.

${body}
`;
}

/** Write a living capability spec. */
async function writeLiving(
  root: string,
  capability: string,
  requirements: readonly string[],
): Promise<void> {
  const dir = path.join(root, 'openspec', 'specs', capability);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'spec.md'), livingSpec(capability, requirements), 'utf8');
}

/** Write a capability delta. */
async function writeDelta(changeFolder: string, capability: string, body: string): Promise<void> {
  const dir = path.join(changeFolder, 'specs', capability);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'spec.md'), deltaSpec(capability, body), 'utf8');
}

/** The repeated scenario name message for a capability and two requirements. */
function repeatedMessage(capability: string, name: string, first: string, second: string): string {
  return `${capability}: scenario "${name}" appears in both "${first}" and "${second}"; give each scenario of a capability its own name`;
}

describe('duplicate scenario linting', () => {
  let tmpDir: string;
  let changeFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-duplicate-scenario-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
    changeFolder = path.join(tmpDir, 'openspec', 'changes', CHANGE_ID);
    await fs.mkdir(path.join(changeFolder, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(changeFolder, 'proposal.md'), proposal(), 'utf8');
    await fs.writeFile(path.join(changeFolder, 'tasks', '1.md'), TASK, 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('Delta adds a taken scenario name', async () => {
    await writeLiving(tmpDir, 'web', [requirement('Approve review view', ['Phone width'])]);
    await writeDelta(
      changeFolder,
      'web',
      `## ADDED Requirements

${requirement('Change page', ['Phone width'])}`,
    );

    const result = await lintChangeFolder(tmpDir, changeFolder, DEFAULT_CONFIG);
    const expected = repeatedMessage('web', 'Phone width', 'Approve review view', 'Change page');

    assert.equal(result.valid, false, result.errors.join('\n'));
    assert.ok(result.errors.includes(expected), result.errors.join('\n'));
  });

  it('Two added requirements share a scenario name', async () => {
    await writeDelta(
      changeFolder,
      'notes',
      `## ADDED Requirements

${requirement('Save note', ['Saves'])}

${requirement('Edit note', ['Saves'])}`,
    );

    const result = await lintChangeFolder(tmpDir, changeFolder, DEFAULT_CONFIG);
    const expected = repeatedMessage('notes', 'Saves', 'Save note', 'Edit note');

    assert.equal(result.valid, false, result.errors.join('\n'));
    assert.ok(result.errors.includes(expected), result.errors.join('\n'));
  });

  it('Approval refuses a repeated scenario name', async () => {
    await writeLiving(tmpDir, 'web', [requirement('Approve review view', ['Phone width'])]);
    await writeDelta(
      changeFolder,
      'web',
      `## ADDED Requirements

${requirement('Change page', ['Phone width'])}`,
    );

    const expected = repeatedMessage('web', 'Phone width', 'Approve review view', 'Change page');

    await assert.rejects(
      () => approveSpec(tmpDir, '001', DEFAULT_CONFIG),
      (error: unknown) => error instanceof Error && error.message.includes(expected),
    );

    const approvedPath = path.join(changeFolder, '.run', 'approved');
    const approvedExists = await fs
      .stat(approvedPath)
      .then(() => true)
      .catch(() => false);
    assert.equal(approvedExists, false);
  });

  it('Name the living spec already repeats', async () => {
    await writeLiving(tmpDir, 'web', [
      requirement('Approve review view', ['Phone width']),
      requirement('Land view', ['Phone width']),
    ]);
    await writeDelta(
      changeFolder,
      'web',
      `## ADDED Requirements

${requirement('Change page', ['Phone width'])}`,
    );

    const result = await lintChangeFolder(tmpDir, changeFolder, DEFAULT_CONFIG);

    assert.equal(
      result.errors.some((error) => error.includes('appears in both')),
      false,
      result.errors.join('\n'),
    );
  });

  it('Modified requirement keeps its scenario names', async () => {
    await writeLiving(tmpDir, 'web', [requirement('Approve review view', ['Phone width'])]);
    await writeDelta(
      changeFolder,
      'web',
      `## MODIFIED Requirements

### Requirement: Approve review view

The system SHALL behave declaratively.

#### Scenario: Phone width
- **WHEN** invoked
- **THEN** works differently now`,
    );

    const result = await lintChangeFolder(tmpDir, changeFolder, DEFAULT_CONFIG);

    assert.equal(
      result.errors.some((error) => error.includes('appears in both')),
      false,
      result.errors.join('\n'),
    );
  });
});
