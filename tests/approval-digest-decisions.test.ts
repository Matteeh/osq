import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { getMetricsReport } from '../src/core/report/report.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { buildApprovalDigest, formatApprovalDigest } from '../src/core/spec/digest.js';
import { installFakeValidator } from './helpers.js';

const CHANGE_ID = '001-decisions';
const RUNNER_VERIFY = 'node --import tsx --test tests/probe.test.ts';

const ADR_007_RULE = 'UI components use React.';
const ADR_009_RULE = 'The ingress adapter is the only module that imports dockerode.';

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

interface AdrFields {
  readonly status: string;
  readonly appliesTo?: string | readonly string[];
  readonly rule?: string;
  readonly supersededBy?: string;
}

async function writeAdr(root: string, fileName: string, fields: AdrFields): Promise<void> {
  const lines = ['---', `status: ${fields.status}`];
  if (Array.isArray(fields.appliesTo)) {
    lines.push('applies_to:');
    for (const name of fields.appliesTo) lines.push(`  - ${name}`);
  } else if (fields.appliesTo !== undefined) {
    lines.push(`applies_to: ${fields.appliesTo}`);
  }
  if (fields.rule !== undefined) lines.push(`rule: ${fields.rule}`);
  if (fields.supersededBy !== undefined) lines.push(`superseded_by: ${fields.supersededBy}`);
  lines.push('---', '', `# ${fileName.replace(/\.md$/, '')}. Title`, '', 'Body.', '');
  await fs.mkdir(path.join(root, 'decisions'), { recursive: true });
  await fs.writeFile(path.join(root, 'decisions', fileName), lines.join('\n'), 'utf8');
}

interface ChangeOptions {
  readonly decisions: string;
  readonly verify?: string;
  readonly delta?: boolean;
}

function proposal(options: ChangeOptions): string {
  const verify = options.verify ?? RUNNER_VERIFY;
  return [
    '---',
    'title: Decisions Probe',
    'depends_on: []',
    `verify: ${verify}`,
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    '',
    'List the governing decisions and flag each departure.',
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
    options.decisions,
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

function taskContent(verify: string): string {
  return `---\ntitle: When the probe runs, it passes\nverify: ${verify}\nscope: []\nentry: []\nskills: []\n---\n## Acceptance\n- [ ] passes\n`;
}

async function writeChangeFolder(root: string, options: ChangeOptions): Promise<string> {
  const folder = path.join(root, 'openspec', 'changes', CHANGE_ID);
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folder, 'proposal.md'), proposal(options), 'utf8');
  await fs.writeFile(
    path.join(folder, 'tasks', '1.md'),
    taskContent(options.verify ?? RUNNER_VERIFY),
    'utf8',
  );
  if (options.delta !== false) {
    await fs.mkdir(path.join(folder, 'specs', 'ingress'), { recursive: true });
    await fs.writeFile(path.join(folder, 'specs', 'ingress', 'spec.md'), DELTA, 'utf8');
    await fs.mkdir(path.join(root, 'openspec', 'specs', 'ingress'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'openspec', 'specs', 'ingress', 'spec.md'),
      '# ingress Specification\n\n## Purpose\n\nFixture purpose.\n\n## Requirements\n',
      'utf8',
    );
  }
  return folder;
}

