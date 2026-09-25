import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  clearScenarioLookupCache,
  effectiveScenarios,
  lookupScenario,
  scenarioSpecReadCount,
} from '../src/core/trace/scenario-lookup.js';

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

const MODIFIED_PERCENTAGE = `# Spec Delta: pricing

## MODIFIED Requirements

### Requirement: Percentage codes
The engine SHALL take a percentage code off the tiered subtotal.

#### Scenario: ${PERCENTAGE_NAME}
- **WHEN** a quote for 200 units uses the code SAVE10
- **THEN** the subtotal is 1800.00
- **AND** the discount is 180.00
- **AND** the total is 1600.00
`;

const REMOVED_PERCENTAGE = `# Spec Delta: pricing

## REMOVED Requirements

### Requirement: Percentage codes
`;

describe('scenario lookup', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-scenario-lookup-'));
    clearScenarioLookupCache();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    clearScenarioLookupCache();
  });

  async function writeLiving(capability: string, content: string): Promise<void> {
    const file = path.join(root, 'openspec', 'specs', capability, 'spec.md');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, 'utf8');
  }

  async function writeDelta(change: string, capability: string, content: string): Promise<string> {
    const folder = path.join(root, 'openspec', 'changes', change);
    const file = path.join(folder, 'specs', capability, 'spec.md');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, 'utf8');
    return folder;
  }

  it('returns the delta outcomes for a scenario only the change adds', async () => {
    await writeLiving('pricing', LIVING_SPEC);
    const change = await writeDelta('001-bulk', 'pricing', ADD_BULK);

    const outcomes = lookupScenario('pricing', 'Bulk tier', root, { OSQ_CHANGE: change });

    assert.deepEqual(outcomes, [{ text: 'the unit price is 8.00' }]);
  });

  it('uses the delta outcomes for a modified scenario', async () => {
    await writeLiving('pricing', LIVING_SPEC);
    const change = await writeDelta('002-lower', 'pricing', MODIFIED_PERCENTAGE);

    const outcomes = lookupScenario('pricing', PERCENTAGE_NAME, root, { OSQ_CHANGE: change });

    assert.deepEqual(outcomes, [
      { text: 'the subtotal is 1800.00' },
      { text: 'the discount is 180.00' },
      { text: 'the total is 1600.00' },
    ]);
  });

  it('fails for a scenario the change removes', async () => {
    await writeLiving('pricing', LIVING_SPEC);
    const change = await writeDelta('003-remove', 'pricing', REMOVED_PERCENTAGE);

    assert.throws(
      () => lookupScenario('pricing', PERCENTAGE_NAME, root, { OSQ_CHANGE: change }),
      (error: unknown) =>
        error instanceof Error &&
        error.message === `The pricing spec has no scenario "${PERCENTAGE_NAME}"`,
    );
  });

  it('fails when two places define the scenario differently', async () => {
    await writeLiving('pricing', LIVING_SPEC);
    await writeDelta('002-lower', 'pricing', MODIFIED_PERCENTAGE);

    const expected = `The pricing scenario "${PERCENTAGE_NAME}" differs between openspec/specs/pricing/spec.md and openspec/changes/002-lower/specs/pricing/spec.md; set OSQ_CHANGE to the change folder the test should prove`;

    assert.throws(
      () => lookupScenario('pricing', PERCENTAGE_NAME, root, {}),
      (error: unknown) => error instanceof Error && error.message === expected,
    );
  });

  it('returns an active change delta when no OSQ_CHANGE is set', async () => {
    await writeLiving('pricing', LIVING_SPEC);
    await writeDelta('001-bulk', 'pricing', ADD_BULK);

    const outcomes = lookupScenario('pricing', 'Bulk tier', root, {});

    assert.deepEqual(outcomes, [{ text: 'the unit price is 8.00' }]);
  });

  it('returns every scenario of the effective spec for lint', async () => {
    await writeLiving('pricing', LIVING_SPEC);
    const change = await writeDelta('001-bulk', 'pricing', ADD_BULK);

    const scenarios = effectiveScenarios(path.join(root, 'openspec'), change, 'pricing');

    assert.deepEqual(
      scenarios.map((scenario) => scenario.name),
      [PERCENTAGE_NAME, 'Bulk tier'],
    );
    assert.deepEqual(scenarios[1].outcomes, [{ text: 'the unit price is 8.00' }]);
  });

  it('fails for a delta the merge refuses', async () => {
    await writeLiving('pricing', LIVING_SPEC);
    const change = await writeDelta(
      '004-drop',
      'pricing',
      `# Spec Delta: pricing

## MODIFIED Requirements

### Requirement: Percentage codes
The engine SHALL take a percentage code off the tiered subtotal.

#### Scenario: A different scenario
- **WHEN** whatever
- **THEN** whatever
`,
    );

    assert.throws(
      () => lookupScenario('pricing', PERCENTAGE_NAME, root, { OSQ_CHANGE: change }),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes('MODIFIED failed') &&
        error.message.includes(PERCENTAGE_NAME),
    );
  });

  it('fails when the living spec has two scenarios with one name', async () => {
    await writeLiving(
      'pricing',
      `# pricing Specification

## Purpose
Duplicate scenario names.

## Requirements
### Requirement: First
The engine SHALL do the first thing.

#### Scenario: Shared name
- **WHEN** the first path runs
- **THEN** the first outcome

### Requirement: Second
The engine SHALL do the second thing.

#### Scenario: Shared name
- **WHEN** the second path runs
- **THEN** the second outcome
`,
    );

    assert.throws(
      () => lookupScenario('pricing', 'Shared name', root, {}),
      (error: unknown) =>
        error instanceof Error &&
        error.message === 'The pricing spec has two scenarios named "Shared name"',
    );
  });

  it('fails when only the change delta introduces a duplicate name', async () => {
    await writeLiving(
      'pricing',
      `# pricing Specification

## Purpose
One scenario before the change.

## Requirements
### Requirement: Percentage codes
The engine SHALL take a percentage code off the subtotal.

#### Scenario: Shared name
- **WHEN** the living path runs
- **THEN** the living outcome
`,
    );
    const change = await writeDelta(
      '005-dup',
      'pricing',
      `# Spec Delta: pricing

## ADDED Requirements

### Requirement: Bulk pricing
The engine SHALL price bulk orders.

#### Scenario: Shared name
- **WHEN** the bulk path runs
- **THEN** the bulk outcome
`,
    );

    assert.throws(
      () => lookupScenario('pricing', 'Shared name', root, { OSQ_CHANGE: change }),
      (error: unknown) =>
        error instanceof Error &&
        error.message === 'The pricing spec has two scenarios named "Shared name"',
    );
  });

  it('fails for a capability that has no spec', async () => {
    await writeLiving('pricing', LIVING_SPEC);

    assert.throws(
      () => lookupScenario('missing', 'Anything', root, {}),
      (error: unknown) =>
        error instanceof Error && error.message === 'The missing spec has no scenario "Anything"',
    );
  });

  it('finds the spec from a working directory nested below the project root', async () => {
    await writeLiving('pricing', LIVING_SPEC);
    const nested = path.join(root, 'src', 'deep', 'inside');
    await fs.mkdir(nested, { recursive: true });

    const outcomes = lookupScenario('pricing', PERCENTAGE_NAME, nested, {});

    assert.deepEqual(outcomes, [
      { text: 'the subtotal is 1800.00' },
      { text: 'the discount is 180.00' },
      { text: 'the total is 1620.00' },
    ]);
  });

  it('reads the spec file once for two lookups', async () => {
    await writeLiving('pricing', LIVING_SPEC);
    const nested = path.join(root, 'src');
    await fs.mkdir(nested, { recursive: true });

    clearScenarioLookupCache();
    const first = lookupScenario('pricing', PERCENTAGE_NAME, nested, {});
    const second = lookupScenario('pricing', PERCENTAGE_NAME, nested, {});

    assert.deepEqual(first, second);
    assert.equal(scenarioSpecReadCount(), 1);
  });
});
