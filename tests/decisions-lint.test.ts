import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { type LintResult, lintChangeFolder } from '../src/core/spec/linter.js';
import { installFakeValidator } from './helpers.js';

const CHANGE_ID = '001-decisions';
const PROPOSAL_PATH = `openspec/changes/${CHANGE_ID}/proposal.md`;

const MISSING_SECTION_ERROR =
  'proposal.md needs a ## Decisions section: name each accepted ADR that governs a capability this change writes, or write None';

const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

/** Build an inline proposal with the raw `## Decisions` body, or none. */
function proposal(decisions: string | null): string {
  const sections = [
    '---',
    'title: Decisions Probe',
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    '',
    'Probe the proposal decisions declaration.',
    '',
    '## Non-goals',
    '',
    'None.',
    '',
    '## Surface',
    '',
    'None',
    '',
  ];
  if (decisions !== null) {
    sections.push('## Decisions', '', decisions, '');
  }
  sections.push(
    '## Contract',
    '',
    '### Requirement: Probe behavior',
    '',
    'The system SHALL probe deterministically.',
    '',
    '#### Scenario: Probe works',
    '- **WHEN** invoked',
    '- **THEN** it works',
    '',
    '## Delta',
    '',
    'Delta specs declare behavior.',
    '',
  );
  return sections.join('\n');
}

const TASK = `---
title: When the decisions probe runs, it passes
verify: node verify.cjs
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] passes
`;

const DELTA = `# Spec Delta: Ingress

## ADDED Requirements

### Requirement: Ingress routing

The system SHALL route ingress requests.

#### Scenario: Request routed
- **WHEN** a request arrives
- **THEN** it is routed
`;

interface AdrFields {
  status: string;
  appliesTo?: string | readonly string[];
  rule?: string;
  supersededBy?: string;
}

async function writeAdr(root: string, fileName: string, fields: AdrFields): Promise<void> {
  const lines = ['---', `status: ${fields.status}`];
  if (Array.isArray(fields.appliesTo)) {
    lines.push('applies_to:');
    for (const name of fields.appliesTo) {
      lines.push(`  - ${name}`);
    }
  } else if (fields.appliesTo !== undefined) {
    lines.push(`applies_to: ${fields.appliesTo}`);
  }
  if (fields.rule !== undefined) {
    lines.push(`rule: ${fields.rule}`);
  }
  if (fields.supersededBy !== undefined) {
    lines.push(`superseded_by: ${fields.supersededBy}`);
  }
  lines.push('---', '', `# ${fileName.replace(/\.md$/, '')}. Title`, '', 'Body.', '');
  await fs.mkdir(path.join(root, 'decisions'), { recursive: true });
  await fs.writeFile(path.join(root, 'decisions', fileName), lines.join('\n'), 'utf8');
}

interface ChangeOptions {
  readonly decisions: string | null;
  readonly capability?: boolean;
  readonly legacy?: boolean;
}

async function writeChangeFolder(root: string, options: ChangeOptions): Promise<string> {
  const folder = path.join(root, 'openspec', 'changes', CHANGE_ID);
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  const docName = options.legacy ? 'spec.md' : 'proposal.md';
  const body = options.legacy
    ? '# Legacy change\n\nA legacy spec document.\n'
    : proposal(options.decisions);
  await fs.writeFile(path.join(folder, docName), body, 'utf8');
  await fs.writeFile(path.join(folder, 'tasks', '1.md'), TASK, 'utf8');
  if (options.capability !== false) {
    await fs.mkdir(path.join(folder, 'specs', 'ingress'), { recursive: true });
    await fs.writeFile(path.join(folder, 'specs', 'ingress', 'spec.md'), DELTA, 'utf8');
  }
  return folder;
}

