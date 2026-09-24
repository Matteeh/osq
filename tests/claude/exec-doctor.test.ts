import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { afterEach, describe, it } from 'node:test';
import type { OsqConfig } from '../../src/core/foundation/config.js';
import { type DoctorReport, runDoctorChecks } from '../../src/core/foundation/doctor.js';
import { OPENSPEC_EXPECTED_VERSION } from '../../src/core/spec/linter.js';
import { preflightClaude } from '../../src/harness/claude/claude-exec.js';
import { claudeConfig, createClaudeProject, envScope } from './exec-support.js';

const env = envScope(['OSQ_FAKE_CLAUDE_VERSION', 'OSQ_FAKE_CLAUDE_RECORD']);

function findCheck(report: DoctorReport, name: string) {
  return report.checks.find((check) => check.name === name);
}

/** Run doctor against a real scaffolded repo with the config seam injected. */
function runClaudeDoctor(root: string, config: OsqConfig): Promise<DoctorReport> {
  return runDoctorChecks(root, {
    loadConfig: async () => config,
    probeValidator: async () => OPENSPEC_EXPECTED_VERSION,
  });
}

describe('Claude doctor diagnostics and preflight', () => {
  afterEach(() => env.restore());

  it('fails harness-version below the minimum, naming the version and the minimum', async () => {
    env.save();
    const { root } = await createClaudeProject('claude-doctor-old');
    try {
      env.set({ OSQ_FAKE_CLAUDE_VERSION: '2.1.200 (Claude Code)' });
      const report = await runClaudeDoctor(root, claudeConfig());

      const check = findCheck(report, 'harness-version');
      assert.equal(check?.ok, false);
      assert.match(check?.message ?? '', /2\.1\.200/);
      assert.match(check?.message ?? '', /2\.1\.278/);
      assert.equal(report.ok, false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('passes harness-version at the minimum and reports containment', async () => {
    env.save();
    const { root } = await createClaudeProject('claude-doctor-min');
    try {
      env.set({ OSQ_FAKE_CLAUDE_VERSION: '2.1.278 (Claude Code)' });
      const report = await runClaudeDoctor(root, claudeConfig({ sandbox: true }));

      assert.equal(findCheck(report, 'harness-version')?.ok, true);
      const containment = findCheck(report, 'harness-containment');
      assert.equal(containment?.ok, true);
      assert.match(containment?.message ?? '', /Bash sandboxed with no network/);
      assert.match(containment?.message ?? '', /file tools confined to the project/);
      assert.match(containment?.message ?? '', /git denied/);
      assert.equal(report.ok, true, JSON.stringify(report.checks, null, 2));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('reports unconfined Bash without the sandbox', async () => {
    env.save();
    const { root } = await createClaudeProject('claude-doctor-nosandbox');
    try {
      env.set({ OSQ_FAKE_CLAUDE_VERSION: '2.1.278 (Claude Code)' });
      const report = await runClaudeDoctor(root, claudeConfig());
      const containment = findCheck(report, 'harness-containment');
      assert.equal(containment?.ok, true);
      assert.match(containment?.message ?? '', /Bash unconfined with open network/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('fails preflight before any task spawns on the same version condition', async () => {
    env.save();
    const { root } = await createClaudeProject('claude-preflight');
    try {
      env.set({ OSQ_FAKE_CLAUDE_VERSION: '2.1.200 (Claude Code)' });
      await assert.rejects(
        () => preflightClaude(root, claudeConfig()),
        /2\.1\.200[\s\S]*2\.1\.278/,
      );

      env.set({ OSQ_FAKE_CLAUDE_VERSION: '2.1.278 (Claude Code)' });
      await preflightClaude(root, claudeConfig());
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
