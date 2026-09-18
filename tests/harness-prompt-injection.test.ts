import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { buildAgyPrompt } from '../src/harness/agy.js';
import { buildOpencodePrompt } from '../src/harness/opencode.js';
import { type SpawnTaskOptions, extractCapabilityRules } from '../src/harness/types.js';

const ALPHA_DELTA = `# Spec Delta: Alpha

## Purpose

Alpha capability delta.

## ADDED Requirements

### Requirement: Alpha ownership
The Alpha capability SHALL own alpha files.

#### Scenario: alpha boundary
- **WHEN** ownership is resolved
- **THEN** system maps alpha files to alpha

### Requirement: Alpha gating
The Alpha capability SHALL gate alpha actions.
`;

const BETA_DELTA = `# Spec Delta: Beta

## ADDED Requirements

### Requirement: Beta rule
The Beta capability SHALL do beta.
`;

describe('Harness capability rule prompt injection', () => {
  let tmpDir: string;
  let changeFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-prompt-injection-test-'));
    changeFolder = path.join(tmpDir, 'openspec', 'changes', '001-test');
    await fs.mkdir(changeFolder, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function options(extra: Partial<SpawnTaskOptions> = {}): SpawnTaskOptions {
    return {
      projectRoot: tmpDir,
      specFolderPath: changeFolder,
      taskNumber: '3',
      taskTitle: 'When executor prompts are constructed',
      verifyCommand: 'node -e "process.exit(0)"',
      scope: ['src/harness/agy.ts'],
      entry: ['src/harness/agy.ts'],
      skills: [],
      tier: 'coding',
      ...extra,
    };
  }

  async function writeDelta(capability: string, content: string): Promise<void> {
    const capabilityDir = path.join(changeFolder, 'specs', capability);
    await fs.mkdir(capabilityDir, { recursive: true });
    await fs.writeFile(path.join(capabilityDir, 'spec.md'), content, 'utf8');
  }

  it('extractCapabilityRules reads delta specs under specs/<capability>/spec.md', async () => {
    await writeDelta('beta', BETA_DELTA);
    await writeDelta('alpha', ALPHA_DELTA);

    const rules = extractCapabilityRules(changeFolder);

    assert.deepEqual(rules, [
      'alpha: Alpha ownership — The Alpha capability SHALL own alpha files.',
      'alpha: Alpha gating — The Alpha capability SHALL gate alpha actions.',
      'beta: Beta rule — The Beta capability SHALL do beta.',
    ]);
  });

  it('extractCapabilityRules returns an empty array when no delta specs exist', () => {
    assert.deepEqual(extractCapabilityRules(changeFolder), []);
  });

  it('buildAgyPrompt injects capabilityRules under a dedicated section in Rules', () => {
    const rules = ['alpha: The Alpha capability SHALL own alpha files.'];
    const prompt = buildAgyPrompt(options({ capabilityRules: rules }));

    assert.ok(prompt.includes('Rules:'));
    assert.ok(prompt.includes('Capability Rules:'));
    assert.ok(prompt.includes('- alpha: The Alpha capability SHALL own alpha files.'));
    assert.ok(prompt.indexOf('Capability Rules:') > prompt.indexOf('Rules:'));
    assert.ok(prompt.includes('7. When done, write'));
  });

  it('buildOpencodePrompt injects capabilityRules under the same dedicated section in Rules', () => {
    const rules = ['alpha: The Alpha capability SHALL own alpha files.'];
    const prompt = buildOpencodePrompt(options({ capabilityRules: rules }));

    assert.ok(prompt.includes('Rules:'));
    assert.ok(prompt.includes('Capability Rules:'));
    assert.ok(prompt.includes('- alpha: The Alpha capability SHALL own alpha files.'));
    assert.ok(prompt.indexOf('Capability Rules:') > prompt.indexOf('Rules:'));
    assert.ok(prompt.includes('7. When done, write'));
  });

  it('builds standard default rules without empty headers when capability rules are absent', () => {
    const agyPrompt = buildAgyPrompt(options());
    const opencodePrompt = buildOpencodePrompt(options());

    for (const prompt of [agyPrompt, opencodePrompt]) {
      assert.ok(prompt.includes('Rules:'));
      assert.ok(prompt.includes('1. Read '));
      assert.ok(prompt.includes('2. Write tests for each acceptance line before implementing.'));
      assert.ok(prompt.includes('7. When done, write'));
      assert.ok(!prompt.includes('Capability Rules:'));
    }
  });

  it('treats an explicit empty capabilityRules array as no capability rules', () => {
    const agyPrompt = buildAgyPrompt(options({ capabilityRules: [] }));
    const opencodePrompt = buildOpencodePrompt(options({ capabilityRules: [] }));

    assert.ok(!agyPrompt.includes('Capability Rules:'));
    assert.ok(!opencodePrompt.includes('Capability Rules:'));
  });

  it('derives capability rules from the change folder when capabilityRules is absent', async () => {
    await writeDelta('alpha', ALPHA_DELTA);

    const agyPrompt = buildAgyPrompt(options());
    const opencodePrompt = buildOpencodePrompt(options());

    for (const prompt of [agyPrompt, opencodePrompt]) {
      assert.ok(prompt.includes('Capability Rules:'));
      assert.ok(
        prompt.includes('- alpha: Alpha ownership — The Alpha capability SHALL own alpha files.'),
      );
      assert.ok(
        prompt.includes('- alpha: Alpha gating — The Alpha capability SHALL gate alpha actions.'),
      );
    }
  });
});
