import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { type OsqConfig, defineConfig } from '../../src/core/foundation/config.js';
import { lookupHarness } from '../../src/core/foundation/harness-catalog.js';
import { buildManifest } from '../../src/core/run/manifest.js';
import { getHarnessAdapter } from '../../src/harness/index.js';
import { buildPiArgs } from '../../src/harness/pi/pi-args.js';
import { PiAdapter, preflightPi } from '../../src/harness/pi/pi.js';
import { buildExecutorPrompt } from '../../src/harness/prompt.js';
import type { SpawnTaskOptions } from '../../src/harness/types.js';
import { envScope } from './support.js';
import {
  FAKE_PI,
  GOLDEN_RUN,
  THREE_RESPONSES,
  createPiProject,
  piConfig,
  writePiTask,
} from './support.js';

const env = envScope([
  'OSQ_FAKE_RECORD',
  'OSQ_FAKE_PI_JSONL',
  'OSQ_FAKE_PI_MODE',
  'OSQ_FAKE_PI_EXIT',
  'OSQ_FAKE_PI_STDERR',
  'OSQ_FAKE_PI_RESULT_TEXT',
  'OSQ_FAKE_PI_VERSION',
  'OSQ_FAKE_PI_VERSION_CODE',
  'OSQ_FAKE_PI_AUTH_STATUS',
  'OSQ_FAKE_PI_AUTH_REASON',
  'OSQ_PI_PATH',
  'OSQ_MODEL',
]);

beforeEach(() => env.save());

function spawnOptions(
  root: string,
  specFolder: string,
  config: OsqConfig,
  overrides: Partial<SpawnTaskOptions> = {},
): SpawnTaskOptions {
  return {
    projectRoot: root,
    specFolderPath: specFolder,
    taskNumber: '1',
    taskTitle: "When Pi runs with 'quotes', spaces and $HOME; rm -rf /",
    verifyCommand: 'node -e "process.exit(0)"',
    scope: ['src/weird path/a.ts', "src/'quote'.ts"],
    entry: ['src/weird path/a.ts'],
    skills: [],
    tier: 'coding',
    config,
    ...overrides,
  };
}

interface FakeRecord {
  argv: string[];
  cwd: string;
  taskNumber?: string;
  specFolder?: string;
  stdinLength: number;
  stdinClosed: boolean;
  kind: string;
}

async function readRecord(recordPath: string): Promise<FakeRecord | undefined> {
  return await fs
    .readFile(recordPath, 'utf8')
    .then((raw) => JSON.parse(raw) as FakeRecord)
    .catch(() => undefined);
}

