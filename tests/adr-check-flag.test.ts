import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { getMetricsReport } from '../src/core/report/report.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { buildApprovalDigest } from '../src/core/spec/digest.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

const ADR_RULE = 'The ingress adapter is the only module that imports dockerode.';
const CHECK_FILE = 'tests/adapter-imports.test.ts';

const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

const DELTA = `# Spec Delta: Ingress

## ADDED Requirements

### Requirement: Ingress routing

The system SHALL route ingress requests.

#### Scenario: Request routed
- **WHEN** a request arrives
- **THEN** it is routed
`;

async function writeAdr(root: string): Promise<void> {
  const lines = [
    '---',
    'status: accepted',
    'applies_to:',
    '  - ingress',
    `rule: ${ADR_RULE}`,
    'checks:',
    `  - ./${CHECK_FILE}`,
    'denies: []',
    '---',
    '',
    '# 009. The ingress adapter',
    '',
    'Body.',
    '',
  ];
  await fs.mkdir(path.join(root, 'decisions'), { recursive: true });
  await fs.writeFile(path.join(root, 'decisions', '009-ingress.md'), lines.join('\n'), 'utf8');
}

function proposal(verify: string): string {
  return [
    '---',
    'title: ADR check flags',
    'depends_on: []',
    `verify: ${verify}`,
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    '',
    'Flag a task that may modify an accepted ADR check.',
    '',
    '## Non-goals',
    '',
    'None.',
    '',
    '## Surface',
    '',
    'None',
    '',
    '## Decisions',
    '',
    '- ADR 009: the ingress adapter is the only module that imports dockerode.',
    '',
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
    '## Human steps',
    '',
    'None',
    '',
    '## Delta',
    '',
    'Delta specs declare behavior.',
    '',
  ].join('\n');
}

function taskContent(testsModify: boolean, scope: readonly string[]): string {
  const lines = [
    '---',
    'title: When a check file may change, the flag fires',
    'verify: node verify.cjs',
    `scope: [${scope.join(', ')}]`,
    'entry: []',
    'skills: []',
  ];
  if (testsModify) lines.push('tests:', '  modify: true');
  lines.push('---', '## Acceptance', '- [ ] flag fires');
  return `${lines.join('\n')}\n`;
}

const TASKS_MD = `# Tasks

- [ ] 2. When a check file may change, the flag fires
`;

const LOCAL_VERIFIER_CMD = 'node verify.cjs';

async function writeChangeFolder(
  root: string,
  folder: string,
  options: { testsModify: boolean; scope: readonly string[] },
): Promise<string> {
  const changeFolder = path.join(root, 'openspec', 'changes', folder);
  await fs.mkdir(path.join(changeFolder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(changeFolder, 'proposal.md'), proposal(LOCAL_VERIFIER_CMD), 'utf8');
  await fs.writeFile(path.join(changeFolder, 'tasks.md'), TASKS_MD, 'utf8');
  await fs.writeFile(
    path.join(changeFolder, 'tasks', '2.md'),
    taskContent(options.testsModify, options.scope),
    'utf8',
  );
  await fs.mkdir(path.join(changeFolder, 'specs', 'ingress'), { recursive: true });
  await fs.writeFile(path.join(changeFolder, 'specs', 'ingress', 'spec.md'), DELTA, 'utf8');
  await fs.mkdir(path.join(root, 'openspec', 'specs', 'ingress'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'openspec', 'specs', 'ingress', 'spec.md'),
    '# ingress Specification\n\n## Purpose\n\nFixture purpose.\n\n## Requirements\n',
    'utf8',
  );
  return changeFolder;
}

/** Adapter that edits a file in the project, then writes a result file. */
class FileMutatingAdapter implements HarnessAdapter {
  readonly name = 'file-mutating';

  constructor(private readonly mutate: (projectRoot: string) => Promise<void>) {}

  async setup(_projectRoot: string, _config: unknown): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    await this.mutate(options.projectRoot);
    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(
      path.join(resultsDir, `${options.taskNumber}.md`),
      '# Agent result\n',
      'utf8',
    );
    return { exitCode: 0 };
  }
}

describe('ADR check modification flag', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-adr-check-flag-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
    await fs.mkdir(path.join(tmpDir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, CHECK_FILE), '// preexisting ADR check\n', 'utf8');
    await writeAdr(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('flags a task authorized to edit an accepted ADR check and counts it in the report', async () => {
    const folder = await writeChangeFolder(tmpDir, '001-check-flag', {
      testsModify: true,
      scope: [CHECK_FILE],
    });

    const digest = await buildApprovalDigest(tmpDir, folder, DEFAULT_CONFIG);
    const checkFlags = digest.flags.filter((flag) => flag.id === 'adr_check_modified');
    assert.equal(checkFlags.length, 1);
    assert.equal(checkFlags[0].label, 'task 2 may modify a check of ADR 009');
    assert.equal(
      checkFlags[0].excerpt,
      `${CHECK_FILE} enforces ADR 009: ${ADR_RULE} Record it as Departs from ADR 009: in ## Decisions.`,
    );

    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    const manifest = JSON.parse(
      await fs.readFile(path.join(folder, '.run', 'manifest.json'), 'utf8'),
    ) as { approvalFlags: { ids: string[]; mode: string } };
    assert.ok(manifest.approvalFlags.ids.includes('adr_check_modified'));
    assert.equal(manifest.approvalFlags.mode, 'shown');

    const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);
    assert.deepEqual(report.approvalFlags.byFlag.adr_check_modified, {
      shown: { fired: 1, troubled: 0 },
      confirmed: { fired: 0, troubled: 0 },
    });
  });

  it('raises no flag without tests.modify and kills an edit to the check file', async () => {
    const folder = await writeChangeFolder(tmpDir, '002-frozen', {
      testsModify: false,
      scope: [],
    });

    const digest = await buildApprovalDigest(tmpDir, folder, DEFAULT_CONFIG);
    assert.equal(
      digest.flags.some((flag) => flag.id === 'adr_check_modified'),
      false,
    );

    await approveSpec(tmpDir, '002', DEFAULT_CONFIG);
    const adapter = new FileMutatingAdapter(async () => {
      await fs.writeFile(path.join(tmpDir, CHECK_FILE), '// edited by the agent\n', 'utf8');
    });

    const result = await runTask(tmpDir, folder, '2', DEFAULT_CONFIG, adapter);
    assert.equal(result.success, false);
    assert.equal(result.reason, 'undeclared_test_change');
  });
});