async function installLocalVerifier(root: string): Promise<void> {
  await fs.writeFile(path.join(root, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
}

describe('approval digest decisions', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-digest-decisions-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await installLocalVerifier(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('lists each governing ADR in number order and prints them after capabilities', async () => {
    await writeAdr(tmpDir, '007-system.md', {
      status: 'accepted',
      appliesTo: 'all',
      rule: ADR_007_RULE,
    });
    await writeAdr(tmpDir, '009-ingress.md', {
      status: 'accepted',
      appliesTo: ['ingress'],
      rule: ADR_009_RULE,
    });
    const folder = await writeChangeFolder(tmpDir, {
      decisions: '- ADR 009: the adapter is the only module that imports dockerode.',
    });

    const digest = await buildApprovalDigest(tmpDir, folder, DEFAULT_CONFIG);

    assert.deepEqual(digest.decisions, [
      { number: '007', rule: ADR_007_RULE },
      { number: '009', rule: ADR_009_RULE },
    ]);

    const text = formatApprovalDigest(digest);
    assert.ok(text.includes('Decisions:'));
    assert.ok(text.includes(`  ADR 007: ${ADR_007_RULE}`));
    assert.ok(text.includes(`  ADR 009: ${ADR_009_RULE}`));
    const capabilitiesAt = text.indexOf('Capabilities:');
    const decisionsAt = text.indexOf('Decisions:');
    const humanAt = text.indexOf('Human steps:');
    assert.ok(capabilitiesAt < decisionsAt, text);
    assert.ok(decisionsAt < humanAt, text);
  });

  it('lists only accepted ADRs', async () => {
    await writeAdr(tmpDir, '007-system.md', {
      status: 'accepted',
      appliesTo: 'all',
      rule: ADR_007_RULE,
    });
    await writeAdr(tmpDir, '003-proposed.md', {
      status: 'proposed',
      appliesTo: 'all',
      rule: 'A proposed decision does not take effect.',
    });
    await writeAdr(tmpDir, '004-superseded.md', {
      status: 'superseded',
      appliesTo: 'all',
      rule: 'A superseded decision does not take effect.',
      supersededBy: '007',
    });
    const folder = await writeChangeFolder(tmpDir, { decisions: 'None' });

    const digest = await buildApprovalDigest(tmpDir, folder, DEFAULT_CONFIG);

    assert.deepEqual(
      digest.decisions.map((decision) => decision.number),
      ['007'],
    );
  });

  it('leaves the formatted digest unchanged when no ADR governs the change', async () => {
    await writeAdr(tmpDir, '009-other.md', {
      status: 'accepted',
      appliesTo: ['other'],
      rule: 'Other stays separate.',
    });
    const folder = await writeChangeFolder(tmpDir, { decisions: 'None' });

    const digest = await buildApprovalDigest(tmpDir, folder, DEFAULT_CONFIG);

    assert.deepEqual(digest.decisions, []);
    assert.ok(!formatApprovalDigest(digest).includes('Decisions:'));
  });

  it('raises one adr_departure flag per departure line, after every other flag', async () => {
    const folder = await writeChangeFolder(tmpDir, {
      verify: 'npx tsc --noEmit',
      decisions: '- Departs from ADR 007: the importer needs Vue for the legacy widget.',
      delta: false,
    });

    const digest = await buildApprovalDigest(tmpDir, folder, DEFAULT_CONFIG);

    const departures = digest.flags.filter((flag) => flag.id === 'adr_departure');
    assert.equal(departures.length, 1);
    assert.equal(departures[0].label, 'departs from ADR 007');
    assert.equal(
      departures[0].excerpt,
      'Departs from ADR 007: the importer needs Vue for the legacy widget.',
    );
    assert.ok(digest.flags.length > 1, 'expected a base flag before the departure');
    assert.equal(digest.flags[digest.flags.length - 1].id, 'adr_departure');
  });

  it('accepts a departure line without a list marker and raises one flag per line', async () => {
    const folder = await writeChangeFolder(tmpDir, {
      decisions: [
        'Departs from ADR 007: no list marker here.',
        '- Departs from ADR 009: a second departure.',
      ].join('\n'),
    });

    const digest = await buildApprovalDigest(tmpDir, folder, DEFAULT_CONFIG);

    const departures = digest.flags.filter((flag) => flag.id === 'adr_departure');
    assert.deepEqual(
      departures.map((flag) => [flag.label, flag.excerpt]),
      [
        ['departs from ADR 007', 'Departs from ADR 007: no list marker here.'],
        ['departs from ADR 009', 'Departs from ADR 009: a second departure.'],
      ],
    );
  });

  it('records adr_departure through approveSpec and counts it in the report', async () => {
    await writeAdr(tmpDir, '009-ingress.md', {
      status: 'accepted',
      appliesTo: ['ingress'],
      rule: ADR_009_RULE,
    });
    const folder = await writeChangeFolder(tmpDir, {
      verify: 'node verify.cjs',
      decisions: [
        '- ADR 009: the adapter is the only module that imports dockerode.',
        '- Departs from ADR 007: the importer needs Vue for the legacy widget.',
      ].join('\n'),
    });

    const result = await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const departure = result.digest.flags.find((flag) => flag.id === 'adr_departure');
    assert.ok(departure, result.digest.flags.map((flag) => flag.id).join(', '));
    assert.equal(departure.label, 'departs from ADR 007');
    assert.equal(result.digest.flags[result.digest.flags.length - 1].id, 'adr_departure');

    const manifest = JSON.parse(
      await fs.readFile(path.join(folder, '.run', 'manifest.json'), 'utf8'),
    ) as { approvalFlags: { ids: string[]; mode: string } };
    assert.ok(manifest.approvalFlags.ids.includes('adr_departure'));
    assert.equal(manifest.approvalFlags.mode, 'shown');

    const eventsDir = path.join(folder, '.run', 'events');
    await fs.mkdir(eventsDir, { recursive: true });
    await fs.writeFile(
      path.join(eventsDir, '1.jsonl'),
      `${JSON.stringify({
        type: 'dead',
        timestamp: '2026-09-18T00:00:00.000Z',
        data: { reason: 'verify_red' },
      })}\n`,
      'utf8',
    );

    const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);
    assert.deepEqual(report.approvalFlags.byFlag.adr_departure, {
      shown: { fired: 1, troubled: 1 },
      confirmed: { fired: 0, troubled: 0 },
    });
    assert.equal(report.approvalFlags.changes, 1);
  });
});
