import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { readDecisions } from '../src/core/foundation/decisions.js';
import { runDoctorChecks } from '../src/core/foundation/doctor.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { OPENSPEC_EXPECTED_VERSION, lintChangeFolder } from '../src/core/spec/linter.js';
import { installFakeValidator } from './helpers.js';

const CONFIG = DEFAULT_CONFIG;
const README = path.join('decisions', 'README.md');
const STARTER = path.join('decisions', '000-how-this-project-is-built.md');
const NO_SYSTEM_WIDE_WARNING =
  'no accepted ADR applies to all; write the architecture and style ADRs first';

const CHANGE_ID = '001-scaffold-probe';
const PROPOSAL_PATH = `openspec/changes/${CHANGE_ID}/proposal.md`;

const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

const TASK = `---
title: When the scaffold probe runs, it passes
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

function proposal(decisions: string | null): string {
  const sections = [
    '---',
    'title: Scaffold Probe',
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    '',
    'Probe the scaffolded decisions lint.',
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

async function writeChangeFolder(root: string, decisions: string | null): Promise<string> {
  const folder = path.join(root, 'openspec', 'changes', CHANGE_ID);
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folder, 'proposal.md'), proposal(decisions), 'utf8');
  await fs.writeFile(path.join(folder, 'tasks', '1.md'), TASK, 'utf8');
  await fs.mkdir(path.join(folder, 'specs', 'ingress'), { recursive: true });
  await fs.writeFile(path.join(folder, 'specs', 'ingress', 'spec.md'), DELTA, 'utf8');
  return folder;
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

describe('decisions scaffold', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-decisions-scaffold-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes a README and a proposed starter on a fresh project', async () => {
    const result = await scaffoldProject(tmpDir);

    assert.ok(result.createdFiles.includes(README), JSON.stringify(result.createdFiles));
    assert.ok(result.createdFiles.includes(STARTER), JSON.stringify(result.createdFiles));

    const readme = await fs.readFile(path.join(tmpDir, README), 'utf8');
    for (const field of ['status', 'applies_to', 'rule', 'superseded_by', 'checks', 'denies']) {
      assert.ok(readme.includes(`\`${field}\``), `README must name ${field}`);
    }
    assert.match(readme, /Only accepted ADRs take effect/);
    assert.match(readme, /number comes from the file name/);

    const starter = await fs.readFile(path.join(tmpDir, STARTER), 'utf8');
    assert.match(starter, /^---\nstatus: proposed\napplies_to: all\n---/);
    assert.equal(/^rule:/m.test(starter), false, 'the starter must carry no rule');
    assert.ok(starter.includes('# 000. How this project is built'));

    const headings = [...starter.matchAll(/^## (.+)$/gm)].map((match) => match[1].trim());
    assert.deepEqual(headings.slice(0, 5), ['Layering', 'State', 'Errors', 'Tests', 'Naming']);
    assert.match(starter, /write an accepted ADR with `applies_to: all`/);

    const records = await readDecisions(tmpDir, CONFIG);
    assert.deepEqual(
      records.adrs.map((adr) => adr.number),
      ['000'],
    );
    assert.equal(records.adrs[0]?.status, 'proposed');
  });

  it('keeps an edited starter and reports both files as existing on a re-run', async () => {
    await scaffoldProject(tmpDir);
    const edited = '---\nstatus: proposed\napplies_to: all\n---\n# 000. Edited\n\nMy own words.\n';
    await fs.writeFile(path.join(tmpDir, STARTER), edited, 'utf8');

    const result = await scaffoldProject(tmpDir, { refreshSchema: true });

    assert.equal(await fs.readFile(path.join(tmpDir, STARTER), 'utf8'), edited);
    assert.ok(result.existingFiles.includes(STARTER), JSON.stringify(result.existingFiles));
    assert.equal(result.refreshedFiles.includes(STARTER), false);
    assert.ok(result.existingFiles.includes(README), JSON.stringify(result.existingFiles));
    assert.equal(result.refreshedFiles.includes(README), false);
  });

  it('writes only the README in a project that already has an ADR', async () => {
    await fs.mkdir(path.join(tmpDir, 'decisions'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'decisions', '001-existing.md'),
      '---\nstatus: accepted\napplies_to: all\nrule: Existing rule.\n---\n# 001. Existing\n',
      'utf8',
    );

    const result = await scaffoldProject(tmpDir);

    assert.ok(result.createdFiles.includes(README), JSON.stringify(result.createdFiles));
    assert.equal(result.createdFiles.includes(STARTER), false);
    assert.equal(await exists(path.join(tmpDir, STARTER)), false);
  });
});

describe('decisions doctor warning', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-decisions-doctor-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function decisionsCheck() {
    const report = await runDoctorChecks(tmpDir, {
      loadConfig: async () => CONFIG,
      probeValidator: async () => OPENSPEC_EXPECTED_VERSION,
    });
    const check = report.checks.find((entry) => entry.name === 'decisions');
    assert.ok(check, 'the decisions check is present');
    return check;
  }

  it('warns when only the proposed starter applies to all', async () => {
    await scaffoldProject(tmpDir);

    const check = await decisionsCheck();

    assert.equal(check.ok, true);
    assert.equal(check.warning, true);
    assert.equal(check.message, NO_SYSTEM_WIDE_WARNING);
  });

  it('clears the warning when the starter is accepted and init writes the rules block', async () => {
    await scaffoldProject(tmpDir);
    await fs.writeFile(
      path.join(tmpDir, STARTER),
      '---\nstatus: accepted\napplies_to: all\nrule: The system is layered.\n---\n# 000. How this project is built\n\nAnswered.\n',
      'utf8',
    );
    await scaffoldProject(tmpDir);

    const check = await decisionsCheck();

    assert.equal(check.ok, true);
    assert.equal(check.warning, undefined);
    assert.equal(check.message, '1 ADRs valid');
  });
});

describe('decisions lint waits for an accepted ADR', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-decisions-lint-gate-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('reports no decisions finding for a missing section', async () => {
    const folder = await writeChangeFolder(tmpDir, null);

    const result = await lintChangeFolder(tmpDir, folder, CONFIG);

    assert.equal(
      result.findings.some((entry) => entry.section === 'Decisions'),
      false,
      JSON.stringify(result.findings),
    );
  });

  it('reports no decisions finding for a named ADR', async () => {
    const folder = await writeChangeFolder(tmpDir, '- ADR 009: an ADR that does not exist.');

    const result = await lintChangeFolder(tmpDir, folder, CONFIG);

    assert.equal(
      result.findings.some((entry) => entry.section === 'Decisions'),
      false,
      JSON.stringify(result.findings),
    );
    assert.equal(
      result.findings.some((entry) => entry.file === PROPOSAL_PATH),
      false,
    );
  });
});
