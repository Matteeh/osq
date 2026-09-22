import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import {
  DeltaMergeError,
  mergeDelta,
  parseCapabilitySpec,
  parseDelta,
  parseRequirement,
  parseScenario,
  serializeCapabilitySpec,
} from '../src/core/spec/delta.js';
import { applyOpenSpecDeltas } from '../src/watcher/archiver.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHANGE_FOLDER_NAME = '017-ownership-and-test-gating';
const LIVING_SPEC_ROOT = path.join(REPO_ROOT, 'openspec', 'specs');

/**
 * Resolves the 017 delta specs whether the change is still active or has been
 * archived, so the suite keeps passing once the watcher moves the folder.
 */
async function resolveDeltaRoot(): Promise<string> {
  const candidates = [
    path.join(REPO_ROOT, 'openspec', 'changes', CHANGE_FOLDER_NAME, 'specs'),
    path.join(REPO_ROOT, 'openspec', 'changes', 'archive', CHANGE_FOLDER_NAME, 'specs'),
  ];
  for (const candidate of candidates) {
    const exists = await fs
      .stat(candidate)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      return candidate;
    }
  }
  throw new Error(`Unable to locate delta specs for ${CHANGE_FOLDER_NAME}`);
}

/**
 * Declared code ownership globs per capability. Mirrors the `<!-- source: ... -->`
 * comment and Scenario THEN bullet of each change delta spec.
 */
const OWNED_CAPABILITIES: Readonly<Record<string, readonly string[]>> = {
  'cli-foundation': [
    'src/cli/**',
    'src/core/config.ts',
    'src/core/init.ts',
    'src/core/logger.ts',
    'templates/**',
    'osq.config.ts',
  ],
  'metrics-and-reporting': ['src/core/report.ts', 'src/cli/report.ts'],
  'spec-lint-and-approve': [
    'src/core/parser.ts',
    'src/core/linter.ts',
    'src/core/approve.ts',
    'src/core/hasher.ts',
    'src/core/delta.ts',
    'src/core/migrate.ts',
    'src/cli/lint.ts',
    'src/cli/migrate.ts',
  ],
  'status-inspection': ['src/core/status.ts', 'src/core/show.ts', 'src/core/state.ts'],
  'watcher-and-harness': ['src/watcher/**', 'src/harness/**', 'src/core/lock.ts'],
};

const CAPABILITIES = Object.keys(OWNED_CAPABILITIES);

async function readCapabilityDelta(capability: string): Promise<string> {
  const deltaRoot = await resolveDeltaRoot();
  return fs.readFile(path.join(deltaRoot, capability, 'spec.md'), 'utf8');
}

function stripOwnership(content: string): string {
  const parsed = parseCapabilitySpec(content);
  return serializeCapabilitySpec({
    ...parsed,
    requirements: parsed.requirements.filter(
      (requirement) => requirement.name !== 'Code ownership',
    ),
  });
}

async function readLivingSpec(capability: string): Promise<string> {
  const content = await fs.readFile(path.join(LIVING_SPEC_ROOT, capability, 'spec.md'), 'utf8');
  return stripOwnership(content);
}

const INITIAL_DELTA = `# Spec Delta: cli-foundation

## Purpose

Provides CLI behavior for the golden rebuild test.

## ADDED Requirements

### Requirement: Alpha
The system SHALL provide alpha.

#### Scenario: Alpha runs
- **WHEN** alpha invoked
- **THEN** alpha responds

### Requirement: Beta
The system SHALL provide beta.

#### Scenario: Beta runs
- **WHEN** beta invoked
- **THEN** beta responds

### Requirement: Gamma
The system SHALL provide gamma.

#### Scenario: Gamma runs
- **WHEN** gamma invoked
- **THEN** gamma responds
`;

