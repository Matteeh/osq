import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { doctorCommand } from '../src/cli/doctor.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { runDoctorChecks } from '../src/core/foundation/doctor.js';
import {
  MANAGED_AGENTS_MD_BODY,
  MANAGED_CLAUDE_PLAN_COMMAND,
  MANAGED_PLANNER_BLOCK,
} from '../src/core/foundation/init.js';
import { type LintLogger, lintChangeFolder } from '../src/core/spec/linter.js';
import {
  OPENSPEC_EXPECTED_VERSION,
  type OpenSpecVersionStatus,
  assessOpenSpecVersion,
  classifyOpenSpecVersion,
  readOpenSpecPeerRange,
} from '../src/core/spec/openspec-version.js';

/** A version inside the declared `>=1.13.1 <2` peer range that is not the pin. */
const IN_RANGE_VERSION = '1.14.0';

/** A version outside the declared peer range. */
const OUT_OF_RANGE_VERSION = '9.9.9';

interface RecordingLogger extends LintLogger {
  readonly entries: Array<{ level: 'info' | 'verbose' | 'warn'; message: string }>;
}

function createRecordingLogger(): RecordingLogger {
  const entries: RecordingLogger['entries'] = [];
  return {
    entries,
    info: (message) => entries.push({ level: 'info', message }),
    verbose: (message) => entries.push({ level: 'verbose', message }),
    warn: (message) => entries.push({ level: 'warn', message }),
  };
}

async function writeHealthyRepo(root: string): Promise<void> {
  await fs.mkdir(path.join(root, 'openspec', 'changes', 'archive'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'osq.config.ts'),
    "export default { harness: 'mock' };\n",
    'utf8',
  );
  await fs.writeFile(
    path.join(root, 'AGENTS.md'),
    `# Instructions\n\n${MANAGED_AGENTS_MD_BODY}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(root, 'PLANNER.md'),
    `# Instructions\n\n${MANAGED_PLANNER_BLOCK}\n`,
    'utf8',
  );
  const commandDir = path.join(root, '.claude', 'commands');
  await fs.mkdir(commandDir, { recursive: true });
  await fs.writeFile(
    path.join(commandDir, 'osq-plan.md'),
    `# Plan a change with osq\n\n${MANAGED_CLAUDE_PLAN_COMMAND}\n`,
    'utf8',
  );
}

/** Installs a project-local `openspec` binary and manifest at `version`. */
async function installFakeValidator(root: string, version: string): Promise<void> {
  const binDir = path.join(root, 'node_modules', '.bin');
  await fs.mkdir(binDir, { recursive: true });
  const script = `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  process.stdout.write(${JSON.stringify(version)});
  process.exit(0);
}
process.stdout.write('{}');
`;
  await fs.writeFile(path.join(binDir, 'openspec'), script, { mode: 0o755 });

  const manifestDir = path.join(root, 'node_modules', '@fission-ai', 'openspec');
  await fs.mkdir(manifestDir, { recursive: true });
  await fs.writeFile(
    path.join(manifestDir, 'package.json'),
    JSON.stringify({ name: '@fission-ai/openspec', version }),
    'utf8',
  );
}

const PROPOSAL = `---
title: Peer range validator
depends_on: []
features:
  reads: []
verify: node verify.cjs
---
## Goal

Warn on a compatible validator.

## Contract

| A | B |
|---|---|
| 1 | 2 |

## Non-goals

None.

## Surface

None.

## Delta

Warn on a compatible validator.
`;

const TASK = `---
title: In-range validator warns
verify: node verify.cjs
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] warns
`;

