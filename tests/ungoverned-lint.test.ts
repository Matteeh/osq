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

/** A project-local config with the given `ungoverned` list or the default. */
function lintConfig(ungoverned?: readonly string[], limits: Partial<OsqLimits> = {}): OsqConfig {
  const config = { ...DEFAULT_CONFIG, limits: { ...DEFAULT_CONFIG.limits, ...limits } };
  return ungoverned === undefined ? config : { ...config, ungoverned };
}

/** A disposable scaffolded project with the fake validator reachable locally. */
async function setupProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-ungoverned-lint-'));
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

/** A living capability spec with a behavior requirement and no Code ownership. */
function plainLivingSpec(capability: string): string {
  return `# ${capability} Specification

## Purpose

The ${capability} capability exists for this test with plenty of words to pass.

## Requirements

### Requirement: Living behavior
The system SHALL behave for ${capability}.

#### Scenario: Works
- **WHEN** invoked
- **THEN** works
`;
}

async function writeLivingSpec(root: string, capability: string, content: string): Promise<void> {
  const dir = path.join(root, 'openspec', 'specs', capability);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'spec.md'), content, 'utf8');
}

interface ChangeHandle {
  readonly folderPath: string;
  readonly folderName: string;
  readonly proposalPath: string;
  readonly taskPath: string;
}

/** Create a change with a local verify and no deltas. */
async function createChange(root: string, title: string): Promise<ChangeHandle> {
  const spec = await createNewSpec(root, title);
  const proposalPath = path.join(spec.folderPath, 'proposal.md');
  let proposal = await fs.readFile(proposalPath, 'utf8');
  proposal = proposal.replace(/^verify:.*$/m, `verify: ${VERIFY}`);
  proposal = proposal.replace(/reads: \[[^\]]*\]/, 'reads: []');
  await fs.writeFile(proposalPath, proposal, 'utf8');

  return {
    folderPath: spec.folderPath,
    folderName: spec.folderName,
    proposalPath,
    taskPath: path.join(spec.folderPath, 'tasks', '1.md'),
  };
}

/** Add a delta spec for one capability with the given raw content. */
async function writeDelta(
  change: ChangeHandle,
  capability: string,
  content: string,
): Promise<void> {
  const dir = path.join(change.folderPath, 'specs', capability);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'spec.md'), content, 'utf8');
}

