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
import type { LintFinding } from '../src/core/spec/lint-findings.js';
import { lintChangeFolder } from '../src/core/spec/linter.js';
import { installFakeValidator } from './helpers.js';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const OPENSPEC_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'openspec');
const VERIFY = 'node verify.cjs';
const UNSUPPORTED_SUFFIX =
  ' [unsupported by osq: osq does not honor skip_specs; add a delta spec under specs/<capability>/spec.md]';

const LONG_REQUIREMENT = `The system SHALL do a thing. ${'word '.repeat(120)}`;
const FIRST_LONG = LONG_REQUIREMENT;
const SECOND_LONG = `The system SHALL do another thing. ${'word '.repeat(120)}`;

const LIVING_TWO_LONG = `# cap Specification

## Purpose

A living capability used by this test with plenty of words for the length check.

## Requirements

### Requirement: First living behavior
${FIRST_LONG}

#### Scenario: Works
- **WHEN** invoked
- **THEN** works

### Requirement: Second living behavior
${SECOND_LONG}

#### Scenario: Works
- **WHEN** invoked
- **THEN** works again
`;

const LIVING_ONE_LONG = `# cap Specification

## Purpose

A living capability used by this test with plenty of words for the length check.

## Requirements

### Requirement: First living behavior
${FIRST_LONG}

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

interface RecordingLogger extends Pick<Logger, 'info' | 'verbose' | 'warn' | 'error'> {
  readonly entries: Array<{ level: string; message: string }>;
}

function createRecordingLogger(): RecordingLogger {
  const entries: RecordingLogger['entries'] = [];
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-lint-findings-'));
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
  readonly folderPath: string;
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

  return { folderPath: spec.folderPath, folderName: spec.folderName, taskPath };
}

function matching(findings: readonly LintFinding[], fragment: string): LintFinding {
  const found = findings.filter((finding) => finding.message.includes(fragment));
  assert.ok(found.length > 0, `no finding matched ${fragment}: ${JSON.stringify(findings)}`);
  return found[0];
}

describe('lint findings', () => {
  let root: string;

  beforeEach(async () => {
    root = await setupProject();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('reports a chained verify as an error finding with a file and null requirement', async () => {
    const change = await createChange(root, 'Chained Verify', {
      capability: 'other',
      delta: delta(
        'other',
        CLEAN_ADDED,
        'A capability purpose long enough to pass the fifty character briefness check.',
      ),
    });
    const task = await fs.readFile(change.taskPath, 'utf8');
    await fs.writeFile(change.taskPath, task.replace(/^verify:.*$/m, 'verify: pnpm a && pnpm b'));

    const result = await lintChangeFolder(root, change.folderPath, openSpecConfig());
    const finding = matching(result.findings, 'chains commands');

    assert.equal(finding.severity, 'error');
    assert.equal(finding.file, `openspec/changes/${change.folderName}/tasks/1.md`);
    assert.equal(finding.requirement, null);
    assert.equal(finding.section, null);
    assert.ok(
      result.errors.includes(
        'Task in 1.md verify chains commands ("pnpm a && pnpm b"); move the chain into a package script and name that script, for example pnpm run <script>',
      ),
      result.errors.join('\n'),
    );
  });

  it('reports a delta issue on the delta file with its requirement name', async () => {
    const change = await createChange(root, 'Delta Issue', {
      capability: 'cap',
      delta: delta('cap', NO_SHALL_ADDED, 'A capability with a long enough purpose here.'),
    });

    const result = await lintChangeFolder(root, change.folderPath, openSpecConfig());
    const finding = matching(result.findings, 'ADDED "No shall here"');

    assert.equal(finding.severity, 'warning');
    assert.equal(finding.file, `openspec/changes/${change.folderName}/specs/cap/spec.md`);
    assert.equal(finding.requirement, 'No shall here');
    assert.equal(finding.section, null);
  });

  it('reports a long living requirement as a repository finding that leaves the change valid', async () => {
    await writeLivingSpec(root, 'cap', LIVING_TWO_LONG);
    const change = await createChange(root, 'Clean Change', {
      capability: 'other',
      delta: delta(
        'other',
        CLEAN_ADDED,
        'A capability purpose long enough to pass the fifty character briefness check.',
      ),
    });

    const result = await lintChangeFolder(root, change.folderPath, openSpecConfig());

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(result.findings.length, 0, JSON.stringify(result.findings));
    const finding = result.repository.find(
      (entry) => entry.requirement === 'Second living behavior',
    );
    assert.ok(finding, JSON.stringify(result.repository));
    assert.equal(finding.severity, 'warning');
    assert.equal(finding.file, 'openspec/specs/cap/spec.md');
    assert.equal(finding.section, null);
    assert.equal(
      result.errors.some((error) => error.includes('Requirement text is very long')),
      false,
      result.errors.join('\n'),
    );
  });

  it('exits zero when a clean change faces a long living requirement', async () => {
    await writeLivingSpec(root, 'cap', LIVING_TWO_LONG);
    await createChange(root, 'Clean Change', {
      capability: 'other',
      delta: delta(
        'other',
        CLEAN_ADDED,
        'A capability purpose long enough to pass the fifty character briefness check.',
      ),
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
  });

  it("keeps another change's error out of the linted change", async () => {
    const change = await createChange(root, 'Main Change', {
      capability: 'other',
      delta: delta(
        'other',
        CLEAN_ADDED,
        'A capability purpose long enough to pass the fifty character briefness check.',
      ),
    });
    const broken = await createChange(root, 'Broken Other');

    const result = await lintChangeFolder(root, change.folderPath, openSpecConfig());

    assert.equal(result.valid, true, result.errors.join('\n'));
    const finding = result.repository.find((entry) => entry.severity === 'error');
    assert.ok(finding, JSON.stringify(result.repository));
    assert.equal(finding.file, `openspec/changes/${broken.folderName}/proposal.md`);
    assert.equal(
      result.findings.some((entry) => entry.message.includes('at least one delta')),
      false,
      JSON.stringify(result.findings),
    );
  });

  it("marks OpenSpec's skip_specs advice as unsupported", async () => {
    const change = await createChange(root, 'No Delta');

    const result = await lintChangeFolder(root, change.folderPath, openSpecConfig());
    const finding = matching(result.findings, 'skip_specs');

    assert.equal(finding.severity, 'error');
    assert.ok(finding.message.endsWith(UNSUPPORTED_SUFFIX), finding.message);
    assert.equal(finding.file, `openspec/changes/${change.folderName}/proposal.md`);
  });

  it('warns about a capability whose merged Purpose is too brief', async () => {
    const change = await createChange(root, 'Brief Purpose', {
      capability: 'newcap',
      delta: delta('newcap', CLEAN_ADDED, 'Brief'),
    });

    const result = await lintChangeFolder(root, change.folderPath, openSpecConfig());
    const finding = matching(result.findings, 'newcap after archive');

    assert.equal(
      finding.message,
      'openspec: newcap after archive: Purpose section is too brief (less than 50 characters)',
    );
    assert.equal(finding.severity, 'warning');
    assert.equal(finding.file, `openspec/changes/${change.folderName}/specs/newcap/spec.md`);
    assert.equal(finding.requirement, null);
    assert.equal(finding.section, 'Purpose');
  });

  it('leaves out an issue the living spec already carries', async () => {
    await writeLivingSpec(root, 'cap', LIVING_ONE_LONG);
    const change = await createChange(root, 'Inherited Warning', {
      capability: 'cap',
      delta: delta('cap', CLEAN_ADDED),
    });

    const result = await lintChangeFolder(root, change.folderPath, openSpecConfig());

    assert.equal(
      result.findings.some((entry) => entry.message.includes('cap after archive')),
      false,
      JSON.stringify(result.findings),
    );
    assert.ok(
      result.repository.some((entry) => entry.requirement === 'First living behavior'),
      JSON.stringify(result.repository),
    );
  });

  it('reports merge errors and runs no merged validation when no delta merges', async () => {
    const change = await createChange(root, 'No Merge', {
      capability: 'ghost',
      delta: delta(
        'ghost',
        `## MODIFIED Requirements

### Requirement: Nonexistent behavior
The system SHALL do something.

#### Scenario: Works
- **WHEN** invoked
- **THEN** works
`,
      ),
    });

    const result = await lintChangeFolder(root, change.folderPath, openSpecConfig());

    const merge = matching(result.findings, 'Cannot apply MODIFIED');
    assert.equal(merge.severity, 'error');
    assert.equal(merge.file, `openspec/changes/${change.folderName}/specs/ghost/spec.md`);
    assert.equal(
      result.findings.some((entry) => entry.message.includes('ghost after archive')),
      false,
      JSON.stringify(result.findings),
    );
  });
});
