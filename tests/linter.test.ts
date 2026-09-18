import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createProgram } from '../src/cli/index.js';
import { lintCommand } from '../src/cli/lint.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import {
  type LintLogger,
  OPENSPEC_EXPECTED_VERSION,
  lintChangeFolder,
} from '../src/core/linter.js';
import { createNewSpec } from '../src/core/new.js';

const RECORD_FILE = 'openspec-invocations.json';

interface RecordedInvocation {
  readonly args: string[];
  readonly telemetry?: string;
  readonly cwd: string;
}

interface FakeOpenSpecOptions {
  readonly stdout?: string;
  readonly exitCode?: number;
  readonly version?: string;
}

interface RecordingLogger extends LintLogger {
  readonly entries: Array<{ level: 'info' | 'verbose' | 'warn' | 'error'; message: string }>;
  error(message: string): void;
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

async function installFakeOpenSpec(
  projectRoot: string,
  options: FakeOpenSpecOptions = {},
): Promise<string> {
  const binDir = path.join(projectRoot, 'node_modules', '.bin');
  await fs.mkdir(binDir, { recursive: true });

  const recordPath = path.join(projectRoot, RECORD_FILE);
  const stdout = options.stdout ?? JSON.stringify({ valid: true, issues: [] });
  const exitCode = options.exitCode ?? 0;

  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const recordPath = ${JSON.stringify(recordPath)};
const args = process.argv.slice(2);
let records = [];
try { records = JSON.parse(fs.readFileSync(recordPath, 'utf8')); } catch {}
records.push({ args, telemetry: process.env.OPENSPEC_TELEMETRY, cwd: process.cwd() });
fs.writeFileSync(recordPath, JSON.stringify(records));
process.stdout.write(${JSON.stringify(stdout)});
process.exit(${exitCode});
`;
  await fs.writeFile(path.join(binDir, 'openspec'), script, { mode: 0o755 });

  const manifestDir = path.join(projectRoot, 'node_modules', '@fission-ai', 'openspec');
  await fs.mkdir(manifestDir, { recursive: true });
  await fs.writeFile(
    path.join(manifestDir, 'package.json'),
    JSON.stringify({
      name: '@fission-ai/openspec',
      version: options.version ?? OPENSPEC_EXPECTED_VERSION,
    }),
    'utf8',
  );

  return recordPath;
}

async function readInvocations(projectRoot: string): Promise<RecordedInvocation[]> {
  try {
    const raw = await fs.readFile(path.join(projectRoot, RECORD_FILE), 'utf8');
    return JSON.parse(raw) as RecordedInvocation[];
  } catch {
    return [];
  }
}

async function writeDelta(specFolder: string, capability: string, content: string): Promise<void> {
  const dir = path.join(specFolder, 'specs', capability);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'spec.md'), content, 'utf8');
}

async function writeTaskFile(
  specFolder: string,
  taskNumber: string,
  frontmatter: string,
  acceptance = '- [ ] passes cleanly',
): Promise<void> {
  const taskPath = path.join(specFolder, 'tasks', `${taskNumber}.md`);
  await fs.writeFile(taskPath, `---\n${frontmatter}\n---\n## Acceptance\n${acceptance}\n`);
}

const PASSING_VERIFY = 'node -e "process.exit(0)"';

const MODIFIED_DELTA = `# Spec Delta: sample

## Purpose

Sample capability.

## MODIFIED Requirements

### Requirement: Existing behavior
The system SHALL behave.

#### Scenario: Works
- **WHEN** invoked
- **THEN** works
`;

const ADDED_DELTA = `# Spec Delta: sample

## Purpose

Sample capability.

## ADDED Requirements

### Requirement: New behavior
The system SHALL do something new.

#### Scenario: Works
- **WHEN** invoked
- **THEN** works
`;

const BASE_SPEC = `# sample Specification

## Purpose

Sample capability.

## Requirements

### Requirement: Existing behavior
The system SHALL behave.

#### Scenario: Works
- **WHEN** invoked
- **THEN** works
`;

describe('Spec Linter', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-lint-test-'));
    await scaffoldProject(tmpDir);
    // `createNewSpec` seeds from `specs/_template`, but the configured change
    // root is `openspec/changes`; relocate so directory scans resolve it.
    const spec = await createNewSpec(tmpDir, 'Test Feature');
    specFolder = spec.folderPath;
    const proposalPath = path.join(specFolder, 'proposal.md');
    const specMdPath = path.join(specFolder, 'spec.md');
    if (
      await fs
        .stat(proposalPath)
        .then(() => true)
        .catch(() => false)
    ) {
      const content = await fs.readFile(proposalPath, 'utf8');
      await fs.writeFile(specMdPath, content, 'utf8');
      await fs.rm(proposalPath, { force: true });
    }
    await installFakeOpenSpec(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('passes a clean, compliant spec', async () => {
    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('rejects features.writes with more than maxFeatureWrites entries', async () => {
    const specMdPath = path.join(specFolder, 'spec.md');
    const content = `---
title: Over Limit
depends_on: []
features:
  reads: []
  writes: [one, two, three]
---
## Goal
Goal
## Contract
| A | B |
|---|---|
| 1 | 2 |
## Non-goals
None
## Delta
Updated docs.`;
    await fs.writeFile(specMdPath, content);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('features.writes')));
  });

  it('rejects more than one table under Contract', async () => {
    const specMdPath = path.join(specFolder, 'spec.md');
    const content = `---
title: Two Tables
depends_on: []
features:
  reads: []
  writes: []
---
## Goal
Goal
## Contract
| A | B |
|---|---|
| 1 | 2 |

| C | D |
|---|---|
| 3 | 4 |
## Non-goals
None
## Delta
None`;
    await fs.writeFile(specMdPath, content);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Contract has')));
  });

  it('rejects verify command that chains commands', async () => {
    const taskPath = path.join(specFolder, 'tasks', '1.md');
    const content = `---
title: When condition, action
verify: pnpm test && pnpm lint
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] passes cleanly`;
    await fs.writeFile(taskPath, content);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('chains commands')));
  });