/** Overwrite task 1 with the given scope and the local verify. */
async function writeTask(change: ChangeHandle, scope: readonly string[]): Promise<void> {
  const frontmatter = `title: Task 1\nverify: ${VERIFY}\nscope: [${scope.join(', ')}]\nentry: []\nskills: []`;
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

/** A delta that declares Code ownership with one source glob. */
function ownershipDelta(source: string): string {
  return `# Spec Delta: other

## ADDED Requirements

### Requirement: Code ownership
<!-- source: ${source} -->
The other capability SHALL own its files.
`;
}

/** A delta that adds a `Notice` requirement holding raw requirement text. */
function noticeDelta(text: string): string {
  return `# Spec Delta: other

## ADDED Requirements

### Requirement: Notice
${text}
`;
}

/** A living `other` requirement whose text names `NOTICE.md`. */
function removingLivingSpec(): string {
  return `# other Specification

## Purpose

The other capability exists for this test with plenty of words to pass.

## Requirements

### Requirement: Notice
The system SHALL read \`NOTICE.md\`.

#### Scenario: Reads
- **WHEN** invoked
- **THEN** it reads NOTICE.md
`;
}

describe('ungoverned lint', () => {
  let root: string;

  beforeEach(async () => {
    root = await setupProject();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('Write without delta', async () => {
    await writeFiles(root, {
      'src/cap/a.ts': 'export const a = 1;\n',
      'src/other/x.ts': 'export const x = 1;\n',
    });
    await writeLivingSpec(root, 'cap', livingSpec('cap', 'src/cap/**'));
    await writeLivingSpec(root, 'other', livingSpec('other', 'src/other/**'));
    const change = await createChange(root, 'Write Without Delta');
    await writeDelta(
      change,
      'cap',
      `# Spec Delta: cap

## ADDED Requirements

### Requirement: Added cap behavior
The system SHALL add behavior for cap.

#### Scenario: Added works
- **WHEN** invoked
- **THEN** works
`,
    );
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

  it('Ungoverned path written without delta', async () => {
    await writeFiles(root, {
      'src/cap/a.ts': 'export const a = 1;\n',
      'notes/a.md': '# Notes\n',
    });
    await writeLivingSpec(root, 'cap', livingSpec('cap', 'src/cap/**'));
    await writeLivingSpec(root, 'other', livingSpec('other', 'notes/**'));
    const change = await createChange(root, 'Ungoverned Write');
    await writeDelta(
      change,
      'cap',
      `# Spec Delta: cap

## ADDED Requirements

### Requirement: Added cap behavior
The system SHALL add behavior for cap.

#### Scenario: Added works
- **WHEN** invoked
- **THEN** works
`,
    );
    await writeTask(change, ['notes/a.md']);

    const result = await lintChangeFolder(root, change.folderPath, lintConfig(['notes/**']));

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(
      result.findings.some((finding) =>
        finding.message.includes('which has no delta in this change'),
      ),
      false,
      JSON.stringify(result.findings),
    );
  });

  it('One caller', async () => {
    const srcDir = path.resolve(import.meta.dirname, '..', 'src');
    const files: string[] = [];
    const walk = async (directory: string): Promise<void> => {
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
          files.push(path.relative(path.join(srcDir, '..'), full).split(path.sep).join('/'));
        }
      }
    };
    await walk(srcDir);

    const callers: string[] = [];
    for (const file of files) {
      const content = await fs.readFile(path.join(srcDir, '..', file), 'utf8');
      if (content.includes('parseCodeOwnership(')) callers.push(file);
    }

    assert.deepEqual(callers.sort(), [
      'src/core/spec/capability-impact.ts',
      'src/core/spec/parser.ts',
    ]);
  });

  const GLOB_ROWS = [
    { glob: 'notes/a.md', warning: true },
    { glob: 'notes/**', warning: true },
    { glob: 'NOTICE.md', warning: true },
    { glob: '**', warning: true },
    { glob: 'src/**', warning: false },
    { glob: 'src/notes/a.md', warning: false },
  ];

  for (const row of GLOB_ROWS) {
    it(`Delta ownership globs: ${row.glob}`, async () => {
      await writeLivingSpec(root, 'other', plainLivingSpec('other'));
      const change = await createChange(root, 'Delta Ownership Globs');
      await writeDelta(change, 'other', ownershipDelta(row.glob));
      await writeTask(change, ['verify.cjs']);

      const result = await lintChangeFolder(
        root,
        change.folderPath,
        lintConfig(['notes/**', 'NOTICE*']),
      );
      const ownershipFindings = result.findings.filter((finding) =>
        finding.message.includes('matches ungoverned paths'),
      );

      assert.equal(result.valid, true, result.errors.join('\n'));
      if (row.warning) {
        assert.equal(ownershipFindings.length, 1, JSON.stringify(ownershipFindings));
        const finding = ownershipFindings[0];
        assert.equal(finding.severity, 'warning');
        assert.equal(finding.file, `openspec/changes/${change.folderName}/specs/other/spec.md`);
        assert.equal(
          finding.message,
          `other Code ownership glob ${row.glob} matches ungoverned paths. Ungoverned files belong to no capability; drop the glob`,
        );
      } else {
        assert.deepEqual(ownershipFindings, []);
      }
    });
  }

  it('Living ownership is left alone', async () => {
    await writeFiles(root, { 'src/cap/a.ts': 'export const a = 1;\n' });
    await writeLivingSpec(root, 'other', livingSpec('other', 'notes/**'));
    await writeLivingSpec(root, 'cap', plainLivingSpec('cap'));
    const change = await createChange(root, 'Living Ownership');
    await writeDelta(
      change,
      'cap',
      `# Spec Delta: cap

## ADDED Requirements

### Requirement: Added cap behavior
The system SHALL add behavior for cap.

#### Scenario: Added works
- **WHEN** invoked
- **THEN** works
`,
    );
    await writeTask(change, ['src/cap/a.ts']);

    const result = await lintChangeFolder(root, change.folderPath, lintConfig(['notes/**']));

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(
      result.findings.some((finding) => finding.message.includes('matches ungoverned paths')),
      false,
      JSON.stringify(result.findings),
    );
  });

  const NAME_ROWS = [
    {
      text: 'The `NOTICE.md` SHALL list authors.',
      warning:
        'other requirement "Notice" names ungoverned files: NOTICE.md. Ungoverned files are not pinned by specs',
    },
    {
      text: 'The system SHALL write notes/a.md, then NOTICE.',
      warning:
        'other requirement "Notice" names ungoverned files: NOTICE, notes/a.md. Ungoverned files are not pinned by specs',
    },
    { text: 'The system SHALL skip `notes/**`.', warning: null },
    { text: 'The system SHALL write `src/notes/a.md`.', warning: null },
  ];

  for (const row of NAME_ROWS) {
    it(`Requirement text naming files: ${row.text}`, async () => {
      await writeLivingSpec(root, 'other', plainLivingSpec('other'));
      const change = await createChange(root, 'Requirement Text Naming Files');
      await writeDelta(change, 'other', noticeDelta(row.text));
      await writeTask(change, ['verify.cjs']);

      const result = await lintChangeFolder(
        root,
        change.folderPath,
        lintConfig(['notes/**', 'NOTICE*']),
      );
      const nameFindings = result.findings.filter((finding) =>
        finding.message.includes('names ungoverned files'),
      );

      assert.equal(result.valid, true, result.errors.join('\n'));
      if (row.warning !== null) {
        assert.equal(nameFindings.length, 1, JSON.stringify(nameFindings));
        const finding = nameFindings[0];
        assert.equal(finding.severity, 'warning');
        assert.equal(finding.file, `openspec/changes/${change.folderName}/specs/other/spec.md`);
        assert.equal(finding.requirement, 'Notice');
        assert.equal(finding.message, row.warning);
      } else {
        assert.deepEqual(nameFindings, []);
      }
    });
  }

  it('Removed requirement naming a file', async () => {
    await writeLivingSpec(root, 'other', removingLivingSpec());
    const change = await createChange(root, 'Removed Requirement Naming');
    await writeDelta(
      change,
      'other',
      `# Spec Delta: other

## REMOVED Requirements

### Requirement: Notice
`,
    );
    await writeTask(change, ['verify.cjs']);

    const result = await lintChangeFolder(root, change.folderPath, lintConfig(['NOTICE*']));

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(
      result.findings.some((finding) => finding.message.includes('names ungoverned files')),
      false,
      JSON.stringify(result.findings),
    );
  });

  it('Warnings never block', async () => {
    await writeLivingSpec(root, 'other', plainLivingSpec('other'));
    const change = await createChange(root, 'Warnings Never Block');
    await writeDelta(change, 'other', noticeDelta('The `NOTICE.md` SHALL list authors.'));
    await writeTask(change, ['verify.cjs']);

    const lines: string[] = [];
    const recorder = {
      info: (message: string) => lines.push(message),
      verbose: (_message: string) => {},
      warn: (message: string) => lines.push(message),
      error: (message: string) => lines.push(message),
    };

    const command = await lintCommand([change.folderName], {
      cwd: root,
      config: lintConfig(['NOTICE*']),
      logger: recorder,
    });

    assert.equal(command.valid, true);
    assert.ok(
      command.entries[0].result.findings.some((finding) =>
        finding.message.includes('names ungoverned files'),
      ),
      JSON.stringify(command.entries[0].result.findings),
    );
    assert.ok(
      lines.some((line) => line.includes('warning') && line.includes('names ungoverned files')),
      JSON.stringify(lines),
    );
    assert.ok(
      lines.some((line) => line.includes(`${change.folderName}: valid`)),
      JSON.stringify(lines),
    );
  });

  it('Everything governed', async () => {
    await writeLivingSpec(root, 'other', plainLivingSpec('other'));
    const change = await createChange(root, 'Everything Governed');
    await writeDelta(
      change,
      'other',
      `# Spec Delta: other

## ADDED Requirements

### Requirement: Code ownership
<!-- source: NOTICE.md -->
The other capability SHALL own its files.

### Requirement: Notice
The system SHALL read \`NOTICE.md\`.
`,
    );
    await writeTask(change, ['verify.cjs']);

    const result = await lintChangeFolder(root, change.folderPath, lintConfig([]));

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(
      result.findings.some(
        (finding) =>
          finding.message.includes('matches ungoverned paths') ||
          finding.message.includes('names ungoverned files'),
      ),
      false,
      JSON.stringify(result.findings),
    );
  });
});
