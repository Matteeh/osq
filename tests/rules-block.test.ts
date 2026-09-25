import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { initCommand } from '../src/cli/init.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { readDecisions } from '../src/core/foundation/decisions.js';
import { checkDecisions } from '../src/core/foundation/doctor-decisions.js';
import { runDoctorChecks } from '../src/core/foundation/doctor.js';
import {
  MANAGED_AGENTS_MD_BODY,
  OSQ_END_MARKER,
  OSQ_START_MARKER,
  scaffoldProject,
  updateAgentsMd,
} from '../src/core/foundation/init.js';
import {
  RULES_END_MARKER,
  RULES_START_MARKER,
  checkProjectRules,
  renderRulesBlock,
  writeRulesBlock,
} from '../src/core/foundation/rules-block.js';
import { OPENSPEC_EXPECTED_VERSION } from '../src/core/spec/linter.js';

const CONFIG = DEFAULT_CONFIG;

/** ADR frontmatter plus a heading, without the body osq does not read. */
function adr(status: string, appliesTo: string, rule: string, supersededBy?: string): string {
  const lines = ['---', `status: ${status}`, `applies_to: ${appliesTo}`];
  if (supersededBy !== undefined) lines.push(`superseded_by: ${supersededBy}`);
  lines.push(`rule: ${rule}`, '---', '# ADR');
  return `${lines.join('\n')}\n`;
}

async function writeDecision(root: string, fileName: string, content: string): Promise<void> {
  const dir = path.join(root, 'decisions');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, fileName), content, 'utf8');
}

async function writeLivingSpec(root: string, name: string): Promise<void> {
  const dir = path.join(root, 'openspec', 'specs', name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, 'spec.md'),
    `# ${name} Specification\n\n## Purpose\n\nA capability for tests.\n`,
    'utf8',
  );
}

function readAgents(root: string): Promise<string> {
  return fs.readFile(path.join(root, 'AGENTS.md'), 'utf8');
}

function tightConfig(maxProjectRules: number): OsqConfig {
  return { ...CONFIG, limits: { ...CONFIG.limits, maxProjectRules } };
}

