import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { lintCommand } from '../src/cli/lint.js';
import { DEFAULT_CONFIG, type OsqConfig, type OsqLimits } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import type { LintFinding } from '../src/core/spec/lint-findings.js';
import { lintChangeFolder } from '../src/core/spec/linter.js';
import { installFakeValidator } from './helpers.js';

const VERIFY = 'node verify.cjs';

/** A project-local config with every lint limit left at its default. */
function lintConfig(limits: Partial<OsqLimits> = {}): OsqConfig {
  return { ...DEFAULT_CONFIG, limits: { ...DEFAULT_CONFIG.limits, ...limits } };
}

const silentLogger = {
  info: (_message: string) => {},
  verbose: (_message: string) => {},
  warn: (_message: string) => {},
  error: (_message: string) => {},
};

/** A disposable scaffolded project with the fake validator reachable locally. */
async function setupProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-impact-lint-'));
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  return root;
}

/** Write every file in a `{ relativePath: content }` map. */
async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(root, relative);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf8');
  }
}

/** A living capability spec carrying a Code ownership block. */
function livingSpec(capability: string, source: string): string {
  return `# ${capability} Specification

## Purpose

The ${capability} capability exists for this test with plenty of words to pass.

## Requirements

### Requirement: Code ownership
<!-- source: ${source} -->
The ${capability} capability SHALL own its files.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for ${capability}
- **THEN** system maps the declared files to ${capability}

### Requirement: Living behavior
The system SHALL behave for ${capability}.

#### Scenario: Works
- **WHEN** invoked
- **THEN** works
`;
}

async function writeLivingSpec(root: string, capability: string, source: string): Promise<void> {
  const dir = path.join(root, 'openspec', 'specs', capability);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'spec.md'), livingSpec(capability, source), 'utf8');
}

function delta(capability: string): string {
  return `# Spec Delta: ${capability}

## ADDED Requirements

### Requirement: Added ${capability} behavior
The system SHALL add behavior for ${capability}.

#### Scenario: Works
- **WHEN** invoked
- **THEN** works
`;
}

interface ChangeHandle {
  readonly folderPath: string;
  readonly folderName: string;
  readonly proposalPath: string;
  readonly taskPath: string;
}

/** Create a change with a local verify and optional reads and deltas. */
async function createChange(
  root: string,
  title: string,
  options: { reads?: readonly string[]; deltas?: readonly string[] } = {},
): Promise<ChangeHandle> {
  const spec = await createNewSpec(root, title);
  const proposalPath = path.join(spec.folderPath, 'proposal.md');
  let proposal = await fs.readFile(proposalPath, 'utf8');
  proposal = proposal.replace(/^verify:.*$/m, `verify: ${VERIFY}`);
  proposal = proposal.replace(/reads: \[[^\]]*\]/, `reads: [${(options.reads ?? []).join(', ')}]`);
  await fs.writeFile(proposalPath, proposal, 'utf8');

  for (const capability of options.deltas ?? []) {
    const dir = path.join(spec.folderPath, 'specs', capability);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec.md'), delta(capability), 'utf8');
  }

  return {
    folderPath: spec.folderPath,
    folderName: spec.folderName,
    proposalPath,
    taskPath: path.join(spec.folderPath, 'tasks', '1.md'),
  };
}

/** Replace one change's declared reads in place. */
async function setReads(change: ChangeHandle, reads: readonly string[]): Promise<void> {
  const proposal = await fs.readFile(change.proposalPath, 'utf8');
  await fs.writeFile(
    change.proposalPath,
    proposal.replace(/reads: \[[^\]]*\]/, `reads: [${reads.join(', ')}]`),
    'utf8',
  );
}

