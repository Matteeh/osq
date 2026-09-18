import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { doctorCommand } from '../src/cli/doctor.js';
import { type OsqConfig, loadConfig } from '../src/core/config.js';
import { runDoctorChecks } from '../src/core/doctor.js';
import { OSQ_END_MARKER, OSQ_START_MARKER } from '../src/core/init.js';
import { OPENSPEC_EXPECTED_VERSION } from '../src/core/linter.js';

function managedBlock(body: string): string {
  return `# Instructions\n\n${OSQ_START_MARKER}\n${body}\n${OSQ_END_MARKER}\n`;
}

async function writeHealthyRepo(root: string): Promise<void> {
  await fs.mkdir(path.join(root, 'openspec', 'changes', 'archive'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'osq.config.ts'),
    "export default { harness: 'mock' };\n",
    'utf8',
  );
  await fs.writeFile(path.join(root, 'AGENTS.md'), managedBlock('agents'), 'utf8');
  await fs.writeFile(path.join(root, 'PLANNER.md'), managedBlock('planner'), 'utf8');
}

async function writeArchive(
  root: string,
  name: string,
  { proposal = true, tasks = true }: { proposal?: boolean; tasks?: boolean } = {},
): Promise<void> {
  const archiveDir = path.join(root, 'openspec', 'changes', 'archive', name);
  await fs.mkdir(archiveDir, { recursive: true });
  if (proposal) {
    await fs.writeFile(path.join(archiveDir, 'proposal.md'), '# Proposal\n', 'utf8');
  }
  if (tasks) {
    await fs.mkdir(path.join(archiveDir, 'tasks'), { recursive: true });
  }
}

async function writeLock(root: string, change: string, task: string, pid: number): Promise<void> {
  const lockDir = path.join(root, 'openspec', 'changes', change, '.run', 'running');
  await fs.mkdir(lockDir, { recursive: true });
  await fs.writeFile(
    path.join(lockDir, `${task}.pid`),
    JSON.stringify({ pid, startedAt: 0 }),
    'utf8',
  );
}

function findCheck(report: { checks: Array<{ name: string }> }, name: string) {
  return report.checks.find((check) => check.name === name) as
    | { name: string; ok: boolean; message: string }
    | undefined;
}

/** Installs a stub `openspec` binary so the default probe can run hermetically. */
async function installFakeValidator(
  root: string,
  version: string = OPENSPEC_EXPECTED_VERSION,
): Promise<void> {
  const binDir = path.join(root, 'node_modules', '.bin');
  await fs.mkdir(binDir, { recursive: true });
  const script = `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(version)});\n`;
  await fs.writeFile(path.join(binDir, 'openspec'), script, { mode: 0o755 });
}

