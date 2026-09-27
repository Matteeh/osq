import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { clearScenarioLookupCache, lookupScenario } from '../src/core/trace/scenario-lookup.js';

const PERCENTAGE_NAME = 'A percentage code comes off the tiered subtotal';

const LIVING_SPEC = `# pricing Specification

## Purpose
Prices quotes by volume tier and percentage code.

## Requirements
### Requirement: Percentage codes
The engine SHALL take a percentage code off the tiered subtotal.

#### Scenario: ${PERCENTAGE_NAME}
- **WHEN** a quote for 200 units uses the code SAVE10
- **THEN** the subtotal is 1800.00
- **AND** the discount is 180.00
- **AND** the total is 1620.00
`;

const ADD_BULK = `# Spec Delta: pricing

## ADDED Requirements

### Requirement: Bulk pricing
The engine SHALL price bulk orders.

#### Scenario: Bulk tier
- **WHEN** a quote for 500 units
- **THEN** the unit price is 8.00
`;

/** A delta that rewrites the percentage scenario's total to `total`. */
function modifiedSpec(total: string): string {
  return `# Spec Delta: pricing

## MODIFIED Requirements

### Requirement: Percentage codes
The engine SHALL take a percentage code off the tiered subtotal.

#### Scenario: ${PERCENTAGE_NAME}
- **WHEN** a quote for 200 units uses the code SAVE10
- **THEN** the subtotal is 1800.00
- **AND** the discount is 180.00
- **AND** the total is ${total}
`;
}

const DIFFERS = `The pricing scenario "${PERCENTAGE_NAME}" differs between openspec/specs/pricing/spec.md and openspec/changes/001-a/specs/pricing/spec.md; set OSQ_CHANGE to the change folder the test should prove`;

describe('scenario lookup from a worktree branch', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-trace-worktree-'));
    clearScenarioLookupCache();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    clearScenarioLookupCache();
  });

  async function writeLiving(): Promise<void> {
    const file = path.join(root, 'openspec', 'specs', 'pricing', 'spec.md');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, LIVING_SPEC, 'utf8');
  }

  async function writeDelta(change: string, content: string): Promise<void> {
    const file = path.join(root, 'openspec', 'changes', change, 'specs', 'pricing', 'spec.md');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, 'utf8');
  }

  /** Write a linked-worktree `.git` file and the `HEAD` its gitdir names. */
  async function writeGitFile(branch: string): Promise<void> {
    const gitDir = path.join(root, 'linked-git');
    await fs.mkdir(gitDir, { recursive: true });
    await fs.writeFile(path.join(gitDir, 'HEAD'), `ref: refs/heads/${branch}\n`, 'utf8');
    await fs.writeFile(path.join(root, '.git'), 'gitdir: linked-git\n', 'utf8');
  }

  it('returns the worktree branch change outcomes when active changes disagree', async () => {
    await writeLiving();
    await writeDelta('001-a', modifiedSpec('1600.00'));
    await writeDelta('002-b', modifiedSpec('1500.00'));
    await writeGitFile('osq/002-b');

    const outcomes = lookupScenario('pricing', PERCENTAGE_NAME, root, {});

    assert.deepEqual(outcomes, [
      { text: 'the subtotal is 1800.00' },
      { text: 'the discount is 180.00' },
      { text: 'the total is 1500.00' },
    ]);
  });

  it('falls back to every active change when the branch change is archived', async () => {
    await writeLiving();
    await writeDelta('001-a', ADD_BULK);
    await writeGitFile('osq/002-b');

    const outcomes = lookupScenario('pricing', 'Bulk tier', root, {});

    assert.deepEqual(outcomes, [{ text: 'the unit price is 8.00' }]);
  });

  it('resolves as without a worktree when .git is a directory', async () => {
    await writeLiving();
    await writeDelta('001-a', modifiedSpec('1600.00'));
    await writeDelta('002-b', modifiedSpec('1500.00'));
    await fs.mkdir(path.join(root, '.git'), { recursive: true });

    assert.throws(
      () => lookupScenario('pricing', PERCENTAGE_NAME, root, {}),
      (error: unknown) => error instanceof Error && error.message === DIFFERS,
    );
  });

  it('resolves as without a worktree on a branch that is not osq/', async () => {
    await writeLiving();
    await writeDelta('001-a', modifiedSpec('1600.00'));
    await writeDelta('002-b', modifiedSpec('1500.00'));
    await writeGitFile('main');

    assert.throws(
      () => lookupScenario('pricing', PERCENTAGE_NAME, root, {}),
      (error: unknown) => error instanceof Error && error.message === DIFFERS,
    );
  });

  it('reads the branch once for two lookups in the same worktree', async () => {
    await writeLiving();
    await writeDelta('001-a', modifiedSpec('1600.00'));
    await writeDelta('002-b', modifiedSpec('1500.00'));
    await writeDelta('003-c', modifiedSpec('1400.00'));
    await writeGitFile('osq/002-b');

    const first = lookupScenario('pricing', PERCENTAGE_NAME, root, {});
    await fs.writeFile(
      path.join(root, 'linked-git', 'HEAD'),
      'ref: refs/heads/osq/003-c\n',
      'utf8',
    );
    const second = lookupScenario('pricing', PERCENTAGE_NAME, root, {});

    assert.deepEqual(second, first);
    assert.deepEqual(second[2], { text: 'the total is 1500.00' });
  });
});