const ALL_OPERATIONS_DELTA = `# Spec Delta: cli-foundation

## Purpose

Should not replace the existing base purpose.

## RENAMED Requirements

- FROM: \`Alpha\`
- TO: \`Alpha Renamed\`

## REMOVED Requirements

### Requirement: Gamma

#### Scenario: Gamma runs
- **WHEN** gamma invoked
- **THEN** gamma responds

## MODIFIED Requirements

### Requirement: Beta
The system SHALL provide beta v2.

#### Scenario: Beta runs
- **WHEN** beta invoked again
- **THEN** beta responds twice

## ADDED Requirements

### Requirement: Delta
The system SHALL provide delta.

#### Scenario: Delta runs
- **WHEN** delta invoked
- **THEN** delta responds
`;

const GOLDEN_SPEC = `# cli-foundation Specification

## Purpose

Provides CLI behavior for the golden rebuild test.

## Requirements

### Requirement: Alpha Renamed
The system SHALL provide alpha.

#### Scenario: Alpha runs
- **WHEN** alpha invoked
- **THEN** alpha responds

### Requirement: Beta
The system SHALL provide beta v2.

#### Scenario: Beta runs
- **WHEN** beta invoked again
- **THEN** beta responds twice

### Requirement: Delta
The system SHALL provide delta.

#### Scenario: Delta runs
- **WHEN** delta invoked
- **THEN** delta responds
`;