describe('runDoctorChecks', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-doctor-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('passes all six checks for a healthy repository', async () => {
    await writeHealthyRepo(tmpDir);

    const report = await runDoctorChecks(tmpDir, {
      probeValidator: async () => OPENSPEC_EXPECTED_VERSION,
    });

    assert.equal(report.ok, true);
    assert.deepEqual(
      report.checks.map((check) => check.name),
      ['config', 'harness', 'managed-blocks', 'locks', 'archives', 'validator'],
    );
    assert.ok(
      report.checks.every((check) => check.ok),
      JSON.stringify(report.checks),
    );
  });

  it('passes the validator check with the pinned version', async () => {
    await writeHealthyRepo(tmpDir);

    const report = await runDoctorChecks(tmpDir, {
      probeValidator: async () => `  ${OPENSPEC_EXPECTED_VERSION}\n`,
    });

    const check = findCheck(report, 'validator');
    assert.equal(check?.ok, true);
    assert.equal(check?.message, `pinned ${OPENSPEC_EXPECTED_VERSION}`);
    assert.equal(report.ok, true);
  });

  it('fails the validator check on version drift', async () => {
    await writeHealthyRepo(tmpDir);

    const report = await runDoctorChecks(tmpDir, {
      probeValidator: async () => '9.9.9',
    });

    const check = findCheck(report, 'validator');
    assert.equal(check?.ok, false);
    assert.equal(
      check?.message,
      `openspec version 9.9.9 differs from pinned ${OPENSPEC_EXPECTED_VERSION}`,
    );
    assert.equal(report.ok, false);
  });

  it('fails the validator check when the binary is unavailable', async () => {
    await writeHealthyRepo(tmpDir);

    const report = await runDoctorChecks(tmpDir, {
      probeValidator: async () => {
        throw new Error('spawn openspec ENOENT');
      },
    });

    const check = findCheck(report, 'validator');
    assert.equal(check?.ok, false);
    assert.match(check?.message ?? '', /^binary unavailable: openspec \(/);
    assert.match(check?.message ?? '', /ENOENT/);
    assert.equal(report.ok, false);
  });

  it('fails the config check when config properties are invalid', async () => {
    await writeHealthyRepo(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'osq.config.ts'), 'export default { harness: 42 };\n');

    const report = await runDoctorChecks(tmpDir);

    assert.equal(findCheck(report, 'config')?.ok, false);
    assert.equal(report.ok, false);
  });

  it('fails the config check when the loader throws', async () => {
    await writeHealthyRepo(tmpDir);

    const report = await runDoctorChecks(tmpDir, {
      loadConfig: async () => {
        throw new Error('boom');
      },
    });

    const check = findCheck(report, 'config');
    assert.equal(check?.ok, false);
    assert.match(check?.message ?? '', /boom/);
  });

  it('fails the config check when openspecRoot is not a string', async () => {
    await writeHealthyRepo(tmpDir);
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      'export default { paths: { openspecRoot: 42 } };\n',
    );

    const report = await runDoctorChecks(tmpDir);

    assert.equal(findCheck(report, 'config')?.ok, false);
    assert.equal(report.ok, false);
  });

  it('fails the harness check when the configured binary is unavailable', async () => {
    await writeHealthyRepo(tmpDir);
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      "export default { harness: 'opencode', opencode: { bin: 'osq-missing-bin-xyz' } };\n",
    );

    const report = await runDoctorChecks(tmpDir);

    const check = findCheck(report, 'harness');
    assert.equal(check?.ok, false);
    assert.match(check?.message ?? '', /osq-missing-bin-xyz/);
  });

  it('fails the managed-blocks check when PLANNER.md lacks a managed block', async () => {
    await writeHealthyRepo(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'PLANNER.md'), '# Planning\n\nNo markers here.\n');

    const report = await runDoctorChecks(tmpDir);

    const check = findCheck(report, 'managed-blocks');
    assert.equal(check?.ok, false);
    assert.match(check?.message ?? '', /PLANNER\.md/);
  });

  it('fails the managed-blocks check on a partial marker pair', async () => {
    await writeHealthyRepo(tmpDir);
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      `# Instructions\n\n${OSQ_START_MARKER}\nunterminated\n`,
    );

    const report = await runDoctorChecks(tmpDir);

    assert.equal(findCheck(report, 'managed-blocks')?.ok, false);
  });

  it('fails the locks check when an orphaned lock exists', async () => {
    await writeHealthyRepo(tmpDir);
    await writeLock(tmpDir, 'demo-change', '1', 999_999_999);

    const report = await runDoctorChecks(tmpDir);

    const check = findCheck(report, 'locks');
    assert.equal(check?.ok, false);
    assert.match(check?.message ?? '', /1\.pid/);
  });

  it('passes the locks check when the recorded pid is alive', async () => {
    await writeHealthyRepo(tmpDir);
    await writeLock(tmpDir, 'demo-change', '1', process.pid);

    const report = await runDoctorChecks(tmpDir);

    assert.equal(findCheck(report, 'locks')?.ok, true);
  });

  it('fails the archives check when an archived change is corrupt', async () => {
    await writeHealthyRepo(tmpDir);
    await writeArchive(tmpDir, 'broken-change', { proposal: false, tasks: false });

    const report = await runDoctorChecks(tmpDir);

    const check = findCheck(report, 'archives');
    assert.equal(check?.ok, false);
    assert.match(check?.message ?? '', /broken-change/);
  });

  it('passes the archives check when archived changes are complete', async () => {
    await writeHealthyRepo(tmpDir);
    await writeArchive(tmpDir, 'good-change');

    const report = await runDoctorChecks(tmpDir);

    assert.equal(findCheck(report, 'archives')?.ok, true);
  });

  it('ignores legacy specs/archive contents when checking canonical archives', async () => {
    await writeHealthyRepo(tmpDir);
    // A corrupt archive under the removed legacy root must not be inspected.
    await fs.mkdir(path.join(tmpDir, 'specs', 'archive', 'legacy-broken'), { recursive: true });

    const report = await runDoctorChecks(tmpDir);

    assert.equal(findCheck(report, 'archives')?.ok, true);
  });
});

describe('doctorCommand', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-doctor-cli-'));
    await writeHealthyRepo(tmpDir);
    await installFakeValidator(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('prints one line per check and exits non-zero only on failure', async () => {
    const lines: string[] = [];
    const codes: number[] = [];

    const report = await doctorCommand({
      cwd: tmpDir,
      stdout: (line) => lines.push(line),
      exit: (code) => codes.push(code),
    });

    assert.equal(report.checks.length, 6);
    assert.equal(lines.length, 6);
    assert.ok(lines.every((line) => line.startsWith('[ok]')));
    assert.equal(codes.length, 0);

    await fs.writeFile(path.join(tmpDir, 'PLANNER.md'), '# no markers\n');

    const failLines: string[] = [];
    await doctorCommand({
      cwd: tmpDir,
      stdout: (line) => failLines.push(line),
      exit: (code) => codes.push(code),
    });

    assert.ok(failLines.some((line) => line.startsWith('[fail]')));
    assert.deepEqual(codes, [1]);
  });
});

function resolveActiveBin(config: OsqConfig): string | null {
  if (config.harness === 'mock') return null;
  if (config.harness === 'agy') return process.env.AGY_PATH ?? 'agy';
  if (config.harness === 'opencode') {
    return process.env.OPENCODE_PATH ?? config.opencode?.bin ?? 'opencode';
  }
  return config.harness;
}

function isBinAvailable(bin: string | null): boolean {
  if (!bin) return true;
  try {
    execFileSync(bin, ['--version'], { timeout: 10_000, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function isValidatorAvailable(): boolean {
  const local = path.join(process.cwd(), 'node_modules', '.bin', 'openspec');
  try {
    execFileSync(local, ['--version'], { timeout: 10_000, stdio: 'ignore' });
    return true;
  } catch {}
  try {
    execFileSync('openspec', ['--version'], { timeout: 10_000, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const activeConfig = await loadConfig(process.cwd());

function validatorSkipReason(): string | false {
  if (!isValidatorAvailable()) return 'local openspec validator is unavailable';
  if (!isBinAvailable(resolveActiveBin(activeConfig))) {
    return 'configured harness binary is unavailable';
  }
  return false;
}

const activeCheckoutSkip = validatorSkipReason();

describe('active repository checkout', () => {
  it('passes all checks on the osq repository itself', { skip: activeCheckoutSkip }, async () => {
    const report = await runDoctorChecks(process.cwd());
    assert.equal(report.ok, true, JSON.stringify(report.checks, null, 2));
  });
});
