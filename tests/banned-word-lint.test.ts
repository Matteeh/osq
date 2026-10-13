import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { lintCommand } from '../src/cli/lint.js';
import type { BannedWord } from '../src/core/foundation/config-banned-words.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import type { LintFinding } from '../src/core/spec/lint-findings.js';
import { lintChangeFolder } from '../src/core/spec/linter.js';
import { installFakeValidator } from './helpers.js';

const VERIFY = 'node verify.cjs';

/** The ban every scenario of the two requirements describes. */
const LEGACY_BAN: readonly BannedWord[] = [{ word: 'legacy', paths: ['src/**'] }];

/** A project-local config with the given `bannedWords` list. */
function bannedConfig(bannedWords: readonly BannedWord[]): OsqConfig {
  return { ...DEFAULT_CONFIG, bannedWords };
}

/** A disposable scaffolded project with the fake validator reachable locally. */
async function setupProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-banned-word-lint-'));
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  return root;
}

interface ChangeHandle {
  readonly folderPath: string;
  readonly folderName: string;
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
    taskPath: path.join(spec.folderPath, 'tasks', '1.md'),
  };
}

/** Overwrite task 1 with the given scope and body. */
async function writeTask(
  change: ChangeHandle,
  scope: readonly string[],
  body: string,
): Promise<void> {
  const frontmatter = `title: Task 1\nverify: ${VERIFY}\nscope: [${scope.join(', ')}]\nentry: []\nskills: []`;
  await fs.writeFile(
    change.taskPath,
    `---\n${frontmatter}\n---\n## Acceptance\n- [ ] passes cleanly\n\n${body}\n`,
    'utf8',
  );
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

/** The banned word warnings for one file of the change, in order. */
function warningsOn(
  findings: readonly LintFinding[],
  change: ChangeHandle,
  relativePath: string,
): string[] {
  return findings
    .filter(
      (finding) =>
        finding.file === `openspec/changes/${change.folderName}/${relativePath}` &&
        finding.message.startsWith('Banned word'),
    )
    .map((finding) => finding.message);
}

/** A delta whose one scenario line quotes a mode name. */
function quotedDelta(): string {
  return `# Spec Delta: other

## ADDED Requirements

### Requirement: Prints a mode
The system SHALL print the mode.

#### Scenario: Prints
- **WHEN** invoked
- **THEN** it prints "legacy mode"
`;
}

describe('banned word lint', () => {
  let root: string;

  beforeEach(async () => {
    root = await setupProject();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const TEXT_ROWS: ReadonlyArray<{ line: string; warnings: string[] }> = [
    {
      line: 'Set `legacyMode` to false.',
      warnings: [
        'Banned word "legacy" in "legacyMode": bannedWords[0] bans it in src/**; name it another way',
      ],
    },
    {
      line: 'Print `Mode: LEGACY (old)`.',
      warnings: [
        'Banned word "legacy" in "Mode: LEGACY (old)": bannedWords[0] bans it in src/**; name it another way',
      ],
    },
    {
      line: 'Run `tests/legacy-free.test.ts`.',
      warnings: [],
    },
    {
      line: 'Remove `src/legacy.ts`.',
      warnings: [
        'Banned word "legacy" in "src/legacy.ts": bannedWords[0] bans it in src/**; name it another way',
      ],
    },
    {
      line: 'Drop the legacy flag.',
      warnings: [],
    },
  ];

  for (const row of TEXT_ROWS) {
    it(`Texts that hold a banned word: ${row.line}`, async () => {
      const change = await createChange(root, 'Texts Hold Banned Word');
      await writeTask(change, ['src/a.ts'], row.line);

      const result = await lintChangeFolder(root, change.folderPath, bannedConfig(LEGACY_BAN));

      assert.equal(result.valid, true, result.errors.join('\n'));
      assert.deepEqual(warningsOn(result.findings, change, 'tasks/1.md'), row.warnings);
    });
  }

  it('Fenced code and scenario quotes', async () => {
    const change = await createChange(root, 'Fenced Code And Quotes');
    const body = ['Some prose.', '', '```', "type Mode = 'legacy' | 'new';", '```'].join('\n');
    await writeTask(change, ['src/**'], body);
    await writeDelta(change, 'other', quotedDelta());

    const result = await lintChangeFolder(root, change.folderPath, bannedConfig(LEGACY_BAN));

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.deepEqual(warningsOn(result.findings, change, 'tasks/1.md'), [
      'Banned word "legacy" in "type Mode = \'legacy\' | \'new\';": bannedWords[0] bans it in src/**; name it another way',
    ]);
    assert.deepEqual(warningsOn(result.findings, change, 'specs/other/spec.md'), [
      'Banned word "legacy" in "legacy mode": bannedWords[0] bans it in src/**; name it another way',
    ]);
  });

  it('Scope that misses the ban', async () => {
    const change = await createChange(root, 'Scope Misses The Ban');
    await writeTask(change, ['tests/a.test.ts'], 'Set `legacyMode` to false.');
    await writeDelta(
      change,
      'other',
      `# Spec Delta: other

## ADDED Requirements

### Requirement: Sets a mode
The system SHALL set \`legacyMode\` when asked.
`,
    );

    const result = await lintChangeFolder(root, change.folderPath, bannedConfig(LEGACY_BAN));

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.deepEqual(warningsOn(result.findings, change, 'tasks/1.md'), []);
    assert.deepEqual(warningsOn(result.findings, change, 'specs/other/spec.md'), []);
  });

  it('A glob scope that reaches the ban', async () => {
    const change = await createChange(root, 'Glob Scope Reaches The Ban');
    await writeTask(change, ['src/**'], 'Set `legacyMode` to false.');

    const result = await lintChangeFolder(
      root,
      change.folderPath,
      bannedConfig([{ word: 'legacy', paths: ['src/core/**'] }]),
    );

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.deepEqual(warningsOn(result.findings, change, 'tasks/1.md'), [
      'Banned word "legacy" in "legacyMode": bannedWords[0] bans it in src/core/**; name it another way',
    ]);
  });

  it('Banned word warnings never block', async () => {
    const change = await createChange(root, 'Banned Word Never Blocks');
    await writeTask(change, ['src/a.ts'], 'Set `legacyMode` to false.');

    const lines: string[] = [];
    const recorder = {
      info: (message: string) => lines.push(message),
      verbose: (_message: string) => {},
      warn: (message: string) => lines.push(message),
      error: (message: string) => lines.push(message),
    };

    const command = await lintCommand([change.folderName], {
      cwd: root,
      config: bannedConfig(LEGACY_BAN),
      logger: recorder,
    });

    assert.equal(command.valid, true);
    assert.ok(
      command.entries[0].result.findings.some((finding) =>
        finding.message.includes('Banned word "legacy" in "legacyMode"'),
      ),
      JSON.stringify(command.entries[0].result.findings),
    );
    assert.ok(
      lines.some(
        (line) => line.includes('warning') && line.includes('Banned word "legacy" in "legacyMode"'),
      ),
      JSON.stringify(lines),
    );
    assert.ok(
      lines.some((line) => line.includes(`${change.folderName}: valid`)),
      JSON.stringify(lines),
    );
  });
});
