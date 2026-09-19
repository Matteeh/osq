import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  parseCodeOwnership,
  parseFrontmatter,
  parseSpecMd,
  parseSpecMdFromFolder,
  parseTaskList,
  parseTaskMd,
  resolveChangeDoc,
} from '../src/core/parser.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('Spec and Task Parser', () => {
  it('parseFrontmatter extracts YAML metadata and markdown content', () => {
    const raw = `---
title: Sample Title
count: 42
---
# Body Heading
Some text here.`;

    const { data, body } = parseFrontmatter(raw);
    assert.equal(data.title, 'Sample Title');
    assert.equal(data.count, 42);
    assert.ok(body.includes('# Body Heading'));
  });

  it('parseSpecMd extracts title, depends_on, reads, and markdown sections', () => {
    const raw = `---
title: Order Cancellation
depends_on: [001, 002]
features:
  reads: [inventory]
  writes: [orders, states]
---
## Goal
Cancel orders cleanly.

## Contract
| Event | Action |
|---|---|
| cancel | release inventory |

## Non-goals
Refund handling.

## Delta
Modify orders feature doc.`;

    const spec = parseSpecMd(raw);
    assert.equal(spec.title, 'Order Cancellation');
    assert.deepEqual(spec.dependsOn, ['001', '002']);
    assert.deepEqual(spec.features.reads, ['inventory']);
    assert.equal('writes' in spec.features, false);
    assert.ok(spec.goal.includes('Cancel orders cleanly.'));
    assert.equal(spec.contractTablesCount, 1);
    assert.ok(spec.nonGoals.includes('Refund handling.'));
    assert.ok(spec.delta.includes('Modify orders feature doc.'));
  });

  it('parseSpecMd extracts proposal frontmatter without requiring features.writes', () => {
    const raw = `---
title: OpenSpec Proposal
depends_on: [15]
features:
  reads: [spec-lint-and-approve]
---
## Goal
Read OpenSpec artifacts natively.

## Non-goals
Deriving state from checkboxes.`;

    const spec = parseSpecMd(raw);
    assert.equal(spec.title, 'OpenSpec Proposal');
    assert.deepEqual(spec.dependsOn, ['015']);
    assert.deepEqual(spec.features.reads, ['spec-lint-and-approve']);
    assert.equal('writes' in spec.features, false);
    assert.ok(spec.goal.includes('Read OpenSpec artifacts natively.'));
    assert.ok(spec.nonGoals.includes('Deriving state from checkboxes.'));
  });

  it('parseTaskMd extracts task metadata and acceptance criteria list', () => {
    const raw = `---
title: When order is cancelled, reservation is released
verify: pnpm test tests/cancel.test.ts
scope: [src/orders/**, tests/orders/**]
entry: [src/orders/service.ts]
skills: []
---
## Acceptance
- [ ] reservation is released immediately
- [ ] event is emitted to bus
- [ ] order status updates to CANCELLED`;

    const task = parseTaskMd(raw);
    assert.equal(task.title, 'When order is cancelled, reservation is released');
    assert.equal(task.verify, 'pnpm test tests/cancel.test.ts');
    assert.deepEqual(task.scope, ['src/orders/**', 'tests/orders/**']);
    assert.deepEqual(task.entry, ['src/orders/service.ts']);
    assert.deepEqual(task.skills, []);
    assert.equal(task.acceptance.length, 3);
    assert.equal(task.acceptance[0], 'reservation is released immediately');
    assert.equal(task.acceptance[1], 'event is emitted to bus');
    assert.equal(task.acceptance[2], 'order status updates to CANCELLED');
  });

  it('parseTaskMd extracts entry and skills when populated', () => {
    const raw = `---
title: When parser runs, proposal is preferred
verify: node --import tsx --test tests/parser.test.ts
scope: [src/core/parser.ts]
entry: [src/core/parser.ts]
skills: [skill-a, skill-b]
---
## Acceptance
- [ ] parse works`;

    const task = parseTaskMd(raw);
    assert.deepEqual(task.entry, ['src/core/parser.ts']);
    assert.deepEqual(task.skills, ['skill-a', 'skill-b']);
    assert.deepEqual(task.acceptance, ['parse works']);
  });

  it('parseTaskMd defaults testsModify to false when omitted', () => {
    const raw = `---
title: When a task runs, no test permission is declared
verify: pnpm test
scope: [src/orders/**]
entry: [src/orders/service.ts]
skills: []
---
## Acceptance
- [ ] task parses`;

    const task = parseTaskMd(raw);
    assert.equal(task.testsModify, false);
  });

  it('parseTaskMd reads nested tests.modify booleans', () => {
    const allowed = `---
title: When tests are edited, permission is granted
verify: pnpm test
scope: [tests/orders/**]
tests:
  modify: true
---
## Acceptance
- [ ] task parses`;

    const denied = `---
title: When tests are edited, permission is withheld
verify: pnpm test
scope: [tests/orders/**]
tests:
  modify: false
---
## Acceptance
- [ ] task parses`;

    assert.equal(parseTaskMd(allowed).testsModify, true);
    assert.equal(parseTaskMd(denied).testsModify, false);
  });

  it('parseTaskMd accepts a flat tests.modify boolean key', () => {
    const raw = `---
title: When tests are edited, dotted permission is granted
verify: pnpm test
scope: [tests/orders/**]
tests.modify: true
---
## Acceptance
- [ ] task parses`;

    assert.equal(parseTaskMd(raw).testsModify, true);
  });

  it('parseTaskMd ignores non-boolean tests.modify values', () => {
    const raw = `---
title: When tests are edited, a string permission is ignored
verify: pnpm test
scope: [tests/orders/**]
tests:
  modify: 'yes'
---
## Acceptance
- [ ] task parses`;

    assert.equal(parseTaskMd(raw).testsModify, false);
  });

  it('parseTaskList parses OpenSpec grouped checklists with section headers and item numbers', () => {
    const raw = `# Tasks

## 1. Configuration and Dependencies

- [x] 1. When configuration is loaded, OpenSpec paths are typed
- [ ] 2. When dependencies are pinned, the validator resolves

## 2. Parsing and Templates

- [ ] 3. When change folders are parsed, proposal.md is supported
`;

    const items = parseTaskList(raw);
    assert.equal(items.length, 3);
    assert.deepEqual(items[0], {
      number: 1,
      title: 'When configuration is loaded, OpenSpec paths are typed',
      checked: true,
      section: '1. Configuration and Dependencies',
      line: 5,
    });
    assert.equal(items[1].number, 2);
    assert.equal(items[1].checked, false);
    assert.equal(items[1].section, '1. Configuration and Dependencies');
    assert.equal(items[2].number, 3);
    assert.equal(items[2].section, '2. Parsing and Templates');
  });

  it('parseTaskList parses flat numbered checklists and unnumbered bullets', () => {
    const raw = `# Tasks

- [ ] 1. When initial condition, expected outcome
* [X] 2. When another condition, another outcome
- [ ] unnumbered follow up`;

    const items = parseTaskList(raw);
    assert.equal(items.length, 3);
    assert.deepEqual(
      items.map((item) => [item.number, item.checked, item.title]),
      [
        [1, false, 'When initial condition, expected outcome'],
        [2, true, 'When another condition, another outcome'],
        [null, false, 'unnumbered follow up'],
      ],
    );
    assert.equal(items[0].section, null);
  });

  it('handles empty sections or missing frontmatter safely', () => {
    const raw = 'Just plain markdown without frontmatter.';
    const spec = parseSpecMd(raw);
    assert.equal(spec.title, '');
    assert.deepEqual(spec.dependsOn, []);
    assert.deepEqual(spec.features.reads, []);
    assert.equal('writes' in spec.features, false);
    assert.equal(spec.contractTablesCount, 0);
    assert.deepEqual(parseTaskList(raw), []);
  });
});

