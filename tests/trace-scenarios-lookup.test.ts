import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scenario } from '@matteeh/osq/testing';
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

const REMOVED_PERCENTAGE = `# Spec Delta: pricing

## REMOVED Requirements

### Requirement: Percentage codes
`;

const DIFFERS = `The pricing scenario "${PERCENTAGE_NAME}" differs between openspec/specs/pricing/spec.md and openspec/changes/001-a/specs/pricing/spec.md; set OSQ_CHANGE to the change folder the test should prove`;

/** A synchronous wrapper that returns the lookup's failure message. */
function lookupFailure(
  capability: string,
  name: string,
  cwd: string,
  env: Record<string, string | undefined>,
): string {
  try {
    lookupScenario(capability, name, cwd, env);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function makeRoot(fill: (root: string) => Promise<void>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-scenarios-lookup-'));
  clearScenarioLookupCache();
  await fill(root);
  return root;
}

async function dropRoot(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true });
  clearScenarioLookupCache();
}

async function writeLiving(root: string, content: string): Promise<void> {
  const file = path.join(root, 'openspec', 'specs', 'pricing', 'spec.md');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, 'utf8');
}

async function writeDelta(root: string, change: string, content: string): Promise<string> {
  const folder = path.join(root, 'openspec', 'changes', change);
  const file = path.join(folder, 'specs', 'pricing', 'spec.md');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, 'utf8');
  return folder;
}

/** Write a linked-worktree `.git` file and the `HEAD` its gitdir names. */
async function writeGitFile(root: string, branch: string): Promise<void> {
  const gitDir = path.join(root, 'linked-git');
  await fs.mkdir(gitDir, { recursive: true });
  await fs.writeFile(path.join(gitDir, 'HEAD'), `ref: refs/heads/${branch}\n`, 'utf8');
  await fs.writeFile(path.join(root, '.git'), 'gitdir: linked-git\n', 'utf8');
}

const PERCENTAGE_OUTCOMES = [
  { text: 'the subtotal is 1800.00' },
  { text: 'the discount is 180.00' },
];

scenario(
  'traceability',
  'Scenario only in the change',
  { covers: lookupScenario },
  async ({ run, then }) => {
    const root = await makeRoot(async (r) => {
      await writeLiving(r, LIVING_SPEC);
      await writeDelta(r, '001-bulk', ADD_BULK);
    });
    try {
      const change = path.join(root, 'openspec', 'changes', '001-bulk');
      const outcomes = run('pricing', 'Bulk tier', root, { OSQ_CHANGE: change });
      await then('the lookup returns the delta\'s outcomes for "Bulk tier"', () => {
        assert.deepEqual(outcomes, [{ text: 'the unit price is 8.00' }]);
      });
    } finally {
      await dropRoot(root);
    }
  },
);

scenario(
  'traceability',
  'Modified scenario uses the delta',
  { covers: lookupScenario },
  async ({ run, then }) => {
    const root = await makeRoot(async (r) => {
      await writeLiving(r, LIVING_SPEC);
      await writeDelta(r, '002-lower', modifiedSpec('1600.00'));
    });
    try {
      const change = path.join(root, 'openspec', 'changes', '002-lower');
      const outcomes = run('pricing', PERCENTAGE_NAME, root, { OSQ_CHANGE: change });
      await then('the lookup returns "the total is 1600.00"', () => {
        assert.deepEqual(outcomes, [...PERCENTAGE_OUTCOMES, { text: 'the total is 1600.00' }]);
      });
    } finally {
      await dropRoot(root);
    }
  },
);

scenario('traceability', 'Removed scenario', { covers: lookupFailure }, async ({ run, then }) => {
  const root = await makeRoot(async (r) => {
    await writeLiving(r, LIVING_SPEC);
    await writeDelta(r, '003-remove', REMOVED_PERCENTAGE);
  });
  try {
    const change = path.join(root, 'openspec', 'changes', '003-remove');
    const message = run('pricing', PERCENTAGE_NAME, root, { OSQ_CHANGE: change });
    await then('the lookup fails with `The pricing spec has no scenario "<name>"`', () => {
      assert.equal(message, `The pricing spec has no scenario "${PERCENTAGE_NAME}"`);
    });
  } finally {
    await dropRoot(root);
  }
});

