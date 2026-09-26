import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { type OsqConfig, defineConfig } from '../../src/core/foundation/config.js';
import { type DoctorReport, runDoctorChecks } from '../../src/core/foundation/doctor.js';
import { OPENSPEC_EXPECTED_VERSION } from '../../src/core/spec/linter.js';
import { createPiProject, envScope, piConfig } from './support.js';

const env = envScope([
  'OSQ_FAKE_RECORD',
  'OSQ_FAKE_PI_VERSION',
  'OSQ_FAKE_PI_AUTH_STATUS',
  'OSQ_FAKE_PI_AUTH_REASON',
  'OSQ_PI_PATH',
  'OSQ_MODEL',
]);

interface FakeRecord {
  kind?: string;
  argv?: string[];
}

async function readRecord(recordPath: string): Promise<FakeRecord | undefined> {
  return await fs
    .readFile(recordPath, 'utf8')
    .then((raw) => JSON.parse(raw) as FakeRecord)
    .catch(() => undefined);
}

function findCheck(report: DoctorReport, name: string) {
  return report.checks.find((check) => check.name === name);
}

/** Run doctor against a real scaffolded repo with the config seam injected. */
function runPiDoctor(root: string, config: OsqConfig): Promise<DoctorReport> {
  return runDoctorChecks(root, {
    loadConfig: async () => config,
    probeValidator: async () => OPENSPEC_EXPECTED_VERSION,
  });
}

describe('Pi doctor diagnostics', () => {
  afterEach(() => env.restore());

  it('appends catalog diagnoses after a passing harness check', async () => {
    env.save();
    const { root } = await createPiProject('pi-doctor-hook');
    try {
      const report = await runPiDoctor(root, piConfig({ provider: 'deepseek' }));
      const names = report.checks.map((check) => check.name);
      assert.deepEqual(names, [
        'config',
        'harness',
        'harness-version',
        'harness-auth',
        'managed-blocks',
        'locks',
        'archives',
        'done-markers',
        'validator',
        'git',
      ]);
      assert.equal(report.checks[1]?.name, 'harness');
      assert.equal(report.checks[1]?.ok, true);
      assert.equal(findCheck(report, 'harness-version')?.ok, true);
      assert.equal(findCheck(report, 'harness-auth')?.ok, true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('adds no extra checks for a catalog entry without a diagnose hook', async () => {
    env.save();
    const { root } = await createPiProject('pi-doctor-nohook');
    try {
      const report = await runPiDoctor(root, defineConfig({ harness: 'mock' }));
      assert.deepEqual(
        report.checks.map((check) => check.name),
        [
          'config',
          'harness',
          'managed-blocks',
          'locks',
          'archives',
          'done-markers',
          'validator',
          'git',
        ],
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('passes the version check silently inside the tested range', async () => {
    env.save();
    const { root } = await createPiProject('pi-doctor-version-ok');
    try {
      env.set({ OSQ_FAKE_PI_VERSION: '0.87.1' });
      const report = await runPiDoctor(root, piConfig());

      const check = findCheck(report, 'harness-version');
      assert.equal(check?.ok, true);
      assert.equal(check?.warning, undefined);
      assert.match(check?.message ?? '', /0\.87\.1/);
      assert.equal(report.ok, true, JSON.stringify(report.checks, null, 2));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('warns without failing on an untested version', async () => {
    env.save();
    const { root } = await createPiProject('pi-doctor-version-warn');
    try {
      env.set({ OSQ_FAKE_PI_VERSION: '0.88.0' });
      const report = await runPiDoctor(root, piConfig());

      const check = findCheck(report, 'harness-version');
      assert.equal(check?.ok, true);
      assert.equal(check?.warning, true);
      assert.match(check?.message ?? '', /0\.88\.0/);
      assert.match(check?.message ?? '', />=0\.87\.0 <0\.88\.0/);
      assert.equal(report.ok, true, JSON.stringify(report.checks, null, 2));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('fails the auth check naming the provider and reason when credentials are not ready', async () => {
    env.save();
    const { root } = await createPiProject('pi-doctor-auth-fail');
    try {
      env.set({
        OSQ_FAKE_PI_AUTH_STATUS: 'not_ready',
        OSQ_FAKE_PI_AUTH_REASON: 'credentials_not_configured',
      });
      const report = await runPiDoctor(root, piConfig({ provider: 'deepseek' }));

      const check = findCheck(report, 'harness-auth');
      assert.equal(check?.ok, false);
      assert.match(check?.message ?? '', /deepseek/);
      assert.match(check?.message ?? '', /credentials_not_configured/);
      assert.equal(report.ok, false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('passes the auth check when the provider reports ready', async () => {
    env.save();
    const { root } = await createPiProject('pi-doctor-auth-ready');
    try {
      const report = await runPiDoctor(root, piConfig({ provider: 'deepseek' }));

      const check = findCheck(report, 'harness-auth');
      assert.equal(check?.ok, true);
      assert.match(check?.message ?? '', /deepseek/);
      assert.equal(report.ok, true, JSON.stringify(report.checks, null, 2));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('runs no auth check without a provider', async () => {
    env.save();
    const { root } = await createPiProject('pi-doctor-auth-none');
    const record = path.join(root, 'record.json');
    try {
      env.set({ OSQ_FAKE_RECORD: record });
      const report = await runPiDoctor(root, piConfig());

      assert.equal(findCheck(report, 'harness-auth'), undefined);
      const recorded = await readRecord(record);
      assert.equal(recorded?.kind, 'version', JSON.stringify(recorded));
      assert.equal(recorded?.argv?.includes('auth') ?? false, false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
