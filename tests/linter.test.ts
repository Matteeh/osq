import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createProgram } from '../src/cli/index.js';
import { lintCommand } from '../src/cli/lint.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import {
  type LintLogger,
  OPENSPEC_EXPECTED_VERSION,
  lintChangeFolder,
} from '../src/core/spec/linter.js';

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

const PASSING_VERIFY = 'node verify.cjs';
const PLACEHOLDER_VERIFY = 'node -e "process.exit(0)"';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

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
    // A real local verifier so the seeded template sentinel can be replaced
    // with a command that resolves inside the temporary project root.
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
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
    // `features.writes` is retired from the proposal schema; ensure the seed
    // document never carries it regardless of which template was copied.
    const seeded = await fs.readFile(specMdPath, 'utf8');
    const cleaned = seeded
      .replace(/^[ \t]*writes:[^\n]*\n/m, '')
      .replace(/^verify:[^\n]*$/m, `verify: ${PASSING_VERIFY}`);
    if (cleaned !== seeded) {
      await fs.writeFile(specMdPath, cleaned, 'utf8');
    }
    // The seeded task carries the same sentinel; swap it for the local verifier.
    const seededTaskPath = path.join(specFolder, 'tasks', '1.md');
    const seededTask = await fs.readFile(seededTaskPath, 'utf8').catch(() => null);
    if (seededTask !== null) {
      await fs.writeFile(
        seededTaskPath,
        seededTask.replace(/^verify:[^\n]*$/m, `verify: ${PASSING_VERIFY}`),
        'utf8',
      );
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

  it('rejects a proposal declaring features.writes in frontmatter', async () => {
    const specMdPath = path.join(specFolder, 'spec.md');
    const content = `---
title: Retired Writes Field
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
    assert.ok(result.errors.some((e) => e.includes('features.writes is no longer supported')));
  });

  it('rejects more than one table under Contract', async () => {
    const specMdPath = path.join(specFolder, 'spec.md');
    const content = `---
title: Two Tables
depends_on: []
features:
  reads: []
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

  it('accepts depends_on naming a change that lives in the rejected directory', async () => {
    await fs.mkdir(path.join(tmpDir, 'openspec', 'changes', 'rejected', '043-rejected'), {
      recursive: true,
    });
    const specMdPath = path.join(specFolder, 'spec.md');
    const content = `---
title: Rejected Dependency
depends_on: [043]
features:
  reads: []
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
verify: ${PASSING_VERIFY}
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

  it('permits task title containing " and " without warning', async () => {
    const taskPath = path.join(specFolder, 'tasks', '1.md');
    const content = `---
title: When order is cancelled and refund issued
verify: ${PASSING_VERIFY}
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] passes cleanly`;
    await fs.writeFile(taskPath, content);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(result.valid, true);
    assert.equal(
      result.warnings.some((w) => w.includes('contains " and "')),
      false,
    );
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

  it('rejects a proposal.md lacking a verify command', async () => {
    const specPath = path.join(specFolder, 'spec.md');
    const proposalPath = path.join(specFolder, 'proposal.md');
    const content = (await fs.readFile(specPath, 'utf8')).replace(/^verify:.*$/m, '');
    await fs.rm(specPath);
    await fs.writeFile(proposalPath, content, 'utf8');

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('verify command in frontmatter')));
  });

  it('accepts a proposal.md declaring a verify command', async () => {
    const specPath = path.join(specFolder, 'spec.md');
    const proposalPath = path.join(specFolder, 'proposal.md');
    const content = await fs.readFile(specPath, 'utf8');
    await fs.rm(specPath);
    await fs.writeFile(proposalPath, content, 'utf8');

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
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

  it('warns without failing when harness scope omits the event fixture folder', async () => {
    await fs.mkdir(path.join(tmpDir, 'src', 'harness'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'src', 'harness', 'mock.ts'), 'export {};\n', 'utf8');
    await writeTaskFile(
      specFolder,
      '1',
      `title: Harness scope\nverify: ${PASSING_VERIFY}\nscope: [src/harness/mock.ts]\nentry: []\nskills: []`,
    );

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.ok(
      result.warnings.some((w) => w.includes('tests/fixtures/events/')),
      result.warnings.join('\n'),
    );
  });

  it('does not warn when an exact fixture file covers the event fixtures', async () => {
    await fs.mkdir(path.join(tmpDir, 'src', 'harness'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'src', 'harness', 'mock.ts'), 'export {};\n', 'utf8');
    await fs.mkdir(path.join(tmpDir, 'tests', 'fixtures', 'events'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'tests', 'fixtures', 'events', 'verified.jsonl'),
      '{}\n',
      'utf8',
    );
    await writeTaskFile(
      specFolder,
      '1',
      `title: Harness scope\nverify: ${PASSING_VERIFY}\nscope: [src/harness/mock.ts, tests/fixtures/events/verified.jsonl]\nentry: []\nskills: []\ntests:\n  modify: true`,
    );

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(
      result.warnings.some((w) => w.includes('tests/fixtures/events/')),
      false,
      result.warnings.join('\n'),
    );
  });

  it('does not warn when a fixture directory declaration covers the event fixtures', async () => {
    await fs.mkdir(path.join(tmpDir, 'src', 'harness'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'src', 'harness', 'mock.ts'), 'export {};\n', 'utf8');
    await fs.mkdir(path.join(tmpDir, 'tests', 'fixtures', 'events'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'tests', 'fixtures', 'events', 'dead.jsonl'),
      '{}\n',
      'utf8',
    );
    await writeTaskFile(
      specFolder,
      '1',
      `title: Harness scope\nverify: ${PASSING_VERIFY}\nscope: [src/harness/mock.ts, tests/fixtures/events/]\nentry: []\nskills: []\ntests:\n  modify: true`,
    );

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(
      result.warnings.some((w) => w.includes('tests/fixtures/events/')),
      false,
      result.warnings.join('\n'),
    );
  });

  it('does not warn when a fixture glob declaration covers the event fixtures', async () => {
    await fs.mkdir(path.join(tmpDir, 'src', 'harness'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'src', 'harness', 'mock.ts'), 'export {};\n', 'utf8');
    await fs.mkdir(path.join(tmpDir, 'tests', 'fixtures', 'events'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'tests', 'fixtures', 'events', 'verified.jsonl'),
      '{}\n',
      'utf8',
    );
    await writeTaskFile(
      specFolder,
      '1',
      `title: Harness scope\nverify: ${PASSING_VERIFY}\nscope: [src/harness/mock.ts, tests/fixtures/events/**]\nentry: []\nskills: []\ntests:\n  modify: true`,
    );

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(
      result.warnings.some((w) => w.includes('tests/fixtures/events/')),
      false,
      result.warnings.join('\n'),
    );
  });

  it('emits one harness fixture warning per affected task in task order', async () => {
    await fs.mkdir(path.join(tmpDir, 'src', 'harness'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'src', 'harness', 'mock.ts'), 'export {};\n', 'utf8');
    await writeTaskFile(
      specFolder,
      '2',
      `title: Second\nverify: ${PASSING_VERIFY}\nscope: [src/harness/mock.ts]\nentry: []\nskills: []`,
    );
    await writeTaskFile(
      specFolder,
      '1',
      `title: First\nverify: ${PASSING_VERIFY}\nscope: [src/harness/mock.ts]\nentry: []\nskills: []`,
    );

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    const harnessWarnings = result.warnings.filter((w) => w.includes('tests/fixtures/events/'));
    assert.equal(harnessWarnings.length, 2, result.warnings.join('\n'));
    assert.ok(harnessWarnings[0].includes('Task in 1.md'));
    assert.ok(harnessWarnings[1].includes('Task in 2.md'));
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

  it('fails closed when no local openspec binary is installed', async () => {
    await fs.rm(path.join(tmpDir, 'node_modules'), { recursive: true, force: true });

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some(
        (error) =>
          error.includes('ADR 004') && error.includes('pnpm add -D @fission-ai/openspec@1.13.1'),
      ),
    );
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

  it('fails when the resolved OpenSpec version differs from the pin', async () => {
    await installFakeOpenSpec(tmpDir, { version: '1.12.0' });
    const logger = createRecordingLogger();

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG, { logger });

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some(
        (error) =>
          error.includes('1.12.0') &&
          error.includes('ADR 004') &&
          error.includes('pnpm add -D @fission-ai/openspec@1.13.1'),
      ),
    );
    assert.equal(result.warnings.length, 0);
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

  it('rejects an added delta requirement named with "Update"', async () => {
    await writeDelta(
      specFolder,
      'sample',
      `# Spec Delta: sample

## Purpose

Sample capability.

## ADDED Requirements

### Requirement: Update configuration loading
The system SHALL load configuration.

#### Scenario: Works
- **WHEN** invoked
- **THEN** works
`,
    );

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some(
        (e) =>
          e.startsWith('openspec:') &&
          e.includes('sample') &&
          e.includes('Update configuration loading') &&
          e.includes('instruction-shaped'),
      ),
      result.errors.join('\n'),
    );
  });

  it('rejects an added delta requirement named with "Document"', async () => {
    await writeDelta(
      specFolder,
      'sample',
      `# Spec Delta: sample

## Purpose

Sample capability.

## ADDED Requirements

### Requirement: Document release process
The system SHALL describe the release process.

#### Scenario: Works
- **WHEN** invoked
- **THEN** works
`,
    );

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some(
        (e) =>
          e.startsWith('openspec:') && e.includes('"document"') && e.includes('instruction-shaped'),
      ),
      result.errors.join('\n'),
    );
  });

  it('accepts a declarative added delta requirement with zero errors', async () => {
    await writeDelta(
      specFolder,
      'sample',
      `# Spec Delta: sample

## Purpose

Sample capability.

## ADDED Requirements

### Requirement: Configuration loading
The system SHALL load configuration.

#### Scenario: Works
- **WHEN** invoked
- **THEN** works
`,
    );

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(result.errors.length, 0);
  });

  it('rejects the template placeholder in a proposal verify', async () => {
    const specMdPath = path.join(specFolder, 'spec.md');
    const proposalPath = path.join(specFolder, 'proposal.md');
    const content = (await fs.readFile(specMdPath, 'utf8')).replace(
      /^verify:[^\n]*$/m,
      `verify: ${PLACEHOLDER_VERIFY}`,
    );
    await fs.rm(specMdPath);
    await fs.writeFile(proposalPath, content, 'utf8');

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.includes('proposal.md') && e.includes('final tree')),
      result.errors.join('\n'),
    );
  });

  it('rejects the template placeholder in a task verify with one message', async () => {
    await writeTaskFile(
      specFolder,
      '1',
      `title: Valid title\nverify: ${PLACEHOLDER_VERIFY}\nscope: []\nentry: []\nskills: []`,
    );

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    const placeholderErrors = result.errors.filter((e) => e.includes('final tree'));
    assert.equal(placeholderErrors.length, 1, result.errors.join('\n'));
    assert.ok(placeholderErrors[0].includes('Task in 1.md'));
  });

  it('rejects normalized placeholder equivalents', async () => {
    const variants = [
      'node   -e    "process.exit(0)"',
      "node -e 'process.exit(0)'",
      'node --eval "process.exit(0)"',
      'node -e "process.exit(0);"',
      "node  --eval  'process.exit(0);'",
    ];

    for (const variant of variants) {
      await writeTaskFile(
        specFolder,
        '1',
        `title: Valid title\nverify: ${variant}\nscope: []\nentry: []\nskills: []`,
      );
      const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);
      assert.equal(result.valid, false, variant);
      assert.ok(
        result.errors.some((e) => e.includes('final tree')),
        `${variant}: ${result.errors.join('\n')}`,
      );
    }
  });

  it('rejects package-script invocations whose script is absent', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'tmp', scripts: { test: 'node --test' } }),
      'utf8',
    );
    const forms: Array<[string, string]> = [
      ['pnpm build', 'build'],
      ['pnpm run deploy', 'deploy'],
      ['npm run release', 'release'],
      ['yarn package-lib', 'package-lib'],
      ['yarn run ship', 'ship'],
      ['bun run bundle', 'bundle'],
    ];

    for (const [command, script] of forms) {
      await writeTaskFile(
        specFolder,
        '1',
        `title: Valid title\nverify: ${command}\nscope: []\nentry: []\nskills: []`,
      );
      const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);
      assert.equal(result.valid, false, command);
      assert.ok(
        result.errors.some((e) => e.includes(`"${script}"`) && e.includes('package.json')),
        `${command}: ${result.errors.join('\n')}`,
      );
    }
  });

  it('accepts a present package script without a path warning', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'tmp', scripts: { verify: 'node verify.cjs' } }),
      'utf8',
    );
    await writeTaskFile(
      specFolder,
      '1',
      'title: Valid title\nverify: pnpm verify\nscope: []\nentry: []\nskills: []',
    );

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(
      result.warnings.some((w) => w.includes('names neither')),
      false,
      result.warnings.join('\n'),
    );
  });

  it('warns when a task verify names no path or package script', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'tmp', scripts: {} }),
      'utf8',
    );
    await writeTaskFile(
      specFolder,
      '1',
      'title: Valid title\nverify: mystery-runner --check\nscope: []\nentry: []\nskills: []',
    );

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.ok(
      result.warnings.some((w) => w.includes('Task in 1.md') && w.includes('mystery-runner')),
      result.warnings.join('\n'),
    );
  });

  it('warns when a proposal verify names no path or package script', async () => {
    const specMdPath = path.join(specFolder, 'spec.md');
    const proposalPath = path.join(specFolder, 'proposal.md');
    const content = (await fs.readFile(specMdPath, 'utf8')).replace(
      /^verify:[^\n]*$/m,
      'verify: mystery-runner --check',
    );
    await fs.rm(specMdPath);
    await fs.writeFile(proposalPath, content, 'utf8');

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.ok(
      result.warnings.some((w) => w.includes('proposal.md') && w.includes('mystery-runner')),
      result.warnings.join('\n'),
    );
  });

  it('does not warn when a verify names an existing repository path', async () => {
    await fs.mkdir(path.join(tmpDir, 'scripts'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'scripts', 'check.mjs'), 'process.exit(0);\n', 'utf8');
    await writeTaskFile(
      specFolder,
      '1',
      'title: Valid title\nverify: node scripts/check.mjs\nscope: []\nentry: []\nskills: []',
    );

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(result.warnings.length, 0, result.warnings.join('\n'));
  });

  it('accepts a path-shaped binary that exists', async () => {
    await fs.mkdir(path.join(tmpDir, 'bin'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'bin', 'verify.sh'), '#!/bin/sh\nexit 0\n', {
      mode: 0o755,
    });
    await writeTaskFile(
      specFolder,
      '1',
      'title: Valid title\nverify: bin/verify.sh\nscope: []\nentry: []\nskills: []',
    );

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(result.warnings.length, 0, result.warnings.join('\n'));
  });

  it('handles a missing or malformed root package manifest deterministically', async () => {
    await writeTaskFile(
      specFolder,
      '1',
      'title: Valid title\nverify: pnpm test\nscope: []\nentry: []\nskills: []',
    );

    const missing = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(missing.valid, false);
    assert.ok(missing.errors.some((e) => e.includes('"test"') && e.includes('package.json')));

    await fs.writeFile(path.join(tmpDir, 'package.json'), '{ not valid json', 'utf8');
    const malformed = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(malformed.valid, false);
    assert.ok(malformed.errors.some((e) => e.includes('"test"') && e.includes('package.json')));
  });

  it('retains the chaining diagnostic without reinterpreting it', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'tmp', scripts: {} }),
      'utf8',
    );
    await writeTaskFile(
      specFolder,
      '1',
      'title: Valid title\nverify: pnpm missing-a && pnpm missing-b\nscope: []\nentry: []\nskills: []',
    );

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('chains commands')));
    assert.equal(
      result.errors.some((e) => e.includes('that is not defined in the root package.json')),
      false,
      result.errors.join('\n'),
    );
  });

  it('keeps checked-in fixture verification local and free of the placeholder', async () => {
    const repoRoot = fileURLToPath(new URL('..', import.meta.url));
    const bases = [path.join(repoRoot, 'fixture'), path.join(repoRoot, 'tests', 'fixtures')];
    const violations: string[] = [];

    const visit = async (dir: string, base: string): Promise<void> => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await visit(full, base);
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith('.md')) {
          continue;
        }
        const content = await fs.readFile(full, 'utf8');
        if (!/^verify:/m.test(content)) {
          continue;
        }
        const rel = path.relative(repoRoot, full);
        if (content.includes(PLACEHOLDER_VERIFY)) {
          violations.push(`${rel} still uses the template placeholder`);
        }
        const rootName = path.relative(base, full).split(path.sep)[0];
        const fixtureRoot = path.join(base, rootName);
        const verifier = await fs
          .stat(path.join(fixtureRoot, 'verify.cjs'))
          .then(() => true)
          .catch(() => false);
        if (!verifier) {
          violations.push(`${rel} has no verify.cjs in ${path.relative(repoRoot, fixtureRoot)}`);
        }
      }
    };

    for (const base of bases) {
      await visit(base, base);
    }

    assert.deepEqual(violations, []);
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

  it('excludes a root plan-prompt.md from artifact scanning without changing findings', async () => {
    const baseline = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(baseline.valid, true, baseline.errors.join('\n'));

    // Prohibited control characters inside the transient prompt must not become
    // a lint finding, and no other diagnostic may shift.
    await fs.writeFile(path.join(specFolder, 'plan-prompt.md'), 'prompt\x07bytes', 'utf8');
    const withPrompt = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(withPrompt.valid, true, withPrompt.errors.join('\n'));
    assert.deepEqual(withPrompt.errors, baseline.errors);
    assert.deepEqual(withPrompt.warnings, baseline.warnings);
  });

  it('still scans and rejects a nested plan-prompt.md as authored content', async () => {
    const nested = path.join(specFolder, 'notes', 'plan-prompt.md');
    await fs.mkdir(path.dirname(nested), { recursive: true });
    await fs.writeFile(nested, 'authored\x07bytes', 'utf8');

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some(
        (error) => error.includes('notes/plan-prompt.md') && error.includes('control character'),
      ),
      result.errors.join('\n'),
    );
  });
});