describe('project rules block', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-rules-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('renders the canonical block for two system-wide ADRs in number order', async () => {
    await writeDecision(tmpDir, '007-b.md', adr('accepted', 'all', 'UI components use React.'));
    await writeDecision(
      tmpDir,
      '003-a.md',
      adr('accepted', 'all', 'Every service logs JSON to stdout.'),
    );

    const records = await readDecisions(tmpDir, CONFIG);
    const block = renderRulesBlock(records);

    assert.equal(
      block,
      [
        RULES_START_MARKER,
        '## Project rules',
        '',
        '- Every service logs JSON to stdout. ADR 003',
        '- UI components use React. ADR 007',
        RULES_END_MARKER,
      ].join('\n'),
    );
  });

  it('renders no block without an accepted system-wide ADR', async () => {
    await writeDecision(tmpDir, '003-a.md', adr('accepted', '[cli-foundation]', 'Rule A.'));
    await writeDecision(tmpDir, '004-b.md', adr('proposed', 'all', 'Rule B.'));
    await writeDecision(tmpDir, '005-c.md', adr('superseded', 'all', 'Rule C.', '006'));

    const records = await readDecisions(tmpDir, CONFIG);

    assert.equal(renderRulesBlock(records), null);
  });

  it('writes the block directly before the managed block and stays idempotent', async () => {
    await writeDecision(
      tmpDir,
      '003-a.md',
      adr('accepted', 'all', 'Every service logs JSON to stdout.'),
    );
    await writeDecision(tmpDir, '007-b.md', adr('accepted', 'all', 'UI components use React.'));

    const first = await scaffoldProject(tmpDir, { config: CONFIG });
    assert.equal(first.updatedProjectRules, true);

    const content = await readAgents(tmpDir);
    const rulesEnd = content.indexOf(RULES_END_MARKER) + RULES_END_MARKER.length;
    const managedStart = content.indexOf(OSQ_START_MARKER);
    assert.equal(content.slice(rulesEnd, managedStart), '\n\n');
    const rule3 = content.indexOf('- Every service logs JSON to stdout. ADR 003');
    const rule7 = content.indexOf('- UI components use React. ADR 007');
    assert.ok(rule3 >= 0 && rule7 > rule3);

    const second = await scaffoldProject(tmpDir, { config: CONFIG });
    assert.equal(second.updatedProjectRules, false);
    assert.equal(await readAgents(tmpDir), content);
  });

  it('drops a superseded line and adds its replacement', async () => {
    await writeDecision(
      tmpDir,
      '003-a.md',
      adr('accepted', 'all', 'Every service logs JSON to stdout.'),
    );
    await writeDecision(tmpDir, '007-b.md', adr('accepted', 'all', 'UI components use React.'));
    await scaffoldProject(tmpDir, { config: CONFIG });

    await writeDecision(
      tmpDir,
      '003-a.md',
      adr('superseded', 'all', 'Every service logs JSON to stdout.', '008'),
    );
    await writeDecision(tmpDir, '008-c.md', adr('accepted', 'all', 'Services use gRPC.'));

    const result = await scaffoldProject(tmpDir, { config: CONFIG });
    assert.equal(result.updatedProjectRules, true);

    const content = await readAgents(tmpDir);
    assert.equal(content.includes('ADR 003'), false);
    assert.ok(content.includes('- Services use gRPC. ADR 008'));
    assert.ok(content.includes('- UI components use React. ADR 007'));
    assert.ok(content.indexOf('ADR 007') < content.indexOf('ADR 008'));
  });

  it('removes the block and restores the file byte for byte when the last rule is superseded', async () => {
    await updateAgentsMd(tmpDir);
    const before = await readAgents(tmpDir);

    await writeDecision(tmpDir, '003-a.md', adr('accepted', 'all', 'Rule A.'));
    assert.equal(await writeRulesBlock(tmpDir, CONFIG), true);
    assert.ok((await readAgents(tmpDir)).includes(RULES_START_MARKER));

    await writeDecision(tmpDir, '003-a.md', adr('superseded', 'all', 'Rule A.', '008'));
    await writeDecision(tmpDir, '008-c.md', adr('proposed', 'all', 'Rule B.'));

    assert.equal(await writeRulesBlock(tmpDir, CONFIG), true);
    const after = await readAgents(tmpDir);
    assert.equal(after.includes(RULES_START_MARKER), false);
    assert.equal(after, before);
  });

  it('appends the block when AGENTS.md has no managed block', async () => {
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), '# Notes\n\nSome text.\n', 'utf8');
    await writeDecision(tmpDir, '003-a.md', adr('accepted', 'all', 'Rule A.'));

    assert.equal(await writeRulesBlock(tmpDir, CONFIG), true);

    const content = await readAgents(tmpDir);
    assert.ok(content.startsWith('# Notes\n\nSome text.\n'));
    assert.ok(content.includes(`${RULES_START_MARKER}\n## Project rules\n\n- Rule A. ADR 003\n`));
  });

  it('leaves text before and after both blocks byte-identical', async () => {
    const preamble = '# Project\n\nKeep this preamble.\n\n';
    const epilogue = '\n\nKeep this epilogue.\n';
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      `${preamble}${OSQ_START_MARKER}\n${MANAGED_AGENTS_MD_BODY}\n${OSQ_END_MARKER}${epilogue}`,
      'utf8',
    );
    await writeDecision(tmpDir, '003-a.md', adr('accepted', 'all', 'Rule A.'));

    await scaffoldProject(tmpDir, { config: CONFIG });

    const content = await readAgents(tmpDir);
    assert.ok(content.includes(RULES_START_MARKER));
    assert.ok(content.startsWith(preamble), content.slice(0, 80));
    assert.ok(content.endsWith(epilogue), content.slice(-80));
    assert.ok(content.indexOf(RULES_END_MARKER) < content.indexOf(OSQ_START_MARKER));
  });

  it('writes past the limit and reports limits.maxProjectRules', async () => {
    await writeDecision(tmpDir, '003-a.md', adr('accepted', 'all', 'Rule three.'));
    await writeDecision(tmpDir, '007-b.md', adr('accepted', 'all', 'Rule seven.'));
    await writeDecision(tmpDir, '008-c.md', adr('accepted', 'all', 'Rule eight.'));

    const config = tightConfig(2);
    await writeRulesBlock(tmpDir, config);
    assert.ok((await readAgents(tmpDir)).includes('- Rule eight. ADR 008'));

    const errors = await checkProjectRules(tmpDir, config);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /limits\.maxProjectRules/);
    assert.match(errors[0], /2/);

    const check = await checkDecisions(tmpDir, config);
    assert.equal(check?.ok, false);
    assert.match(check?.message ?? '', /limits\.maxProjectRules/);
  });
});

