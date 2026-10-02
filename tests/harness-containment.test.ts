import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import {
  type DoctorCheckResult,
  type DoctorReport,
  runDoctorChecks,
} from '../src/core/foundation/doctor.js';
import { OPENSPEC_EXPECTED_VERSION } from '../src/core/spec/linter.js';
import { envScope, piConfig } from './pi/support.js';

const env = envScope([
  'AGY_PATH',
  'OSQ_FAKE_PI_VERSION',
  'OSQ_FAKE_PI_AUTH_STATUS',
  'OSQ_FAKE_PI_AUTH_REASON',
]);

const AGY = 'agy';
const CODEX = 'codex';
const OPENCODE = 'opencode';
const PI = 'pi';
const CLAUDE = 'claude';

let tmpDir = '';

beforeEach(async () => {
  env.save();
  process.env.AGY_PATH = '/nonexistent/agy';
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-harness-containment-'));
});

afterEach(async () => {
  env.restore();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/** Drive doctor hermetically through the config and validator seams. */
function run(config: OsqConfig): Promise<DoctorReport> {
  return runDoctorChecks(tmpDir, {
    loadConfig: async () => config,
    probeValidator: async () => OPENSPEC_EXPECTED_VERSION,
  });
}

function find(report: DoctorReport, name: string): DoctorCheckResult | undefined {
  return report.checks.find((check) => check.name === name);
}

function containment(report: DoctorReport): DoctorCheckResult {
  const check = find(report, 'harness-containment');
  assert.ok(check, `missing harness-containment: ${report.checks.map((c) => c.name).join(', ')}`);
  return check;
}

function names(report: DoctorReport): string[] {
  return report.checks.map((check) => check.name);
}

describe('harness containment report', () => {
  it('reports the Codex sandbox right after the harness check', async () => {
    const report = await run(
      defineConfig({ harness: CODEX, codex: { bin: '/nonexistent/codex' } }),
    );

    const check = containment(report);
    assert.equal(check.ok, true);
    assert.equal(check.warning, undefined);
    assert.equal(
      check.message,
      'workspace-write sandbox: writes confined to the project, .git read-only, no network',
    );
    assert.equal(names(report)[1], 'harness');
    assert.equal(names(report)[2], 'harness-containment');
  });

  it('reports no agent process for mock', async () => {
    const check = containment(await run(defineConfig({ harness: 'mock' })));

    assert.equal(check.ok, true);
    assert.equal(check.warning, undefined);
    assert.equal(check.message, 'no agent process');
  });

  it('reports that Pi confines nothing', async () => {
    const check = containment(
      await run(defineConfig({ harness: PI, pi: { bin: '/nonexistent/pi' } })),
    );

    assert.equal(check.ok, true);
    assert.equal(
      check.message,
      'nothing confines the agent: no permission prompts, no sandbox, open network',
    );
  });

  it('fails for agy without the bypass, naming the setting and failing the report', async () => {
    const report = await run(defineConfig({ harness: AGY }));

    const check = containment(report);
    assert.equal(check.ok, false);
    assert.equal(
      check.message,
      'agy asks before every tool call and a headless task cannot answer; set agy.dangerouslySkipPermissions: true to accept that, or choose another harness',
    );
    assert.equal(report.ok, false);
  });

  it('warns for agy with the bypass on', async () => {
    const check = containment(
      await run(defineConfig({ harness: AGY, agy: { dangerouslySkipPermissions: true } })),
    );

    assert.equal(check.ok, true);
    assert.equal(check.warning, true);
    assert.equal(
      check.message,
      'agy.dangerouslySkipPermissions is true: agy approves every tool call, so nothing stops git, network tools, or sudo',
    );
  });

  it('reports the osq-coder denials for opencode', async () => {
    const check = containment(
      await run(defineConfig({ harness: OPENCODE, opencode: { bin: '/nonexistent/opencode' } })),
    );

    assert.equal(check.ok, true);
    assert.equal(check.warning, undefined);
    assert.equal(
      check.message,
      'osq-coder agent denies git, curl, wget, ssh, scp, sudo, and web tools; shell unconfined with open network',
    );
  });

  it('warns when opencode selects another agent', async () => {
    const check = containment(
      await run(
        defineConfig({
          harness: OPENCODE,
          opencode: { bin: '/nonexistent/opencode', agent: 'build' },
        }),
      ),
    );

    assert.equal(check.ok, true);
    assert.equal(check.warning, true);
    assert.equal(
      check.message,
      "opencode.agent is build, not osq-coder: that agent's own permissions apply, not osq's denials",
    );
  });

  it('reports Claude containment for both sandbox settings', async () => {
    const unconfined = containment(
      await run(defineConfig({ harness: CLAUDE, claude: { bin: '/nonexistent/claude' } })),
    );
    assert.equal(unconfined.ok, true);
    assert.equal(
      unconfined.message,
      'file tools confined to the project; git denied; Bash unconfined with open network',
    );

    const sandboxed = containment(
      await run(
        defineConfig({
          harness: CLAUDE,
          claude: { bin: '/nonexistent/claude', sandbox: true },
        }),
      ),
    );
    assert.equal(sandboxed.ok, true);
    assert.equal(
      sandboxed.message,
      'file tools confined to the project; git denied; Bash sandboxed with no network',
    );
  });

  it('puts containment after Pi diagnoses and before the next checks', async () => {
    const report = await run(piConfig({ provider: 'deepseek' }));

    assert.deepEqual(names(report).slice(0, 6), [
      'config',
      'harness',
      'harness-version',
      'harness-auth',
      'harness-containment',
      'managed-blocks',
    ]);
    assert.equal(containment(report).ok, true);
  });
});