describe('Code ownership parsing', () => {
  it('parseCodeOwnership extracts globs from a capability delta spec', () => {
    const raw = `# Spec Delta: Demo Capability

## Purpose

Owns a demo subsystem.

## ADDED Requirements

### Requirement: Code ownership
<!-- source: src/core/parser.ts, src/cli/**, tests/parser.test.ts -->
The Demo capability SHALL own parsing and its CLI.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for parsing
- **THEN** system maps \`src/core/parser.ts\`, \`src/cli/**\`, and \`tests/parser.test.ts\` to demo

### Requirement: Something else
<!-- source: src/other.ts -->
Unrelated requirement.
`;

    assert.deepEqual(parseCodeOwnership(raw), [
      'src/core/parser.ts',
      'src/cli/**',
      'tests/parser.test.ts',
    ]);
  });

  it('parseCodeOwnership extracts ownership from living markdown content', () => {
    const raw = `# Parser

Some introductory prose referencing \`not-a-glob\`.

### Requirement: Code ownership
<!-- source: src/core/parser.ts, src/core/linter.ts -->
The parser capability owns parsing and linting.

#### Scenario: Ownership boundaries
- **WHEN** ownership is resolved
- **THEN** maps \`src/core/parser.ts\` and \`src/core/linter.ts\`
`;

    assert.deepEqual(parseCodeOwnership(raw), ['src/core/parser.ts', 'src/core/linter.ts']);
  });

  it('parseCodeOwnership returns an empty array when the header is absent', () => {
    const raw = `## ADDED Requirements

### Requirement: Parsing
<!-- source: src/core/parser.ts -->
No ownership block here.
`;

    assert.deepEqual(parseCodeOwnership(raw), []);
    assert.deepEqual(parseCodeOwnership(''), []);
  });
});

