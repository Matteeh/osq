import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createProgram } from '../src/cli/index.js';
import { lintCommand } from '../src/cli/lint.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import type { Logger } from '../src/core/foundation/logger.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import type { LintFinding } from '../src/core/spec/lint-findings.js';
import { REPOSITORY_HEADER } from '../src/core/spec/lint-output.js';
import { installFakeValidator } from './helpers.js';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const OPENSPEC_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'openspec');
const VERIFY = 'node verify.cjs';

const LONG_REQUIREMENT = `The system SHALL do a thing. ${'word '.repeat(120)}`;

const LIVING_ONE_LONG = `# cap Specification

## Purpose

A living capability used by this test with plenty of words for the length check.

## Requirements

### Requirement: First living behavior
${LONG_REQUIREMENT}

#### Scenario: Works
- **WHEN** invoked
- **THEN** works
`;

const LIVING_TWO_LONG = `# cap Specification

## Purpose

A living capability used by this test with plenty of words for the length check.

## Requirements

### Requirement: First living behavior
${LONG_REQUIREMENT}

#### Scenario: First works
- **WHEN** invoked
- **THEN** works

### Requirement: Second living behavior
${LONG_REQUIREMENT}

#### Scenario: Second works
- **WHEN** invoked
- **THEN** works
`;

const PURPOSE = 'A capability purpose long enough to pass the fifty character briefness check.';

const CLEAN_ADDED = `## ADDED Requirements

### Requirement: Other behavior
The system SHALL behave well.

#### Scenario: Works
- **WHEN** invoked
- **THEN** works
`;

const COUNT_TWO =
  'repository: 2 findings about other changes and living specs; osq lint --repository lists them';
const COUNT_ONE =
  'repository: 1 finding about other changes and living specs; osq lint --repository lists them';

function openSpecConfig(): OsqConfig {
  return { ...DEFAULT_CONFIG, openspec: { bin: OPENSPEC_BIN } } as OsqConfig;
}

function delta(capability: string, operations: string, purpose?: string): string {
  const purposeSection = purpose ? `## Purpose\n\n${purpose}\n\n` : '';
  return `# Spec Delta: ${capability}\n\n${purposeSection}${operations}`;
}

interface Recorded {
  readonly level: 'info' | 'verbose' | 'warn' | 'error';
  readonly message: string;
}

type RecordingLogger = Pick<Logger, 'info' | 'verbose' | 'warn' | 'error'> & {
  readonly entries: Recorded[];
};

function createRecordingLogger(): RecordingLogger {
  const entries: Recorded[] = [];
  return {
    entries,
    info: (message) => entries.push({ level: 'info', message }),
    verbose: (message) => entries.push({ level: 'verbose', message }),
    warn: (message) => entries.push({ level: 'warn', message }),
    error: (message) => entries.push({ level: 'error', message }),
  };
}

/** A disposable scaffolded project with the real validator reachable via config. */
async function setupProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-lint-repository-count-'));
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  return root;
}

/** Point the scaffolded config at the real validator so default cwd resolution uses it. */
async function pointConfigAtRealValidator(root: string): Promise<void> {
  const content = `import { defineConfig } from '@matteeh/osq';

export default defineConfig({
  harness: process.env.OSQ_HARNESS || 'agy',
  maxConcurrency: 1,
  openspec: { bin: ${JSON.stringify(OPENSPEC_BIN)} },
});
`;
  await fs.writeFile(path.join(root, 'osq.config.ts'), content, 'utf8');
}

async function writeLivingSpec(root: string, capability: string, content: string): Promise<void> {
  const dir = path.join(root, 'openspec', 'specs', capability);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'spec.md'), content, 'utf8');
}

/** Create a change whose proposal and task run the local verifier. */
async function createChange(
  root: string,
  title: string,
  options: { capability?: string; delta?: string; creates?: readonly string[] } = {},
): Promise<string> {
  const spec = await createNewSpec(root, title);
  const proposalPath = path.join(spec.folderPath, 'proposal.md');
  const proposal = await fs.readFile(proposalPath, 'utf8');
  const withVerify = proposal.replace(/^verify:.*$/m, `verify: ${VERIFY}`);
  const withCreates =
    options.creates === undefined
      ? withVerify
      : withVerify.replace(
          `verify: ${VERIFY}`,
          `verify: ${VERIFY}\ncreates:\n${options.creates.map((name) => `  - ${name}`).join('\n')}`,
        );
  await fs.writeFile(proposalPath, withCreates, 'utf8');

  const taskPath = path.join(spec.folderPath, 'tasks', '1.md');
  const task = await fs.readFile(taskPath, 'utf8');
  await fs.writeFile(taskPath, task.replace(/^verify:.*$/m, `verify: ${VERIFY}`), 'utf8');

  if (options.capability && options.delta) {
    const dir = path.join(spec.folderPath, 'specs', options.capability);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec.md'), options.delta, 'utf8');
  }

  return spec.folderName;
}

