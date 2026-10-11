import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { afterEach, describe, it } from 'node:test';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { type DoctorReport, runDoctorChecks } from '../src/core/foundation/doctor.js';
import { OPENSPEC_EXPECTED_VERSION } from '../src/core/spec/linter.js';
import { FAKE_CLAUDE, createClaudeProject, envScope } from './claude/exec-support.js';

const env = envScope(['OSQ_FAKE_CLAUDE_VERSION']);

const VALIDATOR = { harness: 'claude', model: 'claude-opus-5-5' } as const;

/** Executor `mock`, validator `claude` on the fake binary. */
function validatorConfig(bin: string): OsqConfig {
  return defineConfig({ harness: 'mock', claude: { bin }, validator: VALIDATOR });
}

function findCheck(report: DoctorReport, name: string) {
  return report.checks.find((check) => check.name === name);
}

function validatorHarnessChecks(report: DoctorReport) {
  return report.checks.filter((check) => check.name.startsWith('validator-harness'));
}

function runDoctor(root: string, config: OsqConfig): Promise<DoctorReport> {
  return runDoctorChecks(root, {
    loadConfig: async () => config,
    probeValidator: async () => OPENSPEC_EXPECTED_VERSION,
  });
}

describe('validator harness doctor checks', () => {
  afterEach(() => env.restore());

  it('fails validator-harness-version below the floor and keeps validator-model last', async () => {
    env.save();
    const { root } = await createClaudeProject('validator-harness-old');
    try {
      env.set({ OSQ_FAKE_CLAUDE_VERSION: '2.1.200 (Claude Code)' });
      const report = await runDoctor(root, validatorConfig(FAKE_CLAUDE));

      assert.equal(findCheck(report, 'validator-harness')?.ok, true);
      const version = findCheck(report, 'validator-harness-version');
      assert.equal(version?.ok, false);
      assert.match(version?.message ?? '', /2\.1\.200/);
      assert.match(version?.message ?? '', /2\.1\.278/);
      assert.equal(report.checks.at(-1)?.name, 'validator-model');
      assert.equal(report.ok, false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('passes the harness and version checks right before validator-model at the floor', async () => {
    env.save();
    const { root } = await createClaudeProject('validator-harness-floor');
    try {
      env.set({ OSQ_FAKE_CLAUDE_VERSION: '2.1.278 (Claude Code)' });
      const report = await runDoctor(root, validatorConfig(FAKE_CLAUDE));

      const names = report.checks.map((check) => check.name);
      const harnessIndex = names.indexOf('validator-harness');
      assert.equal(findCheck(report, 'validator-harness')?.ok, true);
      assert.equal(findCheck(report, 'validator-harness-version')?.ok, true);
      assert.equal(names[harnessIndex + 1], 'validator-harness-version');
      assert.equal(names[harnessIndex + 2], 'validator-model');
      assert.equal(report.ok, true, JSON.stringify(report.checks, null, 2));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('fails validator-harness for a missing binary and adds no version check', async () => {
    env.save();
    const { root } = await createClaudeProject('validator-harness-missing');
    try {
      const report = await runDoctor(root, validatorConfig('/nonexistent/osq-claude-xyz'));

      const harness = findCheck(report, 'validator-harness');
      assert.equal(harness?.ok, false);
      assert.match(harness?.message ?? '', /^binary unavailable: /);
      assert.equal(findCheck(report, 'validator-harness-version'), undefined);
      assert.equal(report.ok, false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('adds no validator-harness check when the validator is on the executor harness', async () => {
    env.save();
    const { root } = await createClaudeProject('validator-harness-same');
    try {
      env.set({ OSQ_FAKE_CLAUDE_VERSION: '2.1.278 (Claude Code)' });
      const sameHarness = defineConfig({
        harness: 'claude',
        claude: { bin: FAKE_CLAUDE, model: 'claude-sonnet-5-5' },
        validator: { harness: 'claude', model: 'claude-opus-5-5' },
      });
      const configs: OsqConfig[] = [
        sameHarness,
        defineConfig({ harness: 'mock', validator: { enabled: false } }),
        defineConfig({ harness: 'mock' }),
      ];

      for (const config of configs) {
        const report = await runDoctor(root, config);
        assert.deepEqual(validatorHarnessChecks(report), []);
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
