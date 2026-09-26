import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { diagnoseOpencode } from '../src/core/foundation/config-opencode.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { type DoctorReport, runDoctorChecks } from '../src/core/foundation/doctor.js';
import { lookupHarness } from '../src/core/foundation/harness-catalog.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { OPENSPEC_EXPECTED_VERSION } from '../src/core/spec/linter.js';
import { OpencodeAdapter } from '../src/harness/opencode/opencode.js';

const OPENCODE_PATH_KEY = 'OPENCODE_PATH';

/** A fake `opencode` that only needs to answer `--version`. */
async function writeFakeOpencode(root: string, output: string): Promise<string> {
  const bin = path.join(root, 'fake-opencode.cjs');
  const script = `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(output)} + '\\n');\n`;
  await fs.writeFile(bin, script, { mode: 0o755 });
  return bin;
}

function opencodeConfig(bin: string): OsqConfig {
  return defineConfig({ harness: 'opencode', opencode: { bin } });
}

function findCheck(report: DoctorReport, name: string) {
  return report.checks.find((check) => check.name === name);
}

/** Doctor against a scaffolded repo with the opencode agent file in place. */
async function runOpencodeDoctor(root: string, config: OsqConfig): Promise<DoctorReport> {
  await new OpencodeAdapter().setup(root, config);
  return runDoctorChecks(root, {
    loadConfig: async () => config,
    probeValidator: async () => OPENSPEC_EXPECTED_VERSION,
  });
}

describe('OpenCode doctor diagnostics', () => {
  let tmpDir: string;
  let savedOpencodePath: string | undefined;

  beforeEach(async () => {
    savedOpencodePath = process.env[OPENCODE_PATH_KEY];
    Reflect.deleteProperty(process.env, OPENCODE_PATH_KEY);
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-opencode-doctor-'));
    await scaffoldProject(tmpDir);
  });

  afterEach(async () => {
    if (savedOpencodePath === undefined) Reflect.deleteProperty(process.env, OPENCODE_PATH_KEY);
    else process.env[OPENCODE_PATH_KEY] = savedOpencodePath;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('declares the version diagnose hook on the opencode catalog entry', () => {
    assert.equal(lookupHarness('opencode').diagnose, diagnoseOpencode);
  });

  it('passes inside the tested range naming the extracted version', async () => {
    const bin = await writeFakeOpencode(tmpDir, 'opencode v2.0.18');
    const report = await runOpencodeDoctor(tmpDir, opencodeConfig(bin));

    const check = findCheck(report, 'harness-version');
    assert.equal(check?.ok, true);
    assert.equal(check?.warning, undefined);
    assert.equal(check?.message, 'opencode 2.0.18 (tested >=2.0.0 <3.0.0)');
    assert.equal(report.ok, true, JSON.stringify(report.checks, null, 2));
  });

  it('fails below 2.0.0 naming the unsupported version and exits 1', async () => {
    const bin = await writeFakeOpencode(tmpDir, '1.14.3');
    const report = await runOpencodeDoctor(tmpDir, opencodeConfig(bin));

    const check = findCheck(report, 'harness-version');
    assert.equal(check?.ok, false);
    assert.equal(
      check?.message,
      'opencode 1.14.3 is not supported; the opencode adapter needs opencode 2 (tested >=2.0.0 <3.0.0)',
    );
    assert.equal(report.ok, false);
  });

  it('warns without failing at 3.0.0 or above', async () => {
    const bin = await writeFakeOpencode(tmpDir, 'opencode v3.0.0');
    const report = await runOpencodeDoctor(tmpDir, opencodeConfig(bin));

    const check = findCheck(report, 'harness-version');
    assert.equal(check?.ok, true);
    assert.equal(check?.warning, true);
    assert.equal(check?.message, 'opencode 3.0.0 is outside the tested range >=2.0.0 <3.0.0');
    assert.equal(report.ok, true, JSON.stringify(report.checks, null, 2));
  });

  it('warns without failing when no version can be read', async () => {
    const bin = await writeFakeOpencode(tmpDir, 'unknown build');
    const report = await runOpencodeDoctor(tmpDir, opencodeConfig(bin));

    const check = findCheck(report, 'harness-version');
    assert.equal(check?.ok, true);
    assert.equal(check?.warning, true);
    assert.equal(
      check?.message,
      'opencode unknown build is outside the tested range >=2.0.0 <3.0.0',
    );
    assert.equal(report.ok, true, JSON.stringify(report.checks, null, 2));
  });
});