async function installLocalVerifier(root: string): Promise<void> {
  await fs.writeFile(path.join(root, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
}

function findingFor(result: LintResult, message: string): LintResult['findings'][number] {
  const finding = result.findings.find((entry) => entry.message === message);
  assert.ok(
    finding,
    `missing finding "${message}" in:\n${result.findings.map((f) => f.message).join('\n')}`,
  );
  return finding;
}

function hasOwnError(result: LintResult, message: string): boolean {
  return result.findings.some((entry) => entry.severity === 'error' && entry.message === message);
}

describe('decisions lint', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-decisions-lint-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await installLocalVerifier(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('Decisions section lint', () => {
    it('rejects a governing ADR the section leaves unnamed', async () => {
      await writeAdr(tmpDir, '009-ingress.md', {
        status: 'accepted',
        appliesTo: ['ingress'],
        rule: 'The ingress adapter is the only module that imports dockerode.',
      });
      const folder = await writeChangeFolder(tmpDir, { decisions: 'None' });

      const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);

      assert.equal(result.valid, false);
      const finding = findingFor(
        result,
        'proposal.md ## Decisions does not name ADR 009, which applies to ingress',
      );
      assert.equal(finding.severity, 'error');
      assert.equal(finding.file, PROPOSAL_PATH);
      assert.equal(finding.section, 'Decisions');
      assert.equal(finding.requirement, null);
    });

    it('accepts a section that names the governing ADR', async () => {
      await writeAdr(tmpDir, '009-ingress.md', {
        status: 'accepted',
        appliesTo: ['ingress'],
        rule: 'The ingress adapter is the only module that imports dockerode.',
      });
      const folder = await writeChangeFolder(tmpDir, {
        decisions: '- ADR 009: the adapter is the only module that imports dockerode.',
      });

      const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);

      assert.equal(
        hasOwnError(
          result,
          'proposal.md ## Decisions does not name ADR 009, which applies to ingress',
        ),
        false,
      );
      assert.equal(result.valid, true, result.errors.join('\n'));
    });

    it('counts a departure line as naming its ADR', async () => {
      await writeAdr(tmpDir, '009-ingress.md', {
        status: 'accepted',
        appliesTo: ['ingress'],
        rule: 'The ingress adapter is the only module that imports dockerode.',
      });
      const folder = await writeChangeFolder(tmpDir, {
        decisions: '- Departs from ADR 009: the legacy widget needs the direct driver.',
      });

      const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);

      assert.equal(
        hasOwnError(
          result,
          'proposal.md ## Decisions does not name ADR 009, which applies to ingress',
        ),
        false,
      );
    });

    it('rejects a missing Decisions section', async () => {
      await writeAdr(tmpDir, '009-ingress.md', {
        status: 'accepted',
        appliesTo: ['ingress'],
        rule: 'The ingress adapter is the only module that imports dockerode.',
      });
      const folder = await writeChangeFolder(tmpDir, { decisions: null });

      const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);

      assert.equal(result.valid, false);
      const finding = findingFor(result, MISSING_SECTION_ERROR);
      assert.equal(finding.severity, 'error');
      assert.equal(finding.file, PROPOSAL_PATH);
      assert.equal(finding.section, 'Decisions');
    });

    it('rejects a comment-only Decisions section', async () => {
      await writeAdr(tmpDir, '009-ingress.md', {
        status: 'accepted',
        appliesTo: ['ingress'],
        rule: 'The ingress adapter is the only module that imports dockerode.',
      });
      const folder = await writeChangeFolder(tmpDir, {
        decisions: '<!-- name the ADRs here -->',
      });

      const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);

      assert.equal(hasOwnError(result, MISSING_SECTION_ERROR), true);
    });

    it('leaves a project without ADRs exempt', async () => {
      const folder = await writeChangeFolder(tmpDir, { decisions: null });

      const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);

      assert.equal(result.valid, true, result.errors.join('\n'));
      assert.equal(
        result.findings.some((entry) => entry.section === 'Decisions'),
        false,
      );
    });

    it('leaves a legacy spec.md change document exempt', async () => {
      await writeAdr(tmpDir, '009-ingress.md', {
        status: 'accepted',
        appliesTo: ['ingress'],
        rule: 'The ingress adapter is the only module that imports dockerode.',
      });
      const folder = await writeChangeFolder(tmpDir, {
        decisions: null,
        legacy: true,
      });

      const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);

      assert.equal(
        result.findings.some((entry) => entry.section === 'Decisions'),
        false,
      );
    });

    it('warns when the section names an unknown ADR and stays valid', async () => {
      await writeAdr(tmpDir, '009-other.md', {
        status: 'accepted',
        appliesTo: ['other'],
        rule: 'Other stays separate.',
      });
      const folder = await writeChangeFolder(tmpDir, {
        decisions: '- ADR 042: an ADR that does not exist.',
      });

      const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);

      const finding = findingFor(
        result,
        'proposal.md ## Decisions names ADR 042, which does not exist or is not accepted',
      );
      assert.equal(finding.severity, 'warning');
      assert.equal(finding.file, PROPOSAL_PATH);
      assert.equal(finding.section, 'Decisions');
      assert.equal(result.valid, true, result.errors.join('\n'));
    });

    it('warns when the section names an ADR that is not accepted', async () => {
      await writeAdr(tmpDir, '003-proposed.md', {
        status: 'proposed',
        appliesTo: ['other'],
        rule: 'A proposed decision does not take effect.',
      });
      const folder = await writeChangeFolder(tmpDir, {
        decisions: '- ADR 003: a proposed decision.',
      });

      const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);

      const finding = findingFor(
        result,
        'proposal.md ## Decisions names ADR 003, which does not exist or is not accepted',
      );
      assert.equal(finding.severity, 'warning');
      assert.equal(result.valid, true, result.errors.join('\n'));
    });

    it('requires no naming for a system-wide ADR', async () => {
      await writeAdr(tmpDir, '007-system.md', {
        status: 'accepted',
        appliesTo: 'all',
        rule: 'UI components use React.',
      });
      await scaffoldProject(tmpDir);
      const folder = await writeChangeFolder(tmpDir, { decisions: 'None' });

      const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);

      assert.equal(
        result.findings.some(
          (entry) => entry.section === 'Decisions' && entry.severity === 'error',
        ),
        false,
      );
    });
  });

  describe('Project rules lint', () => {
    it('fails a stale block naming osq init and passes after init', async () => {
      await writeAdr(tmpDir, '007-system.md', {
        status: 'accepted',
        appliesTo: 'all',
        rule: 'UI components use React.',
      });
      const folder = await writeChangeFolder(tmpDir, { decisions: 'None' });

      const stale = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);
      assert.equal(stale.valid, false);
      const finding = stale.findings.find(
        (entry) => entry.file === 'AGENTS.md' && entry.message.includes('osq init'),
      );
      assert.ok(finding, stale.findings.map((entry) => entry.message).join('\n'));
      assert.equal(finding.severity, 'error');
      assert.equal(finding.section, null);

      await scaffoldProject(tmpDir);
      const fixed = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);
      assert.equal(fixed.valid, true, fixed.errors.join('\n'));
    });

    it('fails when there are more system-wide rules than the limit', async () => {
      await writeAdr(tmpDir, '007-system.md', {
        status: 'accepted',
        appliesTo: 'all',
        rule: 'Rule seven.',
      });
      await writeAdr(tmpDir, '008-system.md', {
        status: 'accepted',
        appliesTo: 'all',
        rule: 'Rule eight.',
      });
      await writeAdr(tmpDir, '009-system.md', {
        status: 'accepted',
        appliesTo: 'all',
        rule: 'Rule nine.',
      });
      await scaffoldProject(tmpDir);
      const folder = await writeChangeFolder(tmpDir, { decisions: 'None' });
      const config: OsqConfig = {
        ...DEFAULT_CONFIG,
        limits: { ...DEFAULT_CONFIG.limits, maxProjectRules: 2 },
      };

      const result = await lintChangeFolder(tmpDir, folder, config);

      assert.equal(result.valid, false);
      const finding = result.findings.find(
        (entry) => entry.file === 'AGENTS.md' && entry.message.includes('2'),
      );
      assert.ok(finding, result.findings.map((entry) => entry.message).join('\n'));
      assert.equal(finding.severity, 'error');
    });
  });

  describe('approveSpec', () => {
    it('refuses a proposal whose governing ADR is unnamed', async () => {
      await writeAdr(tmpDir, '009-ingress.md', {
        status: 'accepted',
        appliesTo: ['ingress'],
        rule: 'The ingress adapter is the only module that imports dockerode.',
      });
      await writeChangeFolder(tmpDir, { decisions: 'None' });

      await assert.rejects(
        () => approveSpec(tmpDir, '001', DEFAULT_CONFIG),
        (error: unknown) =>
          error instanceof Error &&
          error.message.includes(
            'proposal.md ## Decisions does not name ADR 009, which applies to ingress',
          ),
      );
    });

    it('refuses a proposal while the project rules block is stale', async () => {
      await writeAdr(tmpDir, '007-system.md', {
        status: 'accepted',
        appliesTo: 'all',
        rule: 'UI components use React.',
      });
      await writeChangeFolder(tmpDir, { decisions: 'None' });

      await assert.rejects(
        () => approveSpec(tmpDir, '001', DEFAULT_CONFIG),
        (error: unknown) => error instanceof Error && error.message.includes('osq init'),
      );
    });

    it('approves a proposal whose governing ADR is named', async () => {
      await writeAdr(tmpDir, '009-ingress.md', {
        status: 'accepted',
        appliesTo: ['ingress'],
        rule: 'The ingress adapter is the only module that imports dockerode.',
      });
      await writeChangeFolder(tmpDir, {
        decisions: '- ADR 009: the adapter is the only module that imports dockerode.',
      });

      const result = await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

      assert.equal(result.specId, '001');
      assert.ok(result.hash.startsWith('sha256:'));
    });
  });
});