  it('rejects depends_on naming a missing change', async () => {
    const specMdPath = path.join(specFolder, 'spec.md');
    const content = `---
title: Bad Dependency
depends_on: [999]
features:
  reads: []
  writes: []
---
## Goal
Goal
## Contract
| A | B |
|---|---|
| 1 | 2 |
## Non-goals
None
## Delta
None`;
    await fs.writeFile(specMdPath, content);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('missing change: 999')));
  });

  it('accepts depends_on naming a change that lives in the archive', async () => {
    await fs.mkdir(path.join(tmpDir, 'openspec', 'changes', 'archive', '042-archived'), {
      recursive: true,
    });
    const specMdPath = path.join(specFolder, 'spec.md');
    const content = `---
title: Archived Dependency
depends_on: [042]
features:
  reads: []
  writes: []
---
## Goal
Goal
## Contract
| A | B |
|---|---|
| 1 | 2 |
## Non-goals
None
## Delta
None`;
    await fs.writeFile(specMdPath, content);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true);
    assert.equal(
      result.errors.some((e) => e.includes('missing change')),
      false,
    );
  });

  it('rejects acceptance checklist longer than maxAcceptanceLines', async () => {
    const taskPath = path.join(specFolder, 'tasks', '1.md');
    const items = Array.from({ length: 8 }, (_, i) => `- [ ] item ${i + 1}`).join('\n');
    const content = `---
title: Too many acceptance lines
verify: pnpm test
scope: []
entry: []
skills: []
---
## Acceptance
${items}`;
    await fs.writeFile(taskPath, content);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('acceptance lines')));
  });

  it('rejects empty Delta when features.writes is non-empty', async () => {
    const specMdPath = path.join(specFolder, 'spec.md');
    const content = `---
title: Missing Delta
depends_on: []
features:
  reads: []
  writes: [feature-a]
---
## Goal
Goal
## Contract
| A | B |
|---|---|
| 1 | 2 |
## Non-goals
None
## Delta
`;
    await fs.writeFile(specMdPath, content);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Delta is empty')));
  });

  it('warns when task title contains " and "', async () => {
    const taskPath = path.join(specFolder, 'tasks', '1.md');
    const content = `---
title: When order is cancelled and refund issued
verify: pnpm test
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] passes cleanly`;
    await fs.writeFile(taskPath, content);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((w) => w.includes('contains " and "')));
  });

  it('resolves proposal.md as the change document when spec.md is absent', async () => {
    const specPath = path.join(specFolder, 'spec.md');
    const proposalPath = path.join(specFolder, 'proposal.md');
    const content = await fs.readFile(specPath, 'utf8');
    await fs.rm(specPath);
    await fs.writeFile(proposalPath, content, 'utf8');

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('rejects a change folder missing both proposal.md and spec.md', async () => {
    await fs.rm(path.join(specFolder, 'spec.md'));

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('proposal.md')));
  });

  it('rejects a non-boolean nested tests.modify declaration', async () => {
    await writeTaskFile(
      specFolder,
      '1',
      `title: Valid title\nverify: ${PASSING_VERIFY}\nscope: []\nentry: []\nskills: []\ntests:\n  modify: "yes"`,
    );

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('tests.modify')));
  });

  it('rejects a non-boolean flat tests.modify declaration', async () => {
    await writeTaskFile(
      specFolder,
      '1',
      `title: Valid title\nverify: ${PASSING_VERIFY}\nscope: []\nentry: []\nskills: []\ntests.modify: maybe`,
    );

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('tests.modify')));
  });

  it('accepts a boolean nested tests.modify declaration', async () => {
    await writeTaskFile(
      specFolder,
      '1',
      `title: Valid title\nverify: ${PASSING_VERIFY}\nscope: []\nentry: []\nskills: []\ntests:\n  modify: true`,
    );

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('rejects scope touching an existing test file without tests.modify', async () => {
    await fs.mkdir(path.join(tmpDir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'tests', 'existing.test.ts'), '// existing\n');
    await writeTaskFile(
      specFolder,
      '1',
      `title: Valid title\nverify: ${PASSING_VERIFY}\nscope: [tests/existing.test.ts]\nentry: []\nskills: []`,
    );

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.includes('tests.modify') && e.includes('existing.test.ts')),
    );
  });

  it('rejects a tests/** scope matching an existing test file without tests.modify', async () => {
    await fs.mkdir(path.join(tmpDir, 'tests', 'nested'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'tests', 'nested', 'deep.test.ts'), '// existing\n');
    await writeTaskFile(
      specFolder,
      '1',
      `title: Valid title\nverify: ${PASSING_VERIFY}\nscope: [tests/**]\nentry: []\nskills: []`,
    );

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('tests.modify')));
  });

  it('passes a scope touching existing test files when tests.modify is true', async () => {
    await fs.mkdir(path.join(tmpDir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'tests', 'existing.test.ts'), '// existing\n');
    await writeTaskFile(
      specFolder,
      '1',
      `title: Valid title\nverify: ${PASSING_VERIFY}\nscope: [tests/**]\nentry: []\nskills: []\ntests:\n  modify: true`,
    );

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('permits scope naming a new test file that does not exist yet', async () => {
    await writeTaskFile(
      specFolder,
      '1',
      `title: Valid title\nverify: ${PASSING_VERIFY}\nscope: [tests/brand-new.test.ts]\nentry: []\nskills: []`,
    );

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('executes local openspec validate for changes and specs under OPENSPEC_TELEMETRY=0', async () => {
    await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    const invocations = await readInvocations(tmpDir);
    assert.equal(invocations.length, 2);
    assert.deepEqual(invocations[0].args, [
      'validate',
      '--changes',
      '--strict',
      '--json',
      '--no-interactive',
    ]);
    assert.deepEqual(invocations[1].args, [
      'validate',
      '--specs',
      '--strict',
      '--json',
      '--no-interactive',
    ]);
    assert.equal(invocations[0].telemetry, '0');
    assert.equal(invocations[1].telemetry, '0');
    assert.equal(invocations[0].cwd, tmpDir);
  });

  it('does not run openspec when no local binary is installed', async () => {
    await fs.rm(path.join(tmpDir, 'node_modules'), { recursive: true, force: true });

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true);
    assert.equal((await readInvocations(tmpDir)).length, 0);
  });

  it('parses JSON validation failures and prefixes them with openspec:', async () => {
    await installFakeOpenSpec(tmpDir, {
      stdout: JSON.stringify({
        valid: false,
        issues: [{ severity: 'error', message: 'Missing Purpose section' }],
      }),
      exitCode: 1,
    });

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e === 'openspec: Missing Purpose section'));
  });

  it('logs the resolved OpenSpec version and does not warn when it matches the pin', async () => {
    const logger = createRecordingLogger();

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG, { logger });

    assert.ok(
      logger.entries.some(
        (entry) => entry.level === 'info' && entry.message.includes(OPENSPEC_EXPECTED_VERSION),
      ),
    );
    assert.equal(logger.entries.filter((entry) => entry.level === 'warn').length, 0);
    assert.equal(result.warnings.length, 0);
  });

  it('warns once when the resolved OpenSpec version differs from the pin', async () => {
    await installFakeOpenSpec(tmpDir, { version: '1.12.0' });
    const logger = createRecordingLogger();

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG, { logger });

    const warnings = logger.entries.filter(
      (entry) => entry.level === 'warn' && entry.message.includes('1.12.0'),
    );
    assert.equal(warnings.length, 1);
    assert.equal(result.valid, true);
    assert.equal(result.warnings.filter((w) => w.includes('1.12.0')).length, 1);
  });

  it('verifies delta target existence against base specs', async () => {
    await writeDelta(specFolder, 'sample', MODIFIED_DELTA);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.startsWith('openspec:') && e.includes('Existing behavior')),
    );
  });

  it('accepts a delta whose modified requirement exists in the base spec', async () => {
    const baseDir = path.join(tmpDir, 'openspec', 'specs', 'sample');
    await fs.mkdir(baseDir, { recursive: true });
    await fs.writeFile(path.join(baseDir, 'spec.md'), BASE_SPEC, 'utf8');
    await writeDelta(specFolder, 'sample', MODIFIED_DELTA);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('accepts an added-only delta for a capability with no base spec', async () => {
    await writeDelta(specFolder, 'brand-new', ADDED_DELTA);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('registers the lint command in the CLI', () => {
    const program = createProgram();
    const commandNames = program.commands.map((cmd) => cmd.name());

    assert.ok(commandNames.includes('lint'));
    const lintCmd = program.commands.find((cmd) => cmd.name() === 'lint');
    assert.ok(lintCmd);
    assert.equal(lintCmd.registeredArguments[0].name(), 'ids');
    assert.equal(lintCmd.registeredArguments[0].variadic, true);
  });

  it('lint command exits non-zero when a change folder fails lint', async () => {
    const taskPath = path.join(specFolder, 'tasks', '1.md');
    await fs.writeFile(
      taskPath,
      `---
title: Broken task
verify: pnpm test && pnpm lint
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] fails`,
    );

    const exitCodes: number[] = [];
    const result = await lintCommand(['001'], {
      cwd: tmpDir,
      config: DEFAULT_CONFIG,
      logger: createRecordingLogger(),
      exit: (code) => exitCodes.push(code),
    });

    assert.equal(result.valid, false);
    assert.deepEqual(exitCodes, [1]);
  });

  it('lint command exits zero when all change folders are valid', async () => {
    const exitCodes: number[] = [];
    const result = await lintCommand(['001'], {
      cwd: tmpDir,
      config: DEFAULT_CONFIG,
      logger: createRecordingLogger(),
      exit: (code) => exitCodes.push(code),
    });

    assert.equal(result.valid, true);
    assert.deepEqual(exitCodes, []);
  });
});