scenario('traceability', 'Places disagree', { covers: lookupFailure }, async ({ run, then }) => {
  const root = await makeRoot(async (r) => {
    await writeLiving(r, LIVING_SPEC);
    await writeDelta(r, '001-a', modifiedSpec('1600.00'));
  });
  try {
    const message = run('pricing', PERCENTAGE_NAME, root, {});
    await then(
      "the lookup fails naming the living spec path, the change's delta path, and `OSQ_CHANGE`",
      () => {
        assert.equal(message, DIFFERS);
      },
    );
  } finally {
    await dropRoot(root);
  }
});

scenario(
  'traceability',
  'Active change adds a scenario',
  { covers: lookupScenario },
  async ({ run, then }) => {
    const root = await makeRoot(async (r) => {
      await writeLiving(r, LIVING_SPEC);
      await writeDelta(r, '001-bulk', ADD_BULK);
    });
    try {
      const outcomes = run('pricing', 'Bulk tier', root, {});
      await then("the lookup returns that delta's outcomes", () => {
        assert.deepEqual(outcomes, [{ text: 'the unit price is 8.00' }]);
      });
    } finally {
      await dropRoot(root);
    }
  },
);

scenario(
  'traceability',
  'Change from the worktree branch',
  { covers: lookupScenario },
  async ({ run, then }) => {
    const root = await makeRoot(async (r) => {
      await writeLiving(r, LIVING_SPEC);
      await writeDelta(r, '001-a', modifiedSpec('1600.00'));
      await writeDelta(r, '002-b', modifiedSpec('1500.00'));
      await writeGitFile(r, 'osq/002-b');
    });
    try {
      const outcomes = run('pricing', PERCENTAGE_NAME, root, {});
      await then("the lookup returns `002-b`'s outcomes without failing", () => {
        assert.deepEqual(outcomes, [...PERCENTAGE_OUTCOMES, { text: 'the total is 1500.00' }]);
      });
    } finally {
      await dropRoot(root);
    }
  },
);

scenario(
  'traceability',
  'Worktree change already archived',
  { covers: lookupScenario },
  async ({ run, then }) => {
    const root = await makeRoot(async (r) => {
      await writeLiving(r, LIVING_SPEC);
      await writeDelta(r, '001-a', ADD_BULK);
      await writeGitFile(r, 'osq/002-b');
    });
    try {
      const outcomes = run('pricing', 'Bulk tier', root, {});
      await then(
        "the lookup reads the living spec and every active change's delta, as without a worktree",
        () => {
          assert.deepEqual(outcomes, [{ text: 'the unit price is 8.00' }]);
        },
      );
    } finally {
      await dropRoot(root);
    }
  },
);

scenario(
  'traceability',
  'Checkout or other branch',
  { covers: lookupScenario },
  async ({ run, then }) => {
    const root = await makeRoot(async (r) => {
      await writeLiving(r, LIVING_SPEC);
      await writeDelta(r, '001-a', ADD_BULK);
      await fs.mkdir(path.join(r, '.git'), { recursive: true });
    });
    try {
      const outcomes = run('pricing', 'Bulk tier', root, {});
      await then('the lookup resolves as without a worktree', () => {
        assert.deepEqual(outcomes, [{ text: 'the unit price is 8.00' }]);
      });
    } finally {
      await dropRoot(root);
    }
  },
);

scenario('traceability', 'Branch read once', { covers: lookupScenario }, async ({ run, then }) => {
  const root = await makeRoot(async (r) => {
    await writeLiving(r, LIVING_SPEC);
    await writeDelta(r, '001-a', modifiedSpec('1600.00'));
    await writeDelta(r, '002-b', modifiedSpec('1500.00'));
    await writeDelta(r, '003-c', modifiedSpec('1400.00'));
    await writeGitFile(r, 'osq/002-b');
  });
  try {
    const first = run('pricing', PERCENTAGE_NAME, root, {});
    await fs.writeFile(
      path.join(root, 'linked-git', 'HEAD'),
      'ref: refs/heads/osq/003-c\n',
      'utf8',
    );
    const second = run('pricing', PERCENTAGE_NAME, root, {});
    await then('both lookups use the change the first read named', () => {
      assert.deepEqual(second, first);
      assert.deepEqual(second, [...PERCENTAGE_OUTCOMES, { text: 'the total is 1500.00' }]);
    });
  } finally {
    await dropRoot(root);
  }
});