describe('Pi configuration and catalog registration', () => {
  afterEach(() => env.restore());

  it('registers pi through the adapter factory with a no-op setup', async () => {
    const { root } = await createPiProject('pi-register');
    try {
      const adapter = getHarnessAdapter('pi');
      assert.ok(adapter instanceof PiAdapter);
      assert.equal(adapter.name, 'pi');
      const before = await fs.readdir(root);
      await adapter.setup(root, piConfig());
      await adapter.setup(root, piConfig());
      assert.deepEqual(await fs.readdir(root), before);
      assert.equal(
        await fs
          .stat(path.join(root, '.pi'))
          .then(() => true)
          .catch(() => false),
        false,
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe('Pi task arguments', () => {
  it('builds the exact headless argv, omitting unconfigured flags', async () => {
    env.save();
    try {
      const { root, specFolder } = await createPiProject('pi-args');
      try {
        await writePiTask(specFolder);
        Reflect.deleteProperty(process.env, 'OSQ_MODEL');
        const bare = spawnOptions(
          root,
          specFolder,
          defineConfig({ harness: 'pi', pi: { bin: FAKE_PI } }),
        );
        const bareArgs = buildPiArgs(bare, bare.config);
        assert.deepEqual(bareArgs.slice(0, 8), [
          '--mode',
          'json',
          '--no-session',
          '--no-approve',
          '--offline',
          '--no-extensions',
          '--no-skills',
          '--no-prompt-templates',
        ]);
        assert.ok(!bareArgs.includes('--provider'));
        assert.ok(!bareArgs.includes('--model'));
        assert.ok(!bareArgs.includes('--thinking'));
        assert.equal(bareArgs[8], '--');
        assert.equal(bareArgs[9], await buildExecutorPrompt(bare));
        assert.equal(bareArgs.length, 10);

        const configured = piConfig({
          provider: 'deepseek',
          model: 'deepseek-flash',
          thinking: 'high',
        });
        const options = spawnOptions(root, specFolder, configured);
        const args = buildPiArgs(options, configured);
        assert.deepEqual(args.slice(8, 15), [
          '--provider',
          'deepseek',
          '--model',
          'deepseek-flash',
          '--thinking',
          'high',
          '--',
        ]);
        assert.equal(args.at(-1), await buildExecutorPrompt(options));
        assert.equal(args.filter((arg) => arg === args.at(-1)).length, 1);
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    } finally {
      env.restore();
    }
  });
});

describe('Pi noninteractive execution', () => {
  afterEach(() => env.restore());

  it('spawns a fresh fake Pi in the project root with a closed stdin', async () => {
    const { root, specFolder } = await createPiProject('pi-spawn');
    const record = path.join(root, 'record.json');
    try {
      await writePiTask(specFolder);
      env.set({ OSQ_FAKE_RECORD: record, OSQ_FAKE_PI_JSONL: THREE_RESPONSES });
      const config = piConfig({ model: 'deepseek-flash' });
      const options = spawnOptions(root, specFolder, config);
      const expectedPrompt = await buildExecutorPrompt(options);

      const spawned: Array<{ pid: number; harnessVersion?: string }> = [];
      const result = await getHarnessAdapter('pi').spawn({
        ...options,
        onSpawn: (pid, details) => {
          spawned.push({ pid, harnessVersion: details?.harnessVersion });
        },
      });

      assert.equal(result.exitCode, 0);
      assert.equal(spawned.length, 1);
      assert.equal(spawned[0]?.harnessVersion, '0.87.0');
      assert.equal(result.pid, spawned[0]?.pid);

      const recorded = await readRecord(record);
      assert.equal(recorded?.cwd, root);
      assert.equal(recorded?.argv.at(-1), expectedPrompt);
      assert.equal(recorded?.argv.at(-2), '--');
      assert.ok(recorded?.argv.includes('--model'));
      assert.equal(recorded?.taskNumber, '1');
      assert.equal(recorded?.specFolder, specFolder);
      assert.equal(recorded?.stdinLength, 0);
      assert.equal(recorded?.stdinClosed, true);

      const events = await fs.readFile(path.join(specFolder, '.run', 'events', '1.jsonl'), 'utf8');
      assert.ok(!events.includes('"started"'));
      assert.ok(!events.includes('"exited"'));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('stops a Pi that settles but keeps running, reporting success', async () => {
    const { root, specFolder } = await createPiProject('pi-settle-hang');
    try {
      await writePiTask(specFolder);
      env.set({ OSQ_FAKE_PI_MODE: 'settle-hang', OSQ_FAKE_PI_JSONL: GOLDEN_RUN });
      const config = defineConfig({
        harness: 'pi',
        pi: { bin: FAKE_PI },
        timeouts: { harnessKillGracePeriodMs: 150 },
      });
      const result = await new PiAdapter().spawn(spawnOptions(root, specFolder, config));
      assert.equal(result.exitCode, 0);
      assert.equal(result.timedOut, false);
      assert.equal(result.error, undefined);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('carries Pi stderr and names pi auth check when credentials are missing', async () => {
    const { root, specFolder } = await createPiProject('pi-missing-creds');
    try {
      await writePiTask(specFolder);
      env.set({ OSQ_FAKE_PI_MODE: 'missing-credentials' });
      const result = await new PiAdapter().spawn(
        spawnOptions(root, specFolder, piConfig({ provider: 'deepseek' })),
      );
      assert.notEqual(result.exitCode, 0);
      assert.match(result.error ?? '', /No API key found/);
      assert.match(result.error ?? '', /pi auth check --provider deepseek/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe('Pi preflight and diagnose hook', () => {
  afterEach(() => env.restore());

  it('warns outside the tested range and fails before spawn when credentials are not ready', async () => {
    const { root } = await createPiProject('pi-preflight');
    try {
      env.set({ OSQ_FAKE_PI_VERSION: '0.88.0' });
      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(' '));
      try {
        await preflightPi(root, piConfig());
      } finally {
        console.warn = originalWarn;
      }
      assert.equal(warnings.length, 1);
      assert.match(warnings[0] ?? '', /0\.88\.0/);
      assert.match(warnings[0] ?? '', />=0\.87\.0 <0\.88\.0/);

      env.restore();
      env.save();
      env.set({
        OSQ_FAKE_PI_AUTH_STATUS: 'not_ready',
        OSQ_FAKE_PI_AUTH_REASON: 'credentials_not_configured',
      });
      await assert.rejects(
        () => preflightPi(root, piConfig({ provider: 'deepseek' })),
        /deepseek.*credentials_not_configured/,
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('runs no auth check without a provider', async () => {
    const { root } = await createPiProject('pi-preflight-noprovider');
    const record = path.join(root, 'record.json');
    try {
      env.set({ OSQ_FAKE_RECORD: record });
      await preflightPi(root, piConfig());
      const recorded = await readRecord(record);
      assert.equal(recorded?.kind, 'version');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('diagnoses the version and credentials without naming a harness in doctor', async () => {
    const { root } = await createPiProject('pi-diagnose');
    try {
      const diagnose = lookupHarness('pi').diagnose;
      assert.equal(typeof diagnose, 'function');
      if (!diagnose) throw new Error('pi must declare a diagnose hook');

      env.set({
        OSQ_FAKE_PI_AUTH_STATUS: 'not_ready',
        OSQ_FAKE_PI_AUTH_REASON: 'credentials_not_configured',
      });
      const failing = await diagnose({
        config: piConfig({ provider: 'deepseek' }),
        projectRoot: root,
        version: '0.88.0',
      });
      assert.deepEqual(
        failing.map((check) => check.name),
        ['harness-version', 'harness-auth'],
      );
      assert.equal(failing[0]?.ok, true);
      assert.equal(failing[0]?.warning, true);
      assert.equal(failing[1]?.ok, false);
      assert.match(failing[1]?.message ?? '', /deepseek/);
      assert.match(failing[1]?.message ?? '', /credentials_not_configured/);

      env.set({ OSQ_FAKE_PI_AUTH_STATUS: 'ready' });
      const ready = await diagnose({
        config: piConfig({ provider: 'deepseek' }),
        projectRoot: root,
        version: '0.87.1',
      });
      assert.equal(ready[0]?.warning, undefined);
      assert.equal(ready[1]?.ok, true);

      const noProvider = await diagnose({
        config: piConfig(),
        projectRoot: root,
        version: '0.87.1',
      });
      assert.deepEqual(
        noProvider.map((check) => check.name),
        ['harness-version'],
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe('Pi execution attribution', () => {
  afterEach(() => env.restore());

  it('records the configured model and thinking effort in the manifest', async () => {
    const { root, specFolder } = await createPiProject('pi-manifest');
    try {
      Reflect.deleteProperty(process.env, 'OSQ_MODEL');
      const manifest = await buildManifest(
        root,
        specFolder,
        piConfig({ model: 'deepseek-flash', thinking: 'high' }),
      );
      assert.equal(manifest.harness, 'pi');
      assert.equal(manifest.model, 'deepseek-flash');
      assert.equal(manifest.effort, 'high');

      const native = await buildManifest(root, specFolder, piConfig());
      assert.equal(native.model, 'default');
      assert.equal(native.effort, null);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
