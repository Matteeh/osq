import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ConfigLoadError, DEFAULT_CONFIG, loadConfig } from '../src/core/foundation/config.js';
import { runDoctorChecks } from '../src/core/foundation/doctor.js';
import { scaffoldProject } from '../src/core/foundation/init.js';

const BROKEN_VALIDATION = `import { defineConfig } from '@matteeh/osq';

export default defineConfig({ vcs: { author: 'osq' } });
`;

const VALIDATION_MESSAGE = 'vcs.author must look like "Name <email>"';

async function writeConfig(root: string, contents: string): Promise<string> {
  const file = path.join(root, 'osq.config.ts');
  await fs.writeFile(file, contents, 'utf8');
  return file;
}

/** Run `body` with `OSQ_HARNESS` unset, restoring the prior value afterwards. */
async function withoutHarnessEnv<T>(body: () => Promise<T>): Promise<T> {
  const previous = process.env.OSQ_HARNESS;
  Reflect.deleteProperty(process.env, 'OSQ_HARNESS');
  try {
    return await body();
  } finally {
    if (previous === undefined) Reflect.deleteProperty(process.env, 'OSQ_HARNESS');
    else process.env.OSQ_HARNESS = previous;
  }
}

describe('config load errors', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-config-errors-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('rejects with a ConfigLoadError naming the file when validation fails', async () => {
    const file = await writeConfig(tmpDir, BROKEN_VALIDATION);

    await assert.rejects(loadConfig(tmpDir), (err: unknown) => {
      assert.ok(err instanceof ConfigLoadError, `not a ConfigLoadError: ${String(err)}`);
      assert.equal(err.message, `Failed to load ${file}: ${VALIDATION_MESSAGE}`);
      return true;
    });
  });

  it('rejects with a ConfigLoadError naming the file when the import fails', async () => {
    const file = await writeConfig(tmpDir, 'export default {;\n');

    await assert.rejects(loadConfig(tmpDir), (err: unknown) => {
      assert.ok(err instanceof ConfigLoadError, `not a ConfigLoadError: ${String(err)}`);
      assert.ok(
        err.message.startsWith(`Failed to load ${file}: `),
        `unexpected message: ${err.message}`,
      );
      return true;
    });
  });

  it('loads the scaffolded config in a project with no node_modules', async () => {
    await scaffoldProject(tmpDir);
    const file = path.join(tmpDir, 'osq.config.ts');
    const scaffolded = await fs.readFile(file, 'utf8');
    await fs.writeFile(file, scaffolded.replace("'agy'", "'codex'"), 'utf8');

    const config = await withoutHarnessEnv(() => loadConfig(tmpDir));

    assert.equal(config.harness, 'codex');
  });

  it('fails the doctor config check with the ConfigLoadError message', async () => {
    const file = await writeConfig(tmpDir, BROKEN_VALIDATION);

    const report = await runDoctorChecks(tmpDir, {
      probeValidator: async () => '1.13.1',
    });

    const check = report.checks.find((candidate) => candidate.name === 'config');
    assert.ok(check, 'doctor reported no config check');
    assert.equal(check.ok, false);
    assert.equal(check.message, `failed to load: Failed to load ${file}: ${VALIDATION_MESSAGE}`);
  });

  it('loads the defaults in a project with no config file', async () => {
    const config = await withoutHarnessEnv(() => loadConfig(tmpDir));

    assert.equal(config.harness, DEFAULT_CONFIG.harness);
    assert.equal(config.limits.maxScopeFiles, DEFAULT_CONFIG.limits.maxScopeFiles);
    assert.equal(config.timeouts.staleLockSeconds, DEFAULT_CONFIG.timeouts.staleLockSeconds);
  });
});