/** Overwrite task 1 with the given scope, verify, and tests.modify state. */
async function writeTask(
  change: ChangeHandle,
  scope: readonly string[],
  options: { testsModify?: boolean; verify?: string } = {},
): Promise<void> {
  const testsLine = options.testsModify ? '\ntests:\n  modify: true' : '';
  const frontmatter = `title: Task 1\nverify: ${options.verify ?? VERIFY}\nscope: [${scope.join(', ')}]\nentry: []\nskills: []${testsLine}`;
  await fs.writeFile(
    change.taskPath,
    `---\n${frontmatter}\n---\n## Acceptance\n- [ ] passes cleanly\n`,
    'utf8',
  );
}

function matching(findings: readonly LintFinding[], fragment: string): LintFinding {
  const found = findings.filter((finding) => finding.message.includes(fragment));
  assert.ok(found.length > 0, `no finding matched ${fragment}: ${JSON.stringify(findings)}`);
  return found[0];
}

describe('impact lint', () => {
  let root: string;

  beforeEach(async () => {
    root = await setupProject();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('warns on a task whose scope a test reaches two levels away', async () => {
    await writeFiles(root, {
      'src/c.ts': 'export const c = 1;\n',
      'src/b.ts': "import { c } from './c.js';\n",
      'tests/a.test.ts': "import { b } from '../src/b.js';\n",
    });
    await writeLivingSpec(root, 'cap', 'src/c.ts');
    const change = await createChange(root, 'Frozen Reach', { deltas: ['cap'] });
    await writeTask(change, ['src/c.ts']);

    const result = await lintChangeFolder(root, change.folderPath, lintConfig());
    const finding = matching(result.findings, 'preexisting tests');

    assert.equal(finding.severity, 'warning');
    assert.equal(finding.file, `openspec/changes/${change.folderName}/tasks/1.md`);
    assert.equal(finding.requirement, null);
    assert.equal(finding.section, null);
    assert.equal(
      finding.message,
      'Task 1 scope is imported by 1 preexisting tests that no task may modify, 0 directly: tests/a.test.ts (src/c.ts). Add each test the task will change to its scope with tests.modify: true',
    );
    assert.equal(result.valid, true, result.errors.join('\n'));
  });

  it('leaves out a test a task declares for modification', async () => {
    await writeFiles(root, {
      'src/c.ts': 'export const c = 1;\n',
      'src/b.ts': "import { c } from './c.js';\n",
      'tests/a.test.ts': "import { b } from '../src/b.js';\n",
    });
    await writeLivingSpec(root, 'cap', 'src/c.ts');
    const change = await createChange(root, 'Declared Test', { deltas: ['cap'] });
    await writeTask(change, ['src/c.ts', 'tests/a.test.ts'], { testsModify: true });

    const result = await lintChangeFolder(root, change.folderPath, lintConfig());

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(
      result.findings.some((finding) => finding.message.includes('preexisting tests')),
      false,
      JSON.stringify(result.findings),
    );
  });

  it('names a directly imported test and leaves out the more suffix', async () => {
    await writeFiles(root, {
      'src/c.ts': 'export const c = 1;\n',
      'tests/direct.test.ts': "import { c } from '../src/c.js';\n",
    });
    await writeLivingSpec(root, 'cap', 'src/c.ts');
    const change = await createChange(root, 'Short List', { deltas: ['cap'] });
    await writeTask(change, ['src/c.ts']);

    const result = await lintChangeFolder(root, change.folderPath, lintConfig());
    const finding = matching(result.findings, 'preexisting tests');

    assert.equal(
      finding.message,
      'Task 1 scope is imported by 1 preexisting tests that no task may modify, 1 directly: tests/direct.test.ts (src/c.ts). Add each test the task will change to its scope with tests.modify: true',
    );
    assert.equal(finding.message.includes(' more'), false);
  });

  it('caps the listed importers with maxListedImporters and counts the rest', async () => {
    await writeFiles(root, {
      'src/c.ts': 'export const c = 1;\n',
      'tests/t1.test.ts': "import { c } from '../src/c.js';\n",
      'tests/t2.test.ts': "import { c } from '../src/c.js';\n",
      'tests/t3.test.ts': "import { c } from '../src/c.js';\n",
    });
    await writeLivingSpec(root, 'cap', 'src/c.ts');
    const change = await createChange(root, 'Capped List', { deltas: ['cap'] });
    await writeTask(change, ['src/c.ts']);

    const result = await lintChangeFolder(
      root,
      change.folderPath,
      lintConfig({ maxListedImporters: 1 }),
    );
    const finding = matching(result.findings, 'preexisting tests');

    assert.equal(
      finding.message,
      'Task 1 scope is imported by 3 preexisting tests that no task may modify, 3 directly: tests/t1.test.ts (src/c.ts) and 2 more. Add each test the task will change to its scope with tests.modify: true',
    );
  });

  it('follows a deeper reach when importGraphDepth is raised', async () => {
    await writeFiles(root, {
      'src/l3.ts': 'export const l3 = 1;\n',
      'src/l2.ts': "import { l3 } from './l3.js';\n",
      'src/l1.ts': "import { l2 } from './l2.js';\n",
      'tests/deep.test.ts': "import { l1 } from '../src/l1.js';\n",
    });
    await writeLivingSpec(root, 'cap', 'src/l3.ts');
    const change = await createChange(root, 'Deeper Reach', { deltas: ['cap'] });
    await writeTask(change, ['src/l3.ts']);

    const shallow = await lintChangeFolder(root, change.folderPath, lintConfig());
    assert.equal(
      shallow.findings.some((finding) => finding.message.includes('preexisting tests')),
      false,
      JSON.stringify(shallow.findings),
    );

    const deep = await lintChangeFolder(
      root,
      change.folderPath,
      lintConfig({ importGraphDepth: 3 }),
    );
    const finding = matching(deep.findings, 'preexisting tests');
    assert.equal(
      finding.message,
      'Task 1 scope is imported by 1 preexisting tests that no task may modify, 0 directly: tests/deep.test.ts (src/l3.ts). Add each test the task will change to its scope with tests.modify: true',
    );
  });

  it('warns about a capability a scoped file imports without declaring it', async () => {
    await writeFiles(root, {
      'src/cap/a.ts': "import { x } from '../other/x.js';\n",
      'src/other/x.ts': 'export const x = 1;\n',
    });
    await writeLivingSpec(root, 'cap', 'src/cap/**');
    await writeLivingSpec(root, 'other', 'src/other/**');
    const change = await createChange(root, 'Undeclared Read', { deltas: ['cap'] });
    await writeTask(change, ['src/cap/a.ts']);

    const result = await lintChangeFolder(root, change.folderPath, lintConfig());
    const finding = matching(result.findings, 'features.reads');

    assert.equal(finding.severity, 'warning');
    assert.equal(finding.file, `openspec/changes/${change.folderName}/proposal.md`);
    assert.equal(finding.requirement, null);
    assert.equal(finding.section, null);
    assert.ok(finding.message.includes('other'), finding.message);
    assert.ok(finding.message.includes('src/cap/a.ts'), finding.message);

    await setReads(change, ['other']);
    const cleared = await lintChangeFolder(root, change.folderPath, lintConfig());
    assert.equal(
      cleared.findings.some((entry) => entry.message.includes('features.reads')),
      false,
      JSON.stringify(cleared.findings),
    );
  });

  it('warns about a resolved scope path whose owners have no delta', async () => {
    await writeFiles(root, {
      'src/cap/a.ts': 'export const a = 1;\n',
      'src/other/x.ts': 'export const x = 1;\n',
    });
    await writeLivingSpec(root, 'cap', 'src/cap/**');
    await writeLivingSpec(root, 'other', 'src/other/**');
    const change = await createChange(root, 'Write Without Delta', { deltas: ['cap'] });
    await writeTask(change, ['src/other/x.ts']);

    const result = await lintChangeFolder(root, change.folderPath, lintConfig());
    const finding = matching(result.findings, 'which has no delta in this change');

    assert.equal(finding.severity, 'warning');
    assert.equal(finding.file, `openspec/changes/${change.folderName}/tasks/1.md`);
    assert.equal(
      finding.message,
      'src/other/x.ts is owned by other, which has no delta in this change. Add a delta or move the file out of scope',
    );
    assert.equal(result.valid, true, result.errors.join('\n'));
  });

  it('warns when a verify names only tests that reach nothing in scope', async () => {
    await writeFiles(root, {
      'src/cap/a.ts': 'export const a = 1;\n',
      'tests/b.test.ts': "import './helpers.js';\n",
      'tests/helpers.ts': 'export const helper = 1;\n',
    });
    await writeLivingSpec(root, 'cap', 'src/cap/**');
    const change = await createChange(root, 'Verify Elsewhere', { deltas: ['cap'] });
    await writeTask(change, ['src/cap/a.ts'], {
      verify: 'node --import tsx --test tests/b.test.ts',
    });

    const result = await lintChangeFolder(root, change.folderPath, lintConfig());
    const finding = matching(result.findings, "imports a file in the task's scope");

    assert.equal(finding.severity, 'warning');
    assert.equal(finding.file, `openspec/changes/${change.folderName}/tasks/1.md`);
    assert.equal(
      finding.message,
      "Task 1 verify runs tests/b.test.ts but none of them imports a file in the task's scope",
    );
  });

  it('does not warn when the verify test reaches the task scope', async () => {
    await writeFiles(root, {
      'src/cap/a.ts': 'export const a = 1;\n',
      'src/cap/b.ts': "import { a } from './a.js';\n",
      'tests/b.test.ts': "import { b } from '../src/cap/b.js';\n",
    });
    await writeLivingSpec(root, 'cap', 'src/cap/**');
    const change = await createChange(root, 'Verify In Scope', { deltas: ['cap'] });
    await writeTask(change, ['src/cap/a.ts'], {
      verify: 'node --import tsx --test tests/b.test.ts',
    });

    const result = await lintChangeFolder(root, change.folderPath, lintConfig());

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(
      result.findings.some((finding) =>
        finding.message.includes("imports a file in the task's scope"),
      ),
      false,
      JSON.stringify(result.findings),
    );
  });

  it('stays silent and valid in a Python-only repository', async () => {
    await writeFiles(root, { 'app/main.py': 'print(1)\n' });
    const change = await createChange(root, 'Python Only');
    await writeTask(change, ['app/main.py']);

    const exits: number[] = [];
    const command = await lintCommand([], {
      cwd: root,
      config: lintConfig(),
      logger: silentLogger,
      exit: (code) => exits.push(code),
    });

    assert.equal(command.valid, true, JSON.stringify(command.entries));
    assert.deepEqual(exits, []);
    const findings = command.entries.flatMap((entry) => [...entry.result.findings]);
    assert.deepEqual(findings, []);
  });

  it('lints every change with one graph built for the run', async () => {
    await writeFiles(root, {
      'src/c.ts': 'export const c = 1;\n',
      'src/d.ts': 'export const d = 1;\n',
      'tests/a.test.ts': "import { c } from '../src/c.js';\n",
      'tests/e.test.ts': "import { d } from '../src/d.js';\n",
    });
    await writeLivingSpec(root, 'cap', 'src/c.ts, src/d.ts');
    const first = await createChange(root, 'First Change', { deltas: ['cap'] });
    await writeTask(first, ['src/c.ts']);
    const second = await createChange(root, 'Second Change', { deltas: ['cap'] });
    await writeTask(second, ['src/d.ts']);

    const command = await lintCommand([], {
      cwd: root,
      config: lintConfig(),
      logger: silentLogger,
      exit: () => {},
    });

    assert.equal(command.valid, true, JSON.stringify(command.entries));
    assert.equal(command.entries.length, 2);
    for (const entry of command.entries) {
      assert.ok(
        entry.result.findings.some((finding) => finding.message.includes('preexisting tests')),
        JSON.stringify(entry.result.findings),
      );
    }
  });
});
