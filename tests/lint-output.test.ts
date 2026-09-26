import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { lintCommand } from '../src/cli/lint.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import type { Logger } from '../src/core/foundation/logger.js';
import { createNewSpec } from '../src/core/foundation/new.js';
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

const CLEAN_ADDED = `## ADDED Requirements

### Requirement: Other behavior
The system SHALL behave well.

#### Scenario: Works
- **WHEN** invoked
- **THEN** works
`;

const NO_SHALL_ADDED = `## ADDED Requirements

### Requirement: No shall here
The requirement text lacks the keyword and has enough words to be parsed.

#### Scenario: Works
- **WHEN** invoked
- **THEN** works
`;

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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-lint-output-'));
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  return root;
}

async function writeLivingSpec(root: string, capability: string, content: string): Promise<void> {
  const dir = path.join(root, 'openspec', 'specs', capability);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'spec.md'), content, 'utf8');
}

interface ChangeHandle {
  readonly folderName: string;
  readonly taskPath: string;
}

/** Create a change whose proposal and task run the local verifier. */
async function createChange(
  root: string,
  title: string,
  options: { capability?: string; delta?: string } = {},
): Promise<ChangeHandle> {
  const spec = await createNewSpec(root, title);
  const proposalPath = path.join(spec.folderPath, 'proposal.md');
  const proposal = await fs.readFile(proposalPath, 'utf8');
  await fs.writeFile(proposalPath, proposal.replace(/^verify:.*$/m, `verify: ${VERIFY}`), 'utf8');

  const taskPath = path.join(spec.folderPath, 'tasks', '1.md');
  const task = await fs.readFile(taskPath, 'utf8');
  await fs.writeFile(taskPath, task.replace(/^verify:.*$/m, `verify: ${VERIFY}`), 'utf8');

  if (options.capability && options.delta) {
    const dir = path.join(spec.folderPath, 'specs', options.capability);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec.md'), options.delta, 'utf8');
  }

  return { folderName: spec.folderName, taskPath };
}

const PURPOSE = 'A capability purpose long enough to pass the fifty character briefness check.';

