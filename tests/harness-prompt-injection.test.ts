import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { EXECUTOR_EXIT_LINES, EXECUTOR_STEPS } from '../src/core/foundation/init-blocks.js';
import { buildAgyArgs, buildAgyPrompt } from '../src/harness/agy/agy.js';
import { buildCodexArgs, buildCodexPrompt } from '../src/harness/codex/codex-prompt.js';
import { buildOpencodeArgs, buildOpencodePrompt } from '../src/harness/opencode/opencode.js';
import { buildExecutorPrompt } from '../src/harness/prompt.js';
import {
  type SpawnTaskOptions,
  extractCapabilityRules,
  priorContextLines,
} from '../src/harness/types.js';

const FIXTURES_DIR = fileURLToPath(new URL('./fixtures/prompts/', import.meta.url));
const GOLDEN_HARNESSES = ['agy', 'opencode', 'codex'] as const;
const UPDATE_GOLDEN = process.env.UPDATE_GOLDEN === '1';

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

  /** Write the shared golden fixture change folder used by the assertions below. */
  async function writeGoldenFixture(): Promise<void> {
    const proposal = [
      '---',
      'title: Test',
      'depends_on: []',
      'verify: node -e "process.exit(0)"',
      'features:',
      '  reads:',
      '    - alpha',
      '---',
      '## Goal',
      'Test.',
      '',
    ].join('\n');
    await fs.writeFile(path.join(changeFolder, 'proposal.md'), proposal, 'utf8');
    await fs.mkdir(path.join(changeFolder, 'tasks'), { recursive: true });
    const task = [
      '---',
      'title: When executor prompts are constructed',
      'verify: node -e "process.exit(0)"',
      'scope:',
      '  - src/harness/agy.ts',
      'entry:',
      '  - src/harness/agy.ts',
      'skills: []',
      '---',
      '## Acceptance',
      '- [ ] criterion',
      '',
    ].join('\n');
    await fs.writeFile(path.join(changeFolder, 'tasks', '3.md'), task, 'utf8');
    await writeDelta('alpha', ALPHA_DELTA);
    await writeDelta('beta', BETA_DELTA);
    const livingDir = path.join(tmpDir, 'openspec', 'specs', 'alpha');
    await fs.mkdir(livingDir, { recursive: true });
    await fs.writeFile(path.join(livingDir, 'spec.md'), '# alpha\n', 'utf8');
  }

  /** The prompt each textual harness actually delivers for `options`. */
  async function deliveredPrompts(taskOptions: SpawnTaskOptions): Promise<string[]> {
    const agyArgs = buildAgyArgs(taskOptions);
    const opencodeArgs = await buildOpencodeArgs(taskOptions);
    const codexArgs = await buildCodexArgs(taskOptions);
    return [
      agyArgs[agyArgs.indexOf('-p') + 1] ?? '',
      opencodeArgs[opencodeArgs.indexOf('run') + 1] ?? '',
      codexArgs[codexArgs.length - 1] ?? '',
    ];
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

  it('delivers one golden prompt through agy, opencode, and codex argv', async () => {
    await writeGoldenFixture();
    const taskOptions = options({ config: DEFAULT_CONFIG });
    const expected = buildExecutorPrompt(taskOptions);
    const delivered = await deliveredPrompts(taskOptions);

    assert.deepEqual(delivered, [expected, expected, expected]);

    for (let index = 0; index < GOLDEN_HARNESSES.length; index++) {
      const fixturePath = path.join(FIXTURES_DIR, `${GOLDEN_HARNESSES[index]}.txt`);
      if (UPDATE_GOLDEN) {
        await fs.mkdir(FIXTURES_DIR, { recursive: true });
        await fs.writeFile(fixturePath, delivered[index] ?? '', 'utf8');
        continue;
      }
      assert.equal(delivered[index], await fs.readFile(fixturePath, 'utf8'));
    }
  });

  it('carries every managed step and exit line through every harness', async () => {
    await writeGoldenFixture();
    const prompts = await deliveredPrompts(options({ config: DEFAULT_CONFIG }));

    for (const prompt of prompts) {
      for (const step of EXECUTOR_STEPS) {
        assert.ok(prompt.includes(step), `missing managed step: ${step}`);
      }
      for (const line of EXECUTOR_EXIT_LINES.filter((entry) => entry.length > 0)) {
        assert.ok(prompt.includes(line), `missing managed exit line: ${line}`);
      }
      assert.ok(prompt.includes('Rules:'));
      assert.ok(prompt.includes('Exiting:'));
      assert.ok(prompt.includes('CRITICAL:'));
      assert.ok(prompt.includes('Delta Specs:'));
      assert.ok(prompt.includes('Living Capability Specs:'));
      assert.ok(!prompt.includes('features/'));
    }
  });

  it('omits delta and living sections when the change has neither', async () => {
    const prompts = await deliveredPrompts(options({ config: DEFAULT_CONFIG }));

    for (const prompt of prompts) {
      assert.ok(!prompt.includes('Delta Specs:'));
      assert.ok(!prompt.includes('Living Capability Specs:'));
    }
  });

  it('names proposal.md as Parent Spec even when the change folder has no proposal.md', async () => {
    const prompts = await deliveredPrompts(options({ config: DEFAULT_CONFIG }));

    for (const prompt of prompts) {
      assert.ok(
        prompt.includes(
          `Parent Spec: ${path.relative(tmpDir, path.join(changeFolder, 'proposal.md'))}`,
        ),
      );
    }
  });

  it('buildAgyPrompt injects capabilityRules under a dedicated section in Rules', () => {
    const rules = ['alpha: The Alpha capability SHALL own alpha files.'];
    const prompt = buildAgyPrompt(options({ capabilityRules: rules }));

    assert.ok(prompt.includes('Rules:'));
    assert.ok(prompt.includes('Capability Rules:'));
    assert.ok(prompt.includes('- alpha: The Alpha capability SHALL own alpha files.'));
    assert.ok(prompt.indexOf('Capability Rules:') > prompt.indexOf('Rules:'));
    assert.ok(prompt.includes(EXECUTOR_STEPS[0] ?? ''));
  });

  it('buildOpencodePrompt injects capabilityRules under the same dedicated section in Rules', () => {
    const rules = ['alpha: The Alpha capability SHALL own alpha files.'];
    const prompt = buildOpencodePrompt(options({ capabilityRules: rules }));

    assert.ok(prompt.includes('Rules:'));
    assert.ok(prompt.includes('Capability Rules:'));
    assert.ok(prompt.includes('- alpha: The Alpha capability SHALL own alpha files.'));
    assert.ok(prompt.indexOf('Capability Rules:') > prompt.indexOf('Rules:'));
    assert.ok(prompt.includes(EXECUTOR_STEPS[0] ?? ''));
  });

  it('builds standard default rules without empty headers when capability rules are absent', () => {
    const agyPrompt = buildAgyPrompt(options());
    const opencodePrompt = buildOpencodePrompt(options());

    for (const prompt of [agyPrompt, opencodePrompt]) {
      assert.ok(prompt.includes('Rules:'));
      for (const step of EXECUTOR_STEPS) {
        assert.ok(prompt.includes(step));
      }
      assert.ok(!prompt.includes('Capability Rules:'));
    }
  });

  it('points every adapter at the concrete result path and no retired features/ docs', async () => {
    const prompts = [
      buildAgyPrompt(options()),
      buildOpencodePrompt(options()),
      await buildCodexPrompt(options()),
    ];

    for (const prompt of prompts) {
      assert.ok(prompt.includes('CRITICAL: Before exiting, you MUST write'));
      assert.ok(prompt.includes('One attempt.'));
      assert.ok(!prompt.includes('features/'));
      assert.ok(!prompt.includes('features docs'));
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

  it('renders one prior-context section naming attempt, failure reason, and prior result', async () => {
    const resultsDir = path.join(changeFolder, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(path.join(resultsDir, '3.md'), '# prior\n', 'utf8');
    const priorResult = path.relative(tmpDir, path.join(resultsDir, '3.md'));

    const retryOptions = options({ attempt: 2, priorFailureReason: 'verify_red' });
    const prompts = [
      buildAgyPrompt(retryOptions),
      buildOpencodePrompt(retryOptions),
      await buildCodexPrompt(retryOptions),
    ];

    for (const prompt of prompts) {
      assert.ok(prompt.includes('Prior Context:'));
      assert.ok(prompt.includes('- Prior Attempt: 2'));
      assert.ok(prompt.includes('- Prior Failure: verify_red'));
      assert.ok(prompt.includes(`- Prior Result: ${priorResult}`));
    }
  });

  it('omits the prior-context section on a fresh first attempt without a prior result', () => {
    const prompts = [buildAgyPrompt(options()), buildOpencodePrompt(options())];

    for (const prompt of prompts) {
      assert.ok(!prompt.includes('Prior Context:'));
    }
  });

  it('treats an explicit prior result as prior context even before a retry', () => {
    assert.deepEqual(priorContextLines({ attempt: 1 }), []);
    assert.deepEqual(priorContextLines({ attempt: 2, reason: 'crashed' }), [
      '',
      'Prior Context:',
      '- Prior Attempt: 2',
      '- Prior Failure: crashed',
    ]);
  });

  it('renders a failed verification output block inside the prior context', () => {
    assert.deepEqual(
      priorContextLines({ attempt: 3, reason: 'scope_regression', output: 'line one\nline two' }),
      [
        '',
        'Prior Context:',
        '- Prior Attempt: 3',
        '- Prior Failure: scope_regression',
        '- Prior Failure Output:',
        '  line one',
        '  line two',
      ],
    );
  });

  it('bounds an oversized prior failure output deterministically', () => {
    const output = 'x'.repeat(5000);
    const block = priorContextLines({ attempt: 2, output }).join('\n');
    assert.ok(block.length < output.length);
    assert.ok(block.endsWith('…'));
  });

  it('renders the same failed-output block in every textual prompt', async () => {
    const retryOptions = options({
      attempt: 2,
      priorFailureReason: 'scope_regression',
      priorFailureOutput: 'boom output',
    });
    const prompts = [
      buildAgyPrompt(retryOptions),
      buildOpencodePrompt(retryOptions),
      await buildCodexPrompt(retryOptions),
    ];

    for (const prompt of prompts) {
      assert.ok(prompt.includes('Prior Context:'));
      assert.ok(prompt.includes('- Prior Attempt: 2'));
      assert.ok(prompt.includes('- Prior Failure: scope_regression'));
      assert.ok(prompt.includes('- Prior Failure Output:'));
      assert.ok(prompt.includes('  boom output'));
    }
  });
});