describe('Delta merge engine', () => {
  it('parseDelta extracts ADDED, MODIFIED, REMOVED, and RENAMED blocks', () => {
    const delta = parseDelta(ALL_OPERATIONS_DELTA);

    assert.equal(delta.title, 'cli-foundation');
    assert.equal(delta.purpose, 'Should not replace the existing base purpose.');

    assert.deepEqual(
      delta.added.map((requirement) => requirement.name),
      ['Delta'],
    );
    assert.deepEqual(
      delta.modified.map((requirement) => requirement.name),
      ['Beta'],
    );
    assert.deepEqual(
      delta.removed.map((requirement) => requirement.name),
      ['Gamma'],
    );
    assert.deepEqual(delta.renamed, [{ from: 'Alpha', to: 'Alpha Renamed' }]);
  });

  it('parseDelta returns empty operations for a delta with no requirement sections', () => {
    const delta = parseDelta('# Spec Delta: empty\n\n## Purpose\n\nNothing yet.\n');

    assert.equal(delta.title, 'empty');
    assert.equal(delta.purpose, 'Nothing yet.');
    assert.deepEqual(delta.added, []);
    assert.deepEqual(delta.modified, []);
    assert.deepEqual(delta.removed, []);
    assert.deepEqual(delta.renamed, []);
  });

  it('requirement parser extracts requirement names and scenario WHEN/THEN bullets', () => {
    const delta = parseDelta(INITIAL_DELTA);
    const alpha = parseRequirement(delta.added[0].raw);

    assert.equal(alpha.name, 'Alpha');
    assert.equal(alpha.body, 'The system SHALL provide alpha.');
    assert.equal(alpha.scenarios.length, 1);
    assert.equal(alpha.scenarios[0].name, 'Alpha runs');
    assert.deepEqual(alpha.scenarios[0].when, ['alpha invoked']);
    assert.deepEqual(alpha.scenarios[0].then, ['alpha responds']);

    const scenario = parseScenario(
      [
        '#### Scenario: Multiple bullets',
        '- **WHEN** first condition',
        '- **WHEN** second condition',
        '- **THEN** first outcome',
        '- **THEN** second outcome',
      ].join('\n'),
    );
    assert.equal(scenario.name, 'Multiple bullets');
    assert.deepEqual(scenario.when, ['first condition', 'second condition']);
    assert.deepEqual(scenario.then, ['first outcome', 'second outcome']);
  });

  it('merges operations in strict RENAMED -> REMOVED -> MODIFIED -> ADDED sequence', () => {
    const base = mergeDelta(null, 'cli-foundation', parseDelta(INITIAL_DELTA));
    const merged = mergeDelta(base, 'cli-foundation', parseDelta(ALL_OPERATIONS_DELTA));
    const parsed = parseCapabilitySpec(merged);

    assert.deepEqual(
      parsed.requirements.map((requirement) => requirement.name),
      ['Alpha Renamed', 'Beta', 'Delta'],
    );

    const beta = parsed.requirements.find((requirement) => requirement.name === 'Beta');
    assert.ok(beta);
    assert.equal(beta.body, 'The system SHALL provide beta v2.');
    assert.deepEqual(beta.scenarios[0].when, ['beta invoked again']);

    // Base purpose is retained; delta purpose does not overwrite it.
    assert.equal(parsed.purpose, 'Provides CLI behavior for the golden rebuild test.');
  });

  it('applies RENAMED before REMOVED and MODIFIED', () => {
    const base = mergeDelta(null, 'cap', parseDelta(INITIAL_DELTA));

    const removeAfterRename = `# Spec Delta: cap

## RENAMED Requirements

- FROM: \`Alpha\`
- TO: \`Alpha Two\`

## REMOVED Requirements

### Requirement: Alpha Two

#### Scenario: Alpha Two runs
- **WHEN** alpha invoked
- **THEN** alpha responds
`;
    const afterRemove = parseCapabilitySpec(mergeDelta(base, 'cap', parseDelta(removeAfterRename)));
    assert.ok(!afterRemove.requirements.some((requirement) => requirement.name === 'Alpha Two'));

    const modifyAfterRename = `# Spec Delta: cap

## RENAMED Requirements

- FROM: \`Alpha\`
- TO: \`Alpha Two\`

## MODIFIED Requirements

### Requirement: Alpha Two
The system SHALL provide alpha v2.

#### Scenario: Alpha Two runs
- **WHEN** alpha invoked twice
- **THEN** alpha responds twice
`;
    const afterModify = parseCapabilitySpec(mergeDelta(base, 'cap', parseDelta(modifyAfterRename)));
    const renamed = afterModify.requirements.find(
      (requirement) => requirement.name === 'Alpha Two',
    );
    assert.ok(renamed);
    assert.equal(renamed.body, 'The system SHALL provide alpha v2.');
  });

  it('throws a deterministic error when a MODIFIED target is missing', () => {
    const base = mergeDelta(null, 'cap', parseDelta(INITIAL_DELTA));
    const missing = `# Spec Delta: cap

## MODIFIED Requirements

### Requirement: Does Not Exist
The system SHALL not exist.

#### Scenario: Never
- **WHEN** never
- **THEN** never
`;

    assert.throws(
      () => mergeDelta(base, 'cap', parseDelta(missing)),
      (error: unknown) => {
        assert.ok(error instanceof DeltaMergeError);
        assert.equal(
          error.message,
          'Cannot apply MODIFIED: requirement "Does Not Exist" not found in base spec',
        );
        return true;
      },
    );
  });

  it('throws a deterministic error when a REMOVED target is missing', () => {
    const base = mergeDelta(null, 'cap', parseDelta(INITIAL_DELTA));
    const missing = `# Spec Delta: cap

## REMOVED Requirements

### Requirement: Does Not Exist

#### Scenario: Never
- **WHEN** never
- **THEN** never
`;

    assert.throws(
      () => mergeDelta(base, 'cap', parseDelta(missing)),
      (error: unknown) => {
        assert.ok(error instanceof DeltaMergeError);
        assert.equal(
          error.message,
          'Cannot apply REMOVED: requirement "Does Not Exist" not found in base spec',
        );
        return true;
      },
    );
  });

  it('creates a new capability spec from the delta Purpose when no base exists', () => {
    const merged = mergeDelta(null, 'new-capability', parseDelta(INITIAL_DELTA));
    const parsed = parseCapabilitySpec(merged);

    assert.equal(parsed.title, 'new-capability Specification');
    assert.equal(parsed.purpose, 'Provides CLI behavior for the golden rebuild test.');
    assert.deepEqual(
      parsed.requirements.map((requirement) => requirement.name),
      ['Alpha', 'Beta', 'Gamma'],
    );
    assert.equal(parsed.requirements[0].body, 'The system SHALL provide alpha.');
  });

  it('golden-file test asserts byte-for-byte exact rebuilding across all four operations', () => {
    const base = mergeDelta(null, 'cli-foundation', parseDelta(INITIAL_DELTA));
    const rebuilt = mergeDelta(base, 'cli-foundation', parseDelta(ALL_OPERATIONS_DELTA));

    assert.equal(rebuilt, GOLDEN_SPEC);

    // Re-parsing and re-serializing an untouched spec is stable (exact round trip).
    const reparsed = mergeDelta(
      rebuilt,
      'cli-foundation',
      parseDelta('# Spec Delta: cli-foundation\n\n## Purpose\n\nIgnored.\n'),
    );
    assert.equal(reparsed, GOLDEN_SPEC);
  });
});

