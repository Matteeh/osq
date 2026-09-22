import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import {
  OpencodeAdapter,
  buildOpencodeArgs,
  buildOpencodePrompt,
  spawnTask,
} from '../src/harness/opencode/opencode.js';
import type { SpawnTaskOptions } from '../src/harness/types.js';

describe('OpenCode Adapter Task Spawning', () => {
  let tmpDir: string;
  let specFolder: string;
  let taskPath: string;
  let specPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-opencode-spawn-test-'));
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Spawn Feature');
    specFolder = spec.folderPath;
    specPath = path.join(specFolder, 'proposal.md');
    taskPath = path.join(specFolder, 'tasks', '1.md');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('spawnTask constructs arguments: run --agent <agent> --auto --format json --dir <projectRoot> --model <model>', async () => {
    const defaultOptions: SpawnTaskOptions = {
      projectRoot: tmpDir,
      specFolderPath: specFolder,
      taskNumber: '1',
      taskTitle: 'When default spawn runs',
      verifyCommand: 'node -e "process.exit(0)"',
      scope: ['src/a.ts'],
      entry: ['src/a.ts'],
      skills: [],
      tier: 'coding',
      config: DEFAULT_CONFIG,
    };

    const defaultArgs = await buildOpencodeArgs(defaultOptions);

    assert.equal(defaultArgs[0], 'run');
    const defaultPrompt = buildOpencodePrompt(defaultOptions);
    assert.equal(defaultArgs[1], defaultPrompt);
    for (let i = 0; i < defaultArgs.length; i++) {
      if (defaultArgs[i] === '--file') {
        assert.notEqual(defaultArgs[i + 1], defaultPrompt);
      }
    }
    assert.ok(defaultArgs.includes('--agent'));
    assert.equal(defaultArgs[defaultArgs.indexOf('--agent') + 1], 'osq-coder');
    assert.ok(defaultArgs.includes('--auto'));
    assert.ok(defaultArgs.includes('--format'));
    assert.equal(defaultArgs[defaultArgs.indexOf('--format') + 1], 'json');
    assert.ok(defaultArgs.includes('--dir'));
    assert.equal(defaultArgs[defaultArgs.indexOf('--dir') + 1], tmpDir);
    assert.ok(defaultArgs.includes('--model'));
    assert.equal(defaultArgs[defaultArgs.indexOf('--model') + 1], 'deepseek/deepseek-flash');

    // Also verify spawnTask alias exists and matches buildOpencodeArgs
    assert.ok(typeof spawnTask === 'function');

    // Customized model and agent
    const customConfig: OsqConfig = {
      ...DEFAULT_CONFIG,
      opencode: {
        bin: 'opencode',
        model: 'anthropic/claude-3-5-sonnet',
        agent: 'custom-coder',
      },
    };

    const customOptions: SpawnTaskOptions = {
      ...defaultOptions,
      config: customConfig,
    };

    const customArgs = await buildOpencodeArgs(customOptions);
    assert.equal(customArgs[customArgs.indexOf('--agent') + 1], 'custom-coder');
    assert.equal(customArgs[customArgs.indexOf('--model') + 1], 'anthropic/claude-3-5-sonnet');
  });

  it('Optional variant flag --variant <variant> is included when configured', async () => {
    const baseOptions: SpawnTaskOptions = {
      projectRoot: tmpDir,
      specFolderPath: specFolder,
      taskNumber: '1',
      taskTitle: 'When variant is tested',
      verifyCommand: 'node -e "process.exit(0)"',
      scope: ['src/b.ts'],
      entry: ['src/b.ts'],
      skills: [],
      tier: 'coding',
      config: DEFAULT_CONFIG,
    };

    // Variant not configured -> --variant is not present
    const argsWithoutVariant = await buildOpencodeArgs(baseOptions);
    assert.equal(argsWithoutVariant.includes('--variant'), false);

    // Variant configured -> --variant <variant> included
    const configWithVariant: OsqConfig = {
      ...DEFAULT_CONFIG,
      opencode: {
        ...DEFAULT_CONFIG.opencode,
        variant: 'high',
      },
    };

    const argsWithVariant = await buildOpencodeArgs({
      ...baseOptions,
      config: configWithVariant,
    });

    assert.ok(argsWithVariant.includes('--variant'));
    const variantIndex = argsWithVariant.indexOf('--variant');
    assert.equal(argsWithVariant[variantIndex + 1], 'high');
  });

  it('attaches task, proposal, and existing living specs named by the task', async () => {
    // Write features in task.md
    const taskContentWithFeatures = `---
title: When task names specific features
verify: node -e "process.exit(0)"
scope: [src/c.ts]
entry: [src/c.ts]
skills: []
features: [feature-alpha, feature-beta]
---
## Acceptance
- [ ] criterion 1
`;
    await fs.writeFile(taskPath, taskContentWithFeatures, 'utf8');
    for (const capability of ['feature-alpha', 'feature-beta']) {
      const capabilityDir = path.join(tmpDir, DEFAULT_CONFIG.paths.features, capability);
      await fs.mkdir(capabilityDir, { recursive: true });
      await fs.writeFile(path.join(capabilityDir, 'spec.md'), `# ${capability}\n`, 'utf8');
    }

    const options: SpawnTaskOptions = {
      projectRoot: tmpDir,
      specFolderPath: specFolder,
      taskNumber: '1',
      taskTitle: 'When task names specific features',
      verifyCommand: 'node -e "process.exit(0)"',
      scope: ['src/c.ts'],
      entry: ['src/c.ts'],
      skills: [],
      tier: 'coding',
      config: DEFAULT_CONFIG,
    };

    const args = await buildOpencodeArgs(options);

    const taskRelPath = path.relative(tmpDir, taskPath);
    const specRelPath = path.relative(tmpDir, specPath);

    // Collect all --file values in order
    const attachedFiles: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--file') {
        attachedFiles.push(args[i + 1]);
      }
    }

    assert.equal(attachedFiles[0], taskRelPath);
    assert.equal(attachedFiles[1], specRelPath);
    assert.ok(
      attachedFiles.includes(path.join(DEFAULT_CONFIG.paths.features, 'feature-alpha', 'spec.md')),
    );
    assert.ok(
      attachedFiles.includes(path.join(DEFAULT_CONFIG.paths.features, 'feature-beta', 'spec.md')),
    );

    for (const attached of attachedFiles) {
      assert.equal(
        await fs
          .stat(path.join(tmpDir, attached))
          .then((stat) => stat.isFile())
          .catch(() => false),
        true,
        `attached path must be an existing file: ${attached}`,
      );
    }
  });

  it('attaches a new capability delta without fabricating a living spec path', async () => {
    const options: SpawnTaskOptions = {
      projectRoot: tmpDir,
      specFolderPath: specFolder,
      taskNumber: '1',
      taskTitle: 'When a change introduces a capability',
      verifyCommand: 'node -e "process.exit(0)"',
      scope: ['src/c.ts'],
      entry: ['src/c.ts'],
      skills: [],
      tier: 'coding',
      config: DEFAULT_CONFIG,
    };
    const taskRelPath = path.relative(tmpDir, taskPath);
    const specRelPath = path.relative(tmpDir, specPath);

    // Fallback: when task does not specify features, use parent spec.md features
    const taskContentWithoutFeatures = `---
title: When task does not specify features
verify: node -e "process.exit(0)"
scope: [src/c.ts]
entry: [src/c.ts]
skills: []
---
## Acceptance
- [ ] criterion 1
`;
    await fs.writeFile(taskPath, taskContentWithoutFeatures, 'utf8');

    const specContentWithFeatures = `---
title: Spawn Feature
depends_on: []
features:
  reads: [spec-feat-read]
---
## Goal
Test spec features fallback.
## Contract
| A | B |
|---|---|
| 1 | 2 |
## Non-goals
None
## Delta
None
`;
    await fs.writeFile(specPath, specContentWithFeatures, 'utf8');

    const readCapabilityDir = path.join(tmpDir, DEFAULT_CONFIG.paths.features, 'spec-feat-read');
    await fs.mkdir(readCapabilityDir, { recursive: true });
    await fs.writeFile(path.join(readCapabilityDir, 'spec.md'), '# read capability\n', 'utf8');

    // Written capabilities are declared by delta spec folders under `specs/`.
    const deltaDir = path.join(specFolder, 'specs', 'spec-feat-write');
    await fs.mkdir(deltaDir, { recursive: true });
    await fs.writeFile(path.join(deltaDir, 'spec.md'), '# delta\n', 'utf8');

    const fallbackArgs = await buildOpencodeArgs(options);
    const fallbackAttachedFiles: string[] = [];
    for (let i = 0; i < fallbackArgs.length; i++) {
      if (fallbackArgs[i] === '--file') {
        fallbackAttachedFiles.push(fallbackArgs[i + 1]);
      }
    }

    assert.equal(fallbackAttachedFiles[0], taskRelPath);
    assert.equal(fallbackAttachedFiles[1], specRelPath);
    assert.ok(
      fallbackAttachedFiles.includes(
        path.join(DEFAULT_CONFIG.paths.features, 'spec-feat-read', 'spec.md'),
      ),
    );
    assert.ok(
      fallbackAttachedFiles.includes(path.relative(tmpDir, path.join(deltaDir, 'spec.md'))),
    );
    assert.equal(
      fallbackAttachedFiles.includes(
        path.join(DEFAULT_CONFIG.paths.features, 'spec-feat-write.md'),
      ),
      false,
    );
    assert.equal(
      fallbackAttachedFiles.includes(
        path.join(DEFAULT_CONFIG.paths.features, 'spec-feat-write', 'spec.md'),
      ),
      false,
    );

    for (const attached of fallbackAttachedFiles) {
      assert.equal(
        await fs
          .stat(path.join(tmpDir, attached))
          .then((stat) => stat.isFile())
          .catch(() => false),
        true,
        `attached path must be an existing file: ${attached}`,
      );
    }
  });

  it('Positional prompt argument defines task guidelines matching AGENTS.md protocol', async () => {
    const options: SpawnTaskOptions = {
      projectRoot: tmpDir,
      specFolderPath: specFolder,
      taskNumber: '1',
      taskTitle: 'When prompt guidelines match AGENTS.md protocol',
      verifyCommand: 'pnpm test tests/sample.test.ts',
      scope: ['src/core/sample.ts', 'tests/sample.test.ts'],
      entry: ['src/core/sample.ts'],
      skills: [],
      tier: 'coding',
      config: DEFAULT_CONFIG,
    };

    const prompt = buildOpencodePrompt(options);

    const taskRelPath = path.relative(tmpDir, taskPath);
    const specRelPath = path.relative(tmpDir, specPath);
    const resultRelPath = path.relative(tmpDir, path.join(specFolder, '.run', 'results', '1.md'));

    // Verify key elements matching AGENTS.md protocol
    assert.ok(
      prompt.includes(
        'You are a coding agent working autonomously on an osq task. Follow AGENTS.md strictly.',
      ),
    );
    assert.ok(prompt.includes(`Task File: ${taskRelPath}`));
    assert.ok(prompt.includes(`Parent Spec: ${specRelPath}`));
    assert.ok(prompt.includes('Task Title: When prompt guidelines match AGENTS.md protocol'));
    assert.ok(prompt.includes('Scope: src/core/sample.ts, tests/sample.test.ts'));
    assert.ok(prompt.includes('Entry: src/core/sample.ts'));
    assert.ok(prompt.includes('Verify Command: pnpm test tests/sample.test.ts'));
    assert.ok(
      prompt.includes(
        `1. Read ${taskRelPath}, ${specRelPath}, then only the delta specs and capability specs the task names.`,
      ),
    );
    assert.ok(prompt.includes('2. Write tests for each acceptance line before implementing.'));
    assert.ok(prompt.includes('3. Keep all edits strictly inside scope.'));
    assert.ok(prompt.includes('4. Verify your work by running: pnpm test tests/sample.test.ts'));
    assert.ok(
      prompt.includes(
        `5. CRITICAL: Before exiting, you MUST write ${resultRelPath} following the Exiting section of AGENTS.md: changed, deviated, missing context, and for unfinished work which acceptance line is next.`,
      ),
    );
    assert.ok(
      prompt.includes(
        `6. Do not modify tasks.md, proposal.md, or any file outside your scope and ${resultRelPath}.`,
      ),
    );
    assert.ok(prompt.includes(`7. When done, write ${resultRelPath} and exit cleanly.`));

    // Verify prompt is args[1] (immediately after "run") and no --file value equals the prompt
    const args = await buildOpencodeArgs(options);
    assert.equal(args[1], prompt);
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--file') {
        assert.notEqual(args[i + 1], prompt);
      }
    }
  });

  it('Fake opencode binary validates passed flags, handles non-zero exit, and respects timeout termination', async () => {
    const recordedArgsFile = path.join(tmpDir, 'fake-opencode-recorded.json');

    // 1. Fake binary that validates flags and exits cleanly
    const fakeValidatingBin = path.join(tmpDir, 'fake-validating-opencode.mjs');
    const validatingScript = `#!/usr/bin/env node
import fs from 'node:fs';

const argv = process.argv.slice(2);

const fileIdx = argv.indexOf('--file');
if (fileIdx !== -1) {
  for (let i = fileIdx + 1; i < argv.length; i++) {
    if (argv[i].startsWith('You are a coding agent')) {
      console.error('Error: File not found: ' + argv[i]);
      process.exit(1);
    }
  }
}

const recorded = {
  argv,
  subcommand: argv[0],
  agent: null,
  auto: false,
  format: null,
  dir: null,
  model: null,
  variant: null,
  files: [],
  prompt: argv[1],
};

for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--agent') recorded.agent = argv[++i];
  else if (argv[i] === '--auto') recorded.auto = true;
  else if (argv[i] === '--format') recorded.format = argv[++i];
  else if (argv[i] === '--dir') recorded.dir = argv[++i];
  else if (argv[i] === '--model') recorded.model = argv[++i];
  else if (argv[i] === '--variant') recorded.variant = argv[++i];
  else if (argv[i] === '--file') recorded.files.push(argv[++i]);
}

fs.writeFileSync(${JSON.stringify(recordedArgsFile)}, JSON.stringify(recorded, null, 2), 'utf8');

// Validate expectations
if (recorded.subcommand !== 'run') {
  console.error('Expected run subcommand, got: ' + recorded.subcommand);
  process.exit(1);
}
if (!recorded.auto) {
  console.error('Expected --auto flag');
  process.exit(1);
}
if (recorded.format !== 'json') {
  console.error('Expected --format json, got: ' + recorded.format);
  process.exit(1);
}
if (!recorded.prompt || !recorded.prompt.includes('AGENTS.md')) {
  console.error('Prompt missing AGENTS.md guidelines');
  process.exit(1);
}

process.exit(0);
`;
    await fs.writeFile(fakeValidatingBin, validatingScript, { mode: 0o755 });

    const adapter = new OpencodeAdapter();
    const configWithFakeBin: OsqConfig = {
      ...DEFAULT_CONFIG,
      opencode: {
        bin: fakeValidatingBin,
        model: 'custom/model-val',
        agent: 'custom-agent-val',
        variant: 'thinking',
      },
    };

    const taskOptions: SpawnTaskOptions = {
      projectRoot: tmpDir,
      specFolderPath: specFolder,
      taskNumber: '1',
      taskTitle: 'When fake opencode runs',
      verifyCommand: 'node -e "process.exit(0)"',
      scope: ['src/fake.ts'],
      entry: ['src/fake.ts'],
      skills: [],
      tier: 'coding',
      config: configWithFakeBin,
    };

    // Execute spawn
    const successResult = await adapter.spawn(taskOptions);
    assert.equal(successResult.exitCode, 0);
    assert.equal(successResult.timedOut, false);

    // Verify recorded flags
    const recordedContent = await fs.readFile(recordedArgsFile, 'utf8');
    const recorded = JSON.parse(recordedContent);
    assert.equal(recorded.subcommand, 'run');
    assert.equal(recorded.agent, 'custom-agent-val');
    assert.equal(recorded.auto, true);
    assert.equal(recorded.format, 'json');
    assert.equal(recorded.dir, tmpDir);
    assert.equal(recorded.model, 'custom/model-val');
    assert.equal(recorded.variant, 'thinking');
    assert.ok(recorded.files.length >= 2);
    assert.ok(recorded.prompt.includes('Follow AGENTS.md strictly.'));

    assert.ok(typeof successResult.pid === 'number' && successResult.pid > 0);

    // 2. Fake binary that handles non-zero exit
    const fakeFailingBin = path.join(tmpDir, 'fake-failing-opencode.mjs');
    const failingScript = `#!/usr/bin/env node
console.error('Simulated fatal error in opencode');
process.exit(42);
`;
    await fs.writeFile(fakeFailingBin, failingScript, { mode: 0o755 });

    const failingConfig: OsqConfig = {
      ...DEFAULT_CONFIG,
      opencode: {
        bin: fakeFailingBin,
      },
    };

    const failResult = await adapter.spawn({
      ...taskOptions,
      taskNumber: '2',
      config: failingConfig,
    });

    assert.equal(failResult.exitCode, 42);
    assert.equal(failResult.timedOut, false);
    assert.ok(failResult.error?.includes('Simulated fatal error in opencode'));

    // 3. Fake binary that respects timeout termination
    const fakeHangingBin = path.join(tmpDir, 'fake-hanging-opencode.mjs');
    const hangingScript = `#!/usr/bin/env node
setInterval(() => {}, 1000);
`;
    await fs.writeFile(fakeHangingBin, hangingScript, { mode: 0o755 });

    const hangingConfig: OsqConfig = {
      ...DEFAULT_CONFIG,
      opencode: {
        bin: fakeHangingBin,
      },
    };

    const timeoutResult = await adapter.spawn({
      ...taskOptions,
      taskNumber: '3',
      timeoutSeconds: 1,
      config: hangingConfig,
    });

    assert.equal(timeoutResult.timedOut, true);
    assert.equal(timeoutResult.exitCode, 124);
    assert.equal(timeoutResult.signal, 'SIGTERM');
    assert.equal(timeoutResult.error, 'Task execution timed out');
  });
});
