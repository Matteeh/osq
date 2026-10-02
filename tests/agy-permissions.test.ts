import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { AgyAdapter, buildAgyArgs } from '../src/harness/agy/agy.js';

const FLAG = '--dangerously-skip-permissions';

function taskOptions(config: OsqConfig | undefined, tmpDir: string) {
  return {
    projectRoot: tmpDir,
    specFolderPath: tmpDir,
    taskNumber: '1',
    taskTitle: 'Agy permissions',
    verifyCommand: 'node -e "process.exit(0)"',
    scope: ['src/index.ts'],
    entry: ['src/index.ts'],
    skills: [],
    tier: 'coding' as const,
    config,
  };
}

describe('agy permissions', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-agy-permissions-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    process.env.AGY_PATH = undefined;
  });

  it('defaults dangerouslySkipPermissions to false', () => {
    assert.equal(DEFAULT_CONFIG.agy?.dangerouslySkipPermissions, false);
  });

  it('buildAgyArgs omits the bypass when config is absent', () => {
    const args = buildAgyArgs(taskOptions(undefined, tmpDir));
    assert.equal(args.includes(FLAG), false);
  });

  it('buildAgyArgs omits the bypass when agy config is unset', () => {
    const args = buildAgyArgs(taskOptions(defineConfig({}), tmpDir));
    assert.equal(args.includes(FLAG), false);
  });

  it('buildAgyArgs omits the bypass when the setting is false', () => {
    const config = defineConfig({ agy: { dangerouslySkipPermissions: false } });
    const args = buildAgyArgs(taskOptions(config, tmpDir));
    assert.equal(args.includes(FLAG), false);
  });

  it('buildAgyArgs adds the bypass when the setting is true', () => {
    const config = defineConfig({ agy: { dangerouslySkipPermissions: true } });
    const args = buildAgyArgs(taskOptions(config, tmpDir));
    assert.equal(args.includes(FLAG), true);
  });

  it('preflight rejects when the bypass is unset, naming the setting and the harness choice', async () => {
    await assert.rejects(
      () => new AgyAdapter().preflight(tmpDir, defineConfig({})),
      (err: Error) => {
        assert.match(err.message, /headless/);
        assert.match(err.message, /agy\.dangerouslySkipPermissions/);
        assert.match(err.message, /another harness/);
        return true;
      },
    );
  });

  it('preflight rejects when the bypass is false', async () => {
    const config = defineConfig({ agy: { dangerouslySkipPermissions: false } });
    await assert.rejects(() => new AgyAdapter().preflight(tmpDir, config));
  });

  it('preflight resolves when the bypass is true', async () => {
    const config = defineConfig({ agy: { dangerouslySkipPermissions: true } });
    await new AgyAdapter().preflight(tmpDir, config);
  });

  it('preflight spawns no process', async () => {
    const marker = path.join(tmpDir, 'spawned');
    const fakeBin = path.join(tmpDir, 'fake-agy.mjs');
    await fs.writeFile(
      fakeBin,
      `#!/usr/bin/env node\nimport fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(
        marker,
      )}, 'spawned');\n`,
      { mode: 0o755 },
    );
    process.env.AGY_PATH = fakeBin;

    await assert.rejects(() => new AgyAdapter().preflight(tmpDir, defineConfig({})));
    await new AgyAdapter().preflight(
      tmpDir,
      defineConfig({ agy: { dangerouslySkipPermissions: true } }),
    );

    await assert.rejects(fs.access(marker));
  });

  it('spawnInteractive omits the bypass when unset', async () => {
    const recordedFile = path.join(tmpDir, 'agy-recorded.json');
    const fakeBin = path.join(tmpDir, 'fake-agy.mjs');
    await fs.writeFile(
      fakeBin,
      `#!/usr/bin/env node\nimport fs from 'node:fs';\nconst argv = process.argv.slice(2);\nfs.writeFileSync(${JSON.stringify(
        recordedFile,
      )}, JSON.stringify({ argv }), 'utf8');\nprocess.exit(0);\n`,
      { mode: 0o755 },
    );
    process.env.AGY_PATH = fakeBin;

    const exitCode = await new AgyAdapter().spawnInteractive({ prompt: 'plan', cwd: tmpDir });
    assert.equal(exitCode, 0);

    const recorded = JSON.parse(await fs.readFile(recordedFile, 'utf8'));
    assert.equal(recorded.argv.includes(FLAG), false);
  });

  it('spawnInteractive adds the bypass when true', async () => {
    const recordedFile = path.join(tmpDir, 'agy-recorded.json');
    const fakeBin = path.join(tmpDir, 'fake-agy.mjs');
    await fs.writeFile(
      fakeBin,
      `#!/usr/bin/env node\nimport fs from 'node:fs';\nconst argv = process.argv.slice(2);\nfs.writeFileSync(${JSON.stringify(
        recordedFile,
      )}, JSON.stringify({ argv }), 'utf8');\nprocess.exit(0);\n`,
      { mode: 0o755 },
    );
    process.env.AGY_PATH = fakeBin;
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      'export default { agy: { dangerouslySkipPermissions: true } };',
      'utf8',
    );

    const exitCode = await new AgyAdapter().spawnInteractive({ prompt: 'plan', cwd: tmpDir });
    assert.equal(exitCode, 0);

    const recorded = JSON.parse(await fs.readFile(recordedFile, 'utf8'));
    assert.equal(recorded.argv.includes(FLAG), true);
  });
});
