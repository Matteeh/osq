import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { parseRequirement } from '../src/core/spec/delta.js';
import { lintChangeFolder } from '../src/core/spec/linter.js';
import { sourceCommentFindings } from '../src/core/spec/source-comment-lint.js';
import { installFakeValidator } from './helpers.js';

const CHANGE_ID = '001-source-comment';
const CAPABILITY = 'sample';

const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

const PROPOSAL = `---
title: Source comment lint
depends_on: []
verify: node verify.cjs
features:
  reads: []
---
## Goal

Warn on source comments outside Code ownership.

## Contract

| A | B |
|---|---|
| 1 | 2 |

## Non-goals

None.

## Surface

None.

## Delta

Delta specs live beside the proposal.
`;

const TASK = `---
title: Valid task
verify: node verify.cjs
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] passes
`;

/** One requirement block, with an optional source comment under the header. */
function requirementBlock(name: string, sourceComment: string | null): string {
  const comment = sourceComment === null ? '' : `\n<!-- source: ${sourceComment} -->`;
  return `### Requirement: ${name}${comment}
The system SHALL behave declaratively.

#### Scenario: Works
- **WHEN** invoked
- **THEN** works
`;
}

/** Write a living capability spec holding one requirement. */
async function writeLivingSpec(
  projectRoot: string,
  capability: string,
  name: string,
): Promise<void> {
  const dir = path.join(projectRoot, 'openspec', 'specs', capability);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, 'spec.md'),
    `# ${capability} Specification

## Purpose

Living.

## Requirements

${requirementBlock(name, null)}`,
    'utf8',
  );
}

/** Write a capability delta from already-rendered operation sections. */
async function writeDelta(changeFolder: string, capability: string, body: string): Promise<void> {
  const dir = path.join(changeFolder, 'specs', capability);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, 'spec.md'),
    `# Spec Delta: ${capability}

## Purpose

Why this capability exists.

${body}`,
    'utf8',
  );
}

describe('source comment linting', () => {
  let tmpDir: string;
  let changeFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-source-comment-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
    changeFolder = path.join(tmpDir, 'openspec', 'changes', CHANGE_ID);
    await fs.mkdir(path.join(changeFolder, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(changeFolder, 'proposal.md'), PROPOSAL, 'utf8');
    await fs.writeFile(path.join(changeFolder, 'tasks', '1.md'), TASK, 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('warns once for Totals and never for Code ownership', async () => {
    await writeLivingSpec(tmpDir, CAPABILITY, 'Totals');
    await writeDelta(
      changeFolder,
      CAPABILITY,
      `## MODIFIED Requirements

${requirementBlock('Totals', 'src/totals.ts')}
## ADDED Requirements

${requirementBlock('Code ownership', 'src/sample.ts')}`,
    );

    const result = await lintChangeFolder(tmpDir, changeFolder, DEFAULT_CONFIG);
    const sourceWarnings = result.warnings.filter((warning) =>
      warning.includes('carries a source comment'),
    );

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(sourceWarnings.length, 1, result.warnings.join('\n'));
    assert.ok(
      sourceWarnings[0].includes(CAPABILITY) && sourceWarnings[0].includes('"Totals"'),
      sourceWarnings[0],
    );
    assert.ok(sourceWarnings[0].includes('only Code ownership keeps one'), sourceWarnings[0]);
    assert.ok(
      !sourceWarnings.some((warning) => warning.includes('"Code ownership"')),
      sourceWarnings.join('\n'),
    );
  });

  it('keeps the Code ownership source comment without warning', async () => {
    await writeDelta(
      changeFolder,
      CAPABILITY,
      `## ADDED Requirements

${requirementBlock('Code ownership', 'src/sample.ts')}`,
    );

    const result = await lintChangeFolder(tmpDir, changeFolder, DEFAULT_CONFIG);
    const sourceWarnings = result.warnings.filter((warning) =>
      warning.includes('carries a source comment'),
    );

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(sourceWarnings.length, 0, result.warnings.join('\n'));
  });

  it('reports capability, requirement, file, and message', () => {
    const requirement = parseRequirement(
      '### Requirement: Totals\n<!-- source: src/totals.ts -->\nThe system SHALL total.\n',
    );

    const findings = sourceCommentFindings('sample', 'path/spec.md', [requirement]);

    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'warning');
    assert.equal(findings[0].file, 'path/spec.md');
    assert.equal(findings[0].requirement, 'Totals');
    assert.equal(
      findings[0].message,
      'sample: requirement "Totals" carries a source comment; only Code ownership keeps one',
    );
  });

  it('ignores a source comment mentioned inside backticks', () => {
    const requirement = parseRequirement(
      '### Requirement: Mentions\n\nThe line `<!-- source: src/x.ts -->` is documentation.\n',
    );

    const findings = sourceCommentFindings('sample', 'path/spec.md', [requirement]);

    assert.equal(findings.length, 0);
  });
});