describe('Archiver OpenSpec delta application', () => {
  let tmpDir: string;
  let changeFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-delta-merge-'));
    changeFolder = path.join(tmpDir, 'specs', '100-sample');
    await fs.mkdir(path.join(changeFolder, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(changeFolder, 'spec.md'), '# placeholder\n', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeDelta(content: string): Promise<void> {
    const capabilityDir = path.join(changeFolder, 'specs', 'cli-foundation');
    await fs.mkdir(capabilityDir, { recursive: true });
    await fs.writeFile(path.join(capabilityDir, 'spec.md'), content, 'utf8');
  }

  it('applyOpenSpecDeltas creates and then updates capability specs from delta specs', async () => {
    await writeDelta(INITIAL_DELTA);
    await applyOpenSpecDeltas(tmpDir, changeFolder, DEFAULT_CONFIG);

    const targetPath = path.join(tmpDir, 'openspec', 'specs', 'cli-foundation', 'spec.md');
    const created = await fs.readFile(targetPath, 'utf8');
    assert.equal(created, mergeDelta(null, 'cli-foundation', parseDelta(INITIAL_DELTA)));

    await writeDelta(ALL_OPERATIONS_DELTA);
    await applyOpenSpecDeltas(tmpDir, changeFolder, DEFAULT_CONFIG);

    const updated = await fs.readFile(targetPath, 'utf8');
    assert.equal(updated, GOLDEN_SPEC);
  });

  it('applyOpenSpecDeltas ignores change folders without OpenSpec delta specs', async () => {
    await applyOpenSpecDeltas(tmpDir, changeFolder, DEFAULT_CONFIG);

    const specsDir = path.join(tmpDir, 'openspec', 'specs');
    const exists = await fs
      .stat(specsDir)
      .then(() => true)
      .catch(() => false);
    assert.equal(exists, false);
  });
});

describe('Baseline living capability code ownership', () => {
  it('parses all five capability delta specs without syntax errors', async () => {
    for (const capability of CAPABILITIES) {
      const delta = parseDelta(await readCapabilityDelta(capability));

      assert.ok(delta.added.length > 0, `${capability} delta has no ADDED requirements`);

      const ownership = delta.added.find((requirement) => requirement.name === 'Code ownership');
      assert.ok(ownership, `${capability} delta is missing the Code ownership requirement`);
      assert.ok(
        ownership.body.includes('<!-- source:'),
        `${capability} Code ownership block lacks a source glob comment`,
      );
      assert.equal(ownership.scenarios.length, 1);
      assert.equal(ownership.scenarios[0].name, 'Codebase ownership boundaries');

      // Every parsed requirement round-trips through the parser unchanged.
      for (const requirement of delta.added) {
        const reparsed = parseRequirement(requirement.raw);
        assert.equal(reparsed.name, requirement.name);
        assert.equal(reparsed.body, requirement.body);
        assert.deepEqual(reparsed.scenarios, requirement.scenarios);
      }
    }
  });

  it('cleanly appends the Code ownership requirement to a base spec with existing requirements', () => {
    const base = `# sample Specification

## Purpose

Existing purpose.

## Requirements

### Requirement: Existing
The system SHALL exist.

#### Scenario: Runs
- **WHEN** run
- **THEN** exists
`;

    const delta = parseDelta(`# Spec Delta: sample

## ADDED Requirements

### Requirement: Code ownership
<!-- source: src/core/sample.ts -->
The sample capability SHALL own sample code.

#### Scenario: Codebase ownership boundaries
- **WHEN** ownership is resolved for sample
- **THEN** system maps \`src/core/sample.ts\` to sample
`);

    const parsed = parseCapabilitySpec(mergeDelta(base, 'sample', delta));

    assert.equal(parsed.purpose, 'Existing purpose.');
    assert.deepEqual(
      parsed.requirements.map((requirement) => requirement.name),
      ['Existing', 'Code ownership'],
    );
  });

  it('deterministically merges each delta into a valid spec containing the ownership globs', async () => {
    for (const capability of CAPABILITIES) {
      const deltaContent = await readCapabilityDelta(capability);
      const baseContent = await readLivingSpec(capability);
      const delta = parseDelta(deltaContent);

      const first = mergeDelta(baseContent, capability, delta);
      const second = mergeDelta(baseContent, capability, parseDelta(deltaContent));
      assert.equal(first, second, `${capability} merge is not deterministic`);

      const parsed = parseCapabilitySpec(first);
      assert.equal(parsed.title, parseCapabilitySpec(baseContent).title);

      const ownership = parsed.requirements.find(
        (requirement) => requirement.name === 'Code ownership',
      );
      assert.ok(ownership, `${capability} merged spec lacks Code ownership`);

      for (const glob of OWNED_CAPABILITIES[capability]) {
        assert.ok(ownership.raw.includes(glob), `${capability} ownership is missing ${glob}`);
      }

      // The ADDED block survives the merge byte-for-byte.
      const deltaOwnership = delta.added.find(
        (requirement) => requirement.name === 'Code ownership',
      );
      assert.ok(deltaOwnership);
      assert.equal(ownership.raw, deltaOwnership.raw);
    }
  });

  it('applies all five deltas into a living OpenSpec root declaring Code ownership', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-baseline-ownership-'));
    try {
      const changeFolder = path.join(tmpDir, 'openspec', 'changes', '100-baseline');
      const deltaRoot = await resolveDeltaRoot();

      for (const capability of CAPABILITIES) {
        const deltaDir = path.join(changeFolder, 'specs', capability);
        await fs.mkdir(deltaDir, { recursive: true });
        await fs.copyFile(
          path.join(deltaRoot, capability, 'spec.md'),
          path.join(deltaDir, 'spec.md'),
        );

        const livingDir = path.join(tmpDir, 'openspec', 'specs', capability);
        await fs.mkdir(livingDir, { recursive: true });
        await fs.writeFile(
          path.join(livingDir, 'spec.md'),
          await readLivingSpec(capability),
          'utf8',
        );
      }

      await applyOpenSpecDeltas(tmpDir, changeFolder, DEFAULT_CONFIG);

      for (const capability of CAPABILITIES) {
        const content = await fs.readFile(
          path.join(tmpDir, 'openspec', 'specs', capability, 'spec.md'),
          'utf8',
        );
        const parsed = parseCapabilitySpec(content);
        const ownership = parsed.requirements.find(
          (requirement) => requirement.name === 'Code ownership',
        );
        assert.ok(ownership, `${capability} living spec lacks Code ownership`);

        for (const glob of OWNED_CAPABILITIES[capability]) {
          assert.ok(ownership.raw.includes(glob), `${capability} living spec is missing ${glob}`);
        }
      }
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