describe('repository lint count', () => {
  let root: string;

  beforeEach(async () => {
    root = await setupProject();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('replaces the list with a count of two, prints no finding line, and exits 0', async () => {
    await writeLivingSpec(root, 'cap', LIVING_TWO_LONG);
    await createChange(root, 'Clean Change', {
      capability: 'other',
      creates: ['other'],
      delta: delta('other', CLEAN_ADDED, PURPOSE),
    });

    const logger = createRecordingLogger();
    const exitCodes: number[] = [];
    const result = await lintCommand(['001'], {
      cwd: root,
      config: openSpecConfig(),
      logger,
      exit: (code) => exitCodes.push(code),
    });

    assert.equal(result.valid, true, JSON.stringify(result.entries));
    assert.deepEqual(exitCodes, []);
    const last = logger.entries.at(-1);
    assert.equal(last?.message, COUNT_TWO, JSON.stringify(logger.entries));
    assert.equal(
      logger.entries.some((entry) => entry.message.startsWith('repository: warning ')),
      false,
      JSON.stringify(logger.entries),
    );
  });

  it('prints the count singular for one finding', async () => {
    await writeLivingSpec(root, 'cap', LIVING_ONE_LONG);
    await createChange(root, 'Clean Change', {
      capability: 'other',
      creates: ['other'],
      delta: delta('other', CLEAN_ADDED, PURPOSE),
    });

    const logger = createRecordingLogger();
    await lintCommand(['001'], { cwd: root, config: openSpecConfig(), logger });

    assert.equal(logger.entries.at(-1)?.message, COUNT_ONE, JSON.stringify(logger.entries));
  });

  it('prints nothing when there are no repository findings', async () => {
    await createChange(root, 'Clean Change', {
      capability: 'other',
      creates: ['other'],
      delta: delta('other', CLEAN_ADDED, PURPOSE),
    });

    const logger = createRecordingLogger();
    await lintCommand(['001'], { cwd: root, config: openSpecConfig(), logger });

    assert.equal(
      logger.entries.some((entry) => entry.message.startsWith('repository:')),
      false,
      JSON.stringify(logger.entries),
    );
  });

  it('keeps every finding in JSON with no text line on stdout', async () => {
    await writeLivingSpec(root, 'cap', LIVING_TWO_LONG);
    await createChange(root, 'Clean Change', {
      capability: 'other',
      creates: ['other'],
      delta: delta('other', CLEAN_ADDED, PURPOSE),
    });

    const logger = createRecordingLogger();
    const chunks: string[] = [];
    await lintCommand(['001'], {
      cwd: root,
      config: openSpecConfig(),
      logger,
      json: true,
      stdout: (text) => chunks.push(text),
    });

    assert.equal(chunks.length, 1, JSON.stringify(chunks));
    const stdout = chunks.join('');
    const document = JSON.parse(stdout) as { repository: LintFinding[] };
    assert.equal(document.repository.length, 2, stdout);
    assert.deepEqual(logger.entries, []);
  });
});

describe('lint --repository flag', () => {
  let root: string;

  beforeEach(async () => {
    root = await setupProject();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('lists --repository in lint help', () => {
    const program = createProgram('0.0.0');
    const lint = program.commands.find((command) => command.name() === 'lint');
    assert.ok(lint, 'lint command is registered');
    assert.match(lint.helpInformation(), /--repository/);
  });

  it('prints the repository list when --repository reaches the command', async () => {
    await writeLivingSpec(root, 'cap', LIVING_ONE_LONG);
    await createChange(root, 'Clean Change', {
      capability: 'other',
      creates: ['other'],
      delta: delta('other', CLEAN_ADDED, PURPOSE),
    });
    await pointConfigAtRealValidator(root);

    const program = createProgram('0.0.0');
    const chunks: string[] = [];
    const originalWrite = process.stderr.write;
    const originalCwd = process.cwd();
    process.stderr.write = ((chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    }) as typeof process.stderr.write;

    try {
      process.chdir(root);
      await program.parseAsync(['node', 'osq', 'lint', '001', '--repository']);
    } finally {
      process.chdir(originalCwd);
      process.stderr.write = originalWrite;
    }

    const lines = chunks
      .join('')
      .split('\n')
      .map((line) => line.replace(/^\[osq\] /, ''));
    assert.ok(lines.includes(REPOSITORY_HEADER), JSON.stringify(lines));
    assert.ok(
      lines.some((line) => line.startsWith('repository: warning ')),
      JSON.stringify(lines),
    );
  });
});