async function writeValidChange(root: string): Promise<string> {
  const folder = path.join(root, 'openspec', 'changes', '001-peer-range');
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folder, 'proposal.md'), PROPOSAL, 'utf8');
  await fs.writeFile(path.join(folder, 'tasks', '1.md'), TASK, 'utf8');
  await fs.writeFile(path.join(root, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  return folder;
}

describe('OpenSpec version classification', () => {
  it('classifies the pin regardless of the range', () => {
    assert.equal(classifyOpenSpecVersion(OPENSPEC_EXPECTED_VERSION, '>=1.13.1 <2'), 'pinned');
    assert.equal(classifyOpenSpecVersion(OPENSPEC_EXPECTED_VERSION, null), 'pinned');
  });

  it('applies every comparator in the range grammar', () => {
    const cases: Array<[string, string, OpenSpecVersionStatus]> = [
      ['1.13.2', '>=1.13.1 <2', 'in-range'],
      ['1.13.0', '>=1.13.1 <2', 'out-of-range'],
      ['2.0.0', '>=1.13.1 <2', 'out-of-range'],
      ['2.0.0', '>=1.13.1 <3', 'in-range'],
      ['1.13.2', '>1.13.0', 'in-range'],
      ['1.13.0', '>1.13.0', 'out-of-range'],
      ['1.13.0', '<=1.13.0', 'in-range'],
      ['1.13.0', '<1.13.2', 'in-range'],
      ['1.13.3', '=1.13.3', 'in-range'],
      ['1.13.3', '=1.13.2', 'out-of-range'],
      ['1.13.2', '>=1.13.1 <2 >=1.13.0', 'in-range'],
      ['1.13.2', '>=1.13.1 <2 >=1.13.3', 'out-of-range'],
    ];

    for (const [version, range, expected] of cases) {
      assert.equal(classifyOpenSpecVersion(version, range), expected, `${version} in ${range}`);
    }
  });

  it('treats an unreadable range as out of range', () => {
    assert.equal(classifyOpenSpecVersion('1.14.0', null), 'out-of-range');
    assert.equal(classifyOpenSpecVersion('1.14.0', ''), 'out-of-range');
    assert.equal(classifyOpenSpecVersion('1.14.0', '~1.14.0'), 'out-of-range');
    assert.equal(classifyOpenSpecVersion('1.14.0', '>=1.13.1 || <2'), 'out-of-range');
    assert.equal(classifyOpenSpecVersion('1.14.0', '>=1.13.1 <2 || <3'), 'out-of-range');
  });

  it('treats an unparseable or prerelease version as out of range', () => {
    assert.equal(classifyOpenSpecVersion('1.14', '>=1.13.1 <2'), 'out-of-range');
    assert.equal(classifyOpenSpecVersion('latest', '>=1.13.1 <2'), 'out-of-range');
    assert.equal(classifyOpenSpecVersion('1.14.0-beta.1', '>=1.13.1 <2'), 'out-of-range');
  });

  it('assesses against the range declared in osq package.json', async () => {
    const range = await readOpenSpecPeerRange();
    assert.ok(range, 'osq package.json must declare a peer range');
    assert.ok(range.includes(OPENSPEC_EXPECTED_VERSION), range);

    const pinned = await assessOpenSpecVersion(OPENSPEC_EXPECTED_VERSION);
    assert.equal(pinned.status, 'pinned');
    assert.equal(pinned.version, OPENSPEC_EXPECTED_VERSION);

    const inRange = await assessOpenSpecVersion(IN_RANGE_VERSION);
    assert.equal(inRange.status, 'in-range');
    assert.equal(inRange.version, IN_RANGE_VERSION);
    assert.equal(inRange.range, range);

    const outside = await assessOpenSpecVersion(OUT_OF_RANGE_VERSION);
    assert.equal(outside.status, 'out-of-range');

    const padded = await assessOpenSpecVersion(`  ${IN_RANGE_VERSION}\n`);
    assert.equal(padded.status, 'in-range');
    assert.equal(padded.version, IN_RANGE_VERSION);
  });
});

describe('doctor peer-range warnings', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-openspec-version-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('passes the validator check with a warning inside the peer range', async () => {
    await writeHealthyRepo(tmpDir);
    const range = await readOpenSpecPeerRange();
    assert.ok(range);

    const report = await runDoctorChecks(tmpDir, {
      probeValidator: async () => IN_RANGE_VERSION,
    });

    assert.equal(report.ok, true, JSON.stringify(report.checks));
    const check = report.checks.find((entry) => entry.name === 'validator');
    assert.equal(check?.ok, true);
    assert.equal(check?.warning, true);
    assert.equal(
      check?.message,
      `openspec version ${IN_RANGE_VERSION} differs from pinned ${OPENSPEC_EXPECTED_VERSION}; inside supported range ${range} (ADR 005)`,
    );
  });

  it('prints [warn] through doctorCommand and exits zero', async () => {
    await writeHealthyRepo(tmpDir);
    await installFakeValidator(tmpDir, IN_RANGE_VERSION);

    const lines: string[] = [];
    const codes: number[] = [];
    const report = await doctorCommand({
      cwd: tmpDir,
      stdout: (line) => lines.push(line),
      exit: (code) => codes.push(code),
    });

    assert.equal(report.ok, true, JSON.stringify(report.checks));
    assert.ok(
      lines.some((line) => line.startsWith('[warn] validator:') && line.includes('ADR 005')),
      lines.join('\n'),
    );
    assert.deepEqual(codes, []);
  });

  it('keeps the failing message outside the peer range', async () => {
    await writeHealthyRepo(tmpDir);

    const report = await runDoctorChecks(tmpDir, {
      probeValidator: async () => OUT_OF_RANGE_VERSION,
    });

    const check = report.checks.find((entry) => entry.name === 'validator');
    assert.equal(check?.ok, false);
    assert.equal(
      check?.message,
      `openspec version ${OUT_OF_RANGE_VERSION} differs from pinned ${OPENSPEC_EXPECTED_VERSION}`,
    );
  });
});

describe('lint peer-range warnings', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-openspec-lint-'));
    await installFakeValidator(tmpDir, IN_RANGE_VERSION);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('passes lint with a warning naming the version, range, and ADR 005', async () => {
    const folder = await writeValidChange(tmpDir);
    const range = await readOpenSpecPeerRange();
    assert.ok(range);
    const logger = createRecordingLogger();

    const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG, { logger });

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.ok(
      result.warnings.some(
        (warning) =>
          warning.includes(IN_RANGE_VERSION) &&
          warning.includes(range) &&
          warning.includes('ADR 005'),
      ),
      result.warnings.join('\n'),
    );
    assert.ok(
      logger.entries.some(
        (entry) => entry.level === 'info' && entry.message.includes(IN_RANGE_VERSION),
      ),
    );
  });

  it('still fails lint outside the peer range', async () => {
    const folder = await writeValidChange(tmpDir);
    await installFakeValidator(tmpDir, OUT_OF_RANGE_VERSION);

    const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some(
        (error) =>
          error.includes(OUT_OF_RANGE_VERSION) &&
          error.includes('ADR 004') &&
          error.includes('pnpm add -D @fission-ai/openspec@1.13.1'),
      ),
      result.errors.join('\n'),
    );
  });
});