describe('Change folder proposal resolution', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-parser-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const proposal = `---
title: Proposal Title
depends_on: [015]
features:
  reads: [watcher-and-harness]
---
## Goal
Proposal goal text.

## Non-goals
Proposal non-goal text.`;

  const spec = `---
title: Spec Title
depends_on: []
features:
  reads: []
  writes: [cli-foundation]
---
## Goal
Spec goal text.`;

  it('parseSpecMdFromFolder parses proposal.md when present with fallback to spec.md', async () => {
    const proposalDir = path.join(tmpDir, 'proposal-only');
    await fs.mkdir(proposalDir, { recursive: true });
    await fs.writeFile(path.join(proposalDir, 'proposal.md'), proposal, 'utf8');

    const parsedProposal = await parseSpecMdFromFolder(proposalDir);
    assert.equal(parsedProposal?.title, 'Proposal Title');
    assert.deepEqual(parsedProposal?.features.reads, ['watcher-and-harness']);

    const specDir = path.join(tmpDir, 'spec-only');
    await fs.mkdir(specDir, { recursive: true });
    await fs.writeFile(path.join(specDir, 'spec.md'), spec, 'utf8');

    const parsedLegacy = await parseSpecMdFromFolder(specDir);
    assert.equal(parsedLegacy?.title, 'Spec Title');
    assert.deepEqual(parsedLegacy?.features.reads, []);
    assert.equal('writes' in (parsedLegacy?.features ?? {}), false);

    assert.equal(await parseSpecMdFromFolder(path.join(tmpDir, 'empty')), null);
  });

  it('resolveChangeDoc prefers proposal.md and reports its kind', async () => {
    const dir = path.join(tmpDir, 'both');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'proposal.md'), proposal, 'utf8');
    await fs.writeFile(path.join(dir, 'spec.md'), spec, 'utf8');

    const resolved = await resolveChangeDoc(dir);
    assert.equal(resolved?.kind, 'proposal');
    assert.equal(path.basename(resolved?.path ?? ''), 'proposal.md');

    await fs.rm(path.join(dir, 'proposal.md'));
    const legacyResolved = await resolveChangeDoc(dir);
    assert.equal(legacyResolved?.kind, 'spec');
    assert.equal(path.basename(legacyResolved?.path ?? ''), 'spec.md');

    assert.equal(await resolveChangeDoc(path.join(tmpDir, 'missing')), null);
  });
});

describe('Rewritten OpenSpec templates', () => {
  it('proposal template carries proposal frontmatter and delta spec guidance', async () => {
    const template = await fs.readFile(path.join(repoRoot, 'templates', 'proposal.md'), 'utf8');
    const parsed = parseSpecMd(template);

    assert.equal(parsed.title, 'Change title');
    assert.deepEqual(parsed.dependsOn, []);
    assert.deepEqual(parsed.features.reads, []);
    assert.equal('writes' in parsed.features, false);
    assert.ok(parsed.goal.trim().length > 0);
    assert.ok(parsed.nonGoals.trim().length > 0);

    assert.ok(template.includes('## ADDED Requirements'));
    assert.ok(template.includes('## MODIFIED Requirements'));
    assert.ok(template.includes('## REMOVED Requirements'));
    assert.ok(template.includes('## RENAMED Requirements'));
    assert.ok(template.includes('### Requirement:'));
    assert.ok(template.includes('#### Scenario:'));

    assert.ok(template.includes('### Requirement: Code ownership'));
    assert.deepEqual(parseCodeOwnership(template), ['src/core/example.ts', 'src/cli/example.ts']);
  });

  it('tasks template uses the OpenSpec numbered checklist format', async () => {
    const template = await fs.readFile(path.join(repoRoot, 'templates', 'tasks.md'), 'utf8');
    const items = parseTaskList(template);

    assert.equal(items.length, 1);
    assert.equal(items[0].number, 1);
    assert.equal(items[0].checked, false);
    assert.ok(items[0].title.length > 0);
    assert.ok(items[0].section);
  });
});