describe('checkProjectRules', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-rules-check-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns nothing for a project without ADRs or a block', async () => {
    assert.deepEqual(await checkProjectRules(tmpDir, CONFIG), []);
  });

  it('reports an unexpected block with no system-wide ADR', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      `${RULES_START_MARKER}\n## Project rules\n\n- orphan ADR 099\n${RULES_END_MARKER}\n`,
      'utf8',
    );

    const errors = await checkProjectRules(tmpDir, CONFIG);

    assert.equal(errors.length, 1);
    assert.match(errors[0], /osq init/);
  });

  it('reports a stale block and clears once the block matches', async () => {
    await writeDecision(tmpDir, '003-a.md', adr('accepted', 'all', 'Rule A.'));
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      `${RULES_START_MARKER}\n## Project rules\n\n- old rule ADR 003\n${RULES_END_MARKER}\n`,
      'utf8',
    );

    const stale = await checkProjectRules(tmpDir, CONFIG);
    assert.equal(stale.length, 1);
    assert.match(stale[0], /osq init/);

    await writeRulesBlock(tmpDir, CONFIG);
    assert.deepEqual(await checkProjectRules(tmpDir, CONFIG), []);
  });
});

describe('decisions doctor check', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-decisions-doctor-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('is absent when the project has neither ADR files nor a rules marker', async () => {
    assert.equal(await checkDecisions(tmpDir, CONFIG), null);
  });

  it('fails on a stale block and passes after osq init', async () => {
    await writeDecision(tmpDir, '003-a.md', adr('accepted', 'all', 'Rule A.'));
    await writeRulesBlock(tmpDir, CONFIG);
    await writeDecision(tmpDir, '003-a.md', adr('accepted', 'all', 'Rule B.'));

    const stale = await checkDecisions(tmpDir, CONFIG);
    assert.equal(stale?.ok, false);
    assert.match(stale?.message ?? '', /osq init/);

    await writeRulesBlock(tmpDir, CONFIG);
    const fixed = await checkDecisions(tmpDir, CONFIG);
    assert.equal(fixed?.ok, true);
    assert.equal(fixed?.message, '1 ADRs valid');
  });

  it('warns and passes when one decision file has no frontmatter', async () => {
    await writeLivingSpec(tmpDir, 'demo-cap');
    await writeDecision(tmpDir, '003-a.md', adr('accepted', '[demo-cap]', 'Rule A.'));
    await writeDecision(tmpDir, '004-plain.md', '# Plain markdown without frontmatter\n');

    const check = await checkDecisions(tmpDir, CONFIG);

    assert.equal(check?.ok, true);
    assert.equal(check?.warning, true);
    assert.match(check?.message ?? '', /004-plain\.md/);
  });

  it('fails on a validation error', async () => {
    await writeDecision(tmpDir, '003-a.md', adr('bogus', 'all', 'Rule A.'));

    const check = await checkDecisions(tmpDir, CONFIG);

    assert.equal(check?.ok, false);
    assert.match(check?.message ?? '', /status/);
  });

  it('appears right after managed-blocks in the doctor check list', async () => {
    await writeDecision(tmpDir, '003-a.md', adr('accepted', 'all', 'Rule A.'));
    await writeRulesBlock(tmpDir, CONFIG);

    const report = await runDoctorChecks(tmpDir, {
      loadConfig: async () => CONFIG,
      probeValidator: async () => OPENSPEC_EXPECTED_VERSION,
    });
    const names = report.checks.map((check) => check.name);
    const managedIndex = names.indexOf('managed-blocks');
    assert.equal(names[managedIndex + 1], 'decisions');
    assert.equal(report.checks.find((check) => check.name === 'decisions')?.ok, true);
  });

  it('keeps the check list unchanged without any decision surface', async () => {
    const report = await runDoctorChecks(tmpDir, {
      loadConfig: async () => CONFIG,
      probeValidator: async () => OPENSPEC_EXPECTED_VERSION,
    });

    assert.equal(
      report.checks.some((check) => check.name === 'decisions'),
      false,
    );
  });
});

describe('osq init command', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-init-rules-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('prints the project rules update line when AGENTS.md changed', async () => {
    await writeDecision(tmpDir, '003-a.md', adr('accepted', 'all', 'Rule A.'));

    const lines: string[] = [];
    const original = console.log;
    console.log = ((...args: unknown[]) => {
      lines.push(args.join(' '));
    }) as typeof console.log;
    try {
      await initCommand({ cwd: tmpDir });
    } finally {
      console.log = original;
    }

    assert.ok(lines.includes('  updated  AGENTS.md (refreshed managed block)'));
    assert.ok(lines.includes('  updated  AGENTS.md (project rules)'));
    assert.ok((await readAgents(tmpDir)).includes(RULES_START_MARKER));
  });
});
