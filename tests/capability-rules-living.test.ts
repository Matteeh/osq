import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { buildExecutorPrompt } from '../src/harness/prompt.js';
import {
  type SpawnTaskOptions,
  extractCapabilityRules,
  resolveCapabilityRules,
} from '../src/harness/types.js';

/**
 * The living `Totals` requirement and its delta share a statement; only the
 * scenario name and an HTML comment differ, so the executor prompt must drop
 * the delta rule. `Extras` has no living spec, so all of its rules survive.
 */
const LIVING_TOTALS = `# Totals Specification

## Purpose

Totals capability.

## Requirements

### Requirement: Totals
The capability SHALL total every line.

#### Scenario: totals
- **WHEN** lines are added
- **THEN** the total is the sum
`;

const DELTA_TOTALS = `# Spec Delta: Totals

## MODIFIED Requirements

### Requirement: Totals
<!-- source: src/totals.ts -->
The capability SHALL total every line.

#### Scenario: totals reworded
- **WHEN** lines are added
- **THEN** the total is recomputed

## ADDED Requirements

### Requirement: Refunds
The capability SHALL refund every line.
`;

const DELTA_EXTRAS = `# Spec Delta: Extras

## ADDED Requirements

### Requirement: Extras only
The capability SHALL add extras.
`;

describe('Capability rules drop unchanged living requirements', () => {
  let tmpDir: string;
  let changeFolder: string;
  let livingDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-capability-rules-living-'));
    changeFolder = path.join(tmpDir, 'openspec', 'changes', '001-test');
    livingDir = path.join(tmpDir, 'openspec', 'specs');
    await fs.mkdir(changeFolder, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeDelta(capability: string, content: string): Promise<void> {
    const dir = path.join(changeFolder, 'specs', capability);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec.md'), content, 'utf8');
  }

  async function writeLiving(capability: string, content: string): Promise<void> {
    const dir = path.join(livingDir, capability);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec.md'), content, 'utf8');
  }

  function options(extra: Partial<SpawnTaskOptions> = {}): SpawnTaskOptions {
    return {
      projectRoot: tmpDir,
      specFolderPath: changeFolder,
      taskNumber: '1',
      taskTitle: 'When capability rules are resolved',
      verifyCommand: 'node -e "process.exit(0)"',
      scope: ['src/harness/types.ts'],
      entry: ['src/harness/types.ts'],
      skills: [],
      tier: 'coding',
      ...extra,
    };
  }

  it('extractCapabilityRules drops a delta requirement equal to the living one', async () => {
    await writeDelta('totals', DELTA_TOTALS);
    await writeDelta('extras', DELTA_EXTRAS);
    await writeLiving('totals', LIVING_TOTALS);

    assert.deepEqual(extractCapabilityRules(changeFolder, livingDir), [
      'extras: Extras only — The capability SHALL add extras.',
      'totals: Refunds — The capability SHALL refund every line.',
    ]);
  });

  it('extractCapabilityRules keeps every rule for a capability with no living spec', async () => {
    await writeDelta('extras', DELTA_EXTRAS);

    assert.deepEqual(extractCapabilityRules(changeFolder, livingDir), [
      'extras: Extras only — The capability SHALL add extras.',
    ]);
  });

  it('extractCapabilityRules behaves as today without a living directory', async () => {
    await writeDelta('totals', DELTA_TOTALS);
    await writeLiving('totals', LIVING_TOTALS);

    assert.deepEqual(extractCapabilityRules(changeFolder), [
      'totals: Totals — The capability SHALL total every line.',
      'totals: Refunds — The capability SHALL refund every line.',
    ]);
  });

  it('resolveCapabilityRules reads living specs under config.paths.features', async () => {
    await writeDelta('totals', DELTA_TOTALS);
    await writeLiving('totals', LIVING_TOTALS);

    const rules = resolveCapabilityRules(options({ config: DEFAULT_CONFIG }));

    assert.deepEqual(rules, ['totals: Refunds — The capability SHALL refund every line.']);
  });

  it('resolveCapabilityRules defaults to openspec/specs when config is unset', async () => {
    await writeDelta('totals', DELTA_TOTALS);
    await writeLiving('totals', LIVING_TOTALS);

    const rules = resolveCapabilityRules(options());

    assert.deepEqual(rules, ['totals: Refunds — The capability SHALL refund every line.']);
  });

  it('resolveCapabilityRules honors an explicit capabilityRules option', async () => {
    await writeDelta('totals', DELTA_TOTALS);
    await writeLiving('totals', LIVING_TOTALS);

    const rules = resolveCapabilityRules(options({ capabilityRules: ['explicit: rule'] }));

    assert.deepEqual(rules, ['explicit: rule']);
  });

  it('buildExecutorPrompt carries the added rule and leaves out the unchanged one', async () => {
    await writeDelta('totals', DELTA_TOTALS);
    await writeDelta('extras', DELTA_EXTRAS);
    await writeLiving('totals', LIVING_TOTALS);

    const prompt = buildExecutorPrompt(options({ config: DEFAULT_CONFIG }));

    assert.ok(
      prompt.includes('- totals: Refunds — The capability SHALL refund every line.'),
      'prompt should carry the new Refunds rule',
    );
    assert.ok(
      prompt.includes('- extras: Extras only — The capability SHALL add extras.'),
      'prompt should carry the rule for a capability with no living spec',
    );
    assert.ok(
      !prompt.includes('- totals: Totals — The capability SHALL total every line.'),
      'prompt should leave out the unchanged Totals rule',
    );
  });

  it('buildExecutorPrompt leaves out the unchanged rule through the deltas path', async () => {
    await writeDelta('totals', DELTA_TOTALS);
    await writeLiving('totals', LIVING_TOTALS);

    const prompt = buildExecutorPrompt(options({ config: DEFAULT_CONFIG }));

    assert.ok(!prompt.includes('Capability Rules:') || !prompt.includes('totals: Totals —'));
    assert.ok(prompt.includes('Capability Rules:'));
  });
});
