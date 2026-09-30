import assert from 'node:assert/strict';
import os from 'node:os';
import { describe, it } from 'node:test';
import { defineConfig } from '../src/core/foundation/config.js';
import { runVerificationCommand } from '../src/core/run/verification.js';
import { runPrepare } from '../src/core/spec/approve-worktree.js';

const ROOT = os.tmpdir();
const TIMEOUT = 30;

/** The probe variables a test set, restored by `withEnv`. */
type EnvProbes = Readonly<Record<string, string>>;

/** Set probe variables on `process.env` for one test and restore them after. */
async function withEnv(vars: EnvProbes, run: () => Promise<void>): Promise<void> {
  const saved = new Map<string, string | undefined>();
  for (const name of Object.keys(vars)) saved.set(name, process.env[name]);
  for (const [name, value] of Object.entries(vars)) process.env[name] = value;
  try {
    await run();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) Reflect.deleteProperty(process.env, name);
      else process.env[name] = value;
    }
  }
}

/**
 * A `node -e` one-liner that exits 0 only when every expected variable is set
 * and every forbidden variable is absent.
 */
function probe(expect: readonly string[], forbid: readonly string[]): string {
  const checks = [
    ...expect.map((name) => `process.env[${JSON.stringify(name)}]!==undefined`),
    ...forbid.map((name) => `process.env[${JSON.stringify(name)}]===undefined`),
  ];
  return `node -e 'process.exit(${checks.join(' && ')} ? 0 : 1)'`;
}

describe('role environment of spawned commands', () => {
  it('runs a verify command with only its role environment', async () => {
    const config = defineConfig({
      confinement: { roles: { verify: { env: ['VERIFY_PROBE'] } } },
    });

    await withEnv({ VERIFY_PROBE: '1', SECRET_PROBE: '1' }, async () => {
      const result = await runVerificationCommand(
        ROOT,
        probe(['VERIFY_PROBE'], ['SECRET_PROBE']),
        TIMEOUT,
        '/change/folder',
        { config },
      );
      assert.equal(result.exitCode, 0, result.output);
    });
  });

  it('runs vcs.prepare with only the prepare role environment', async () => {
    const config = defineConfig({
      vcs: { prepare: probe(['NPM_TOKEN'], ['VERIFY_PROBE', 'SECRET_PROBE']) },
      confinement: {
        roles: {
          prepare: { env: ['NPM_TOKEN'] },
          verify: { env: ['VERIFY_PROBE'] },
        },
      },
    });

    await withEnv({ NPM_TOKEN: '1', VERIFY_PROBE: '1', SECRET_PROBE: '1' }, async () => {
      await runPrepare(ROOT, config, 'osq/verify-role-env');
    });
  });

  it('removes OSQ_CHANGE for an archived check run', async () => {
    const config = defineConfig({
      confinement: { roles: { verify: { env: ['VERIFY_PROBE'] } } },
    });

    await withEnv({ OSQ_CHANGE: '/shell/change', VERIFY_PROBE: '1' }, async () => {
      const result = await runVerificationCommand(
        ROOT,
        probe(['VERIFY_PROBE'], ['OSQ_CHANGE']),
        TIMEOUT,
        null,
        { config },
      );
      assert.equal(result.exitCode, 0, result.output);
    });
  });
});