describe('lint output', () => {
  let root: string;

  beforeEach(async () => {
    root = await setupProject();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('prints an error and a warning with severity, file, and requirement', async () => {
    const change = await createChange(root, 'Output Lines', {
      capability: 'cap',
      delta: delta('cap', NO_SHALL_ADDED, PURPOSE),
    });
    const task = await fs.readFile(change.taskPath, 'utf8');
    await fs.writeFile(change.taskPath, task.replace(/^verify:.*$/m, 'verify: pnpm a && pnpm b'));

    const logger = createRecordingLogger();
    const exitCodes: number[] = [];
    await lintCommand([], {
      cwd: root,
      config: openSpecConfig(),
      logger,
      exit: (code) => exitCodes.push(code),
    });

    const errorLine = logger.entries.find(
      (entry) => entry.level === 'error' && entry.message.includes('chains commands'),
    );
    assert.ok(errorLine, JSON.stringify(logger.entries));
    assert.ok(errorLine.message.startsWith(`${change.folderName}: error `), errorLine.message);
    assert.ok(
      errorLine.message.includes(`openspec/changes/${change.folderName}/tasks/1.md`),
      errorLine.message,
    );

    const warningLine = logger.entries.find(
      (entry) => entry.level === 'warn' && entry.message.includes('No shall here'),
    );
    assert.ok(warningLine, JSON.stringify(logger.entries));
    assert.ok(
      warningLine.message.startsWith(`${change.folderName}: warning `),
      warningLine.message,
    );
    assert.ok(
      warningLine.message.includes(`openspec/changes/${change.folderName}/specs/cap/spec.md`),
      warningLine.message,
    );
    assert.ok(warningLine.message.includes('(No shall here)'), warningLine.message);

    assert.deepEqual(exitCodes, [1]);
  });

  it('carries the same fields in --json and prints no text lines', async () => {
    const change = await createChange(root, 'Json Output', {
      capability: 'cap',
      delta: delta('cap', NO_SHALL_ADDED, PURPOSE),
    });
    const task = await fs.readFile(change.taskPath, 'utf8');
    await fs.writeFile(change.taskPath, task.replace(/^verify:.*$/m, 'verify: pnpm a && pnpm b'));

    const logger = createRecordingLogger();
    const chunks: string[] = [];
    const exitCodes: number[] = [];
    await lintCommand([], {
      cwd: root,
      config: openSpecConfig(),
      logger,
      json: true,
      stdout: (text) => chunks.push(text),
      exit: (code) => exitCodes.push(code),
    });

    const stdout = chunks.join('');
    assert.ok(stdout.endsWith('\n'), stdout);
    const document = JSON.parse(stdout) as {
      valid: boolean;
      changes: Array<{
        change: string;
        valid: boolean;
        findings: Array<{
          severity: string;
          file: string;
          requirement: string | null;
          section: string | null;
          message: string;
        }>;
      }>;
      repository: unknown[];
    };

    assert.equal(document.valid, false);
    assert.equal(document.changes.length, 1);
    const changeDoc = document.changes[0];
    assert.equal(changeDoc.change, change.folderName);
    assert.equal(changeDoc.valid, false);

    const error = changeDoc.findings.find((finding) => finding.message.includes('chains commands'));
    assert.ok(error, JSON.stringify(changeDoc.findings));
    assert.equal(error.severity, 'error');
    assert.equal(error.file, `openspec/changes/${change.folderName}/tasks/1.md`);
    assert.equal(error.requirement, null);
    assert.equal(error.section, null);

    const warning = changeDoc.findings.find((finding) => finding.message.includes('No shall here'));
    assert.ok(warning, JSON.stringify(changeDoc.findings));
    assert.equal(warning.severity, 'warning');
    assert.equal(warning.file, `openspec/changes/${change.folderName}/specs/cap/spec.md`);
    assert.equal(warning.requirement, 'No shall here');
    assert.equal(warning.section, null);

    assert.deepEqual(logger.entries, []);
    assert.deepEqual(exitCodes, [1]);
  });

  it('prints one repository finding once after two changes and never exits', async () => {
    await writeLivingSpec(root, 'cap', LIVING_ONE_LONG);
    await createChange(root, 'First Clean', {
      capability: 'other',
      delta: delta('other', CLEAN_ADDED, PURPOSE),
    });
    await createChange(root, 'Second Clean', {
      capability: 'another',
      delta: delta('another', CLEAN_ADDED, PURPOSE),
    });

    const logger = createRecordingLogger();
    const exitCodes: number[] = [];
    const result = await lintCommand([], {
      cwd: root,
      config: openSpecConfig(),
      logger,
      exit: (code) => exitCodes.push(code),
    });

    assert.equal(result.valid, true, JSON.stringify(result.entries));
    assert.deepEqual(exitCodes, []);

    const headers = logger.entries.filter((entry) =>
      entry.message.includes('repository: findings about other changes and living specs'),
    );
    assert.equal(headers.length, 1, JSON.stringify(logger.entries));

    const repositoryLines = logger.entries.filter((entry) =>
      /^repository: (error|warning) /.test(entry.message),
    );
    assert.equal(repositoryLines.length, 1, JSON.stringify(logger.entries));
    const line = repositoryLines[0];
    assert.equal(line.level, 'warn');
    assert.ok(line.message.startsWith('repository: warning '), line.message);
    assert.ok(line.message.includes('openspec/specs/cap/spec.md'), line.message);
    assert.ok(line.message.includes('(First living behavior)'), line.message);
  });

  it('prints no repository header when there are no repository findings', async () => {
    await createChange(root, 'Solo Clean', {
      capability: 'other',
      delta: delta('other', CLEAN_ADDED, PURPOSE),
    });

    const logger = createRecordingLogger();
    await lintCommand([], { cwd: root, config: openSpecConfig(), logger });

    assert.equal(
      logger.entries.some((entry) => entry.message.includes('repository: findings about')),
      false,
      JSON.stringify(logger.entries),
    );
  });
});
