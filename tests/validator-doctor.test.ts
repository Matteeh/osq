import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { type OsqConfig, defineConfig, loadConfig } from '../src/core/foundation/config.js';
import { runDoctorChecks } from '../src/core/foundation/doctor.js';
import { scaffoldProject } from '../src/core/foundation/init.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function findCheck(report: { checks: Array<{ name: string }> }, name: string) {
  return report.checks.find((check) => check.name === name) as
    | { name: string; ok: boolean; message: string; warning?: boolean }
    | undefined;
}

describe('validator-model doctor check', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-doctor-validator-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const run = (config: OsqConfig) => runDoctorChecks(tmpDir, { loadConfig: async () => config });

  it('warns when the validator uses the executor harness and model', async () => {
    const executor = { harness: 'claude', claude: { model: 'claude-opus-5-5' } } as const;
    const config = defineConfig({
      ...executor,
      validator: { harness: 'claude', model: 'claude-opus-5-5' },
    });

    const report = await run(config);

    const check = findCheck(report, 'validator-model');
    assert.equal(check?.ok, true);
    assert.equal(check?.warning, true);
    assert.equal(
      check?.message,
      "validator uses the executor's harness and model (claude/claude-opus-5-5); its findings share the executor's blind spots",
    );
    assert.equal(report.checks.at(-1)?.name, 'validator-model');

    const baseline = await run(defineConfig(executor));
    assert.equal(report.ok, baseline.ok);
  });

  it('passes when the validator uses another harness and model', async () => {
    const config = defineConfig({
      harness: 'pi',
      pi: { model: 'deepseek-flash' },
      validator: { harness: 'claude', model: 'claude-opus-5-5' },
    });

    const report = await run(config);

    const check = findCheck(report, 'validator-model');
    assert.equal(check?.ok, true);
    assert.equal(check?.warning, undefined);
    assert.equal(check?.message, 'validator claude/claude-opus-5-5, executor pi/deepseek-flash');
    assert.equal(report.checks.at(-1)?.name, 'validator-model');
  });

  it('adds no check without a validator or with it disabled', async () => {
    for (const config of [
      defineConfig({ harness: 'mock' }),
      defineConfig({ harness: 'mock', validator: { enabled: false } }),
    ]) {
      const report = await run(config);
      assert.equal(findCheck(report, 'validator-model'), undefined);
    }
  });
});

describe('validator scaffold', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-validator-scaffold-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes the validator block as a comment and loads no validator', async () => {
    await scaffoldProject(tmpDir);
    const text = await fs.readFile(path.join(tmpDir, 'osq.config.ts'), 'utf8');
    const lines = text.split('\n');
    const maxConcurrency = lines.indexOf('  maxConcurrency: 1,');
    assert.ok(maxConcurrency >= 0, 'the scaffolded config sets maxConcurrency');
    assert.equal(
      lines.slice(maxConcurrency + 1, maxConcurrency + 5).join('\n'),
      [
        '  // A validator judges each change against its delta specs at archive and',
        '  // records what it finds without stopping the change. Pick a model other',
        "  // than the executor's.",
        "  // validator: { harness: 'claude', model: '<a-different-model>' },",
      ].join('\n'),
    );

    const config = await loadConfig(tmpDir);
    assert.equal('validator' in config, false);
  });
});

describe("osq's own validator", () => {
  it('loads the claude validator on the planning model', async () => {
    const config = await loadConfig(repoRoot);
    assert.deepEqual(config.validator, {
      enabled: true,
      harness: 'claude',
      model: 'claude-opus-5-5',
      timeoutSeconds: 900,
    });
  });

  it('README describes the validator between Mutation checks and the guarantees', async () => {
    const readme = await fs.readFile(path.join(repoRoot, 'README.md'), 'utf8');
    const mutation = readme.indexOf('### Mutation checks');
    const validator = readme.indexOf('### Validator');
    const guarantees = readme.indexOf('## What the watcher guarantees');
    assert.ok(mutation >= 0 && validator > mutation && validator < guarantees, 'section order');
    const section = readme.slice(validator, guarantees);
    assert.match(section, /validator_ran/);
    assert.match(section, /validator-model/);
  });
});
