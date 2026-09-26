import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { doctorCommand } from '../../src/cli/doctor.js';
import { setupCommand } from '../../src/cli/setup.js';
import { type OsqConfig, defineConfig, loadConfig } from '../../src/core/foundation/config.js';
import { runDoctorChecks } from '../../src/core/foundation/doctor.js';
import { buildManifest } from '../../src/core/run/manifest.js';
import { OPENSPEC_EXPECTED_VERSION } from '../../src/core/spec/linter.js';
import { buildCodexArgs, buildCodexPrompt } from '../../src/harness/codex/codex-prompt.js';
import { CodexAdapter, preflightCodex } from '../../src/harness/codex/codex.js';
import { getHarnessAdapter } from '../../src/harness/index.js';
import type { SpawnTaskOptions } from '../../src/harness/types.js';
import {
  FAKE_CODEX,
  FIXTURE_EVENTS,
  FIXTURE_RECOVERABLE,
  FIXTURE_TURN_FAILED,
  codexConfig,
  createCodexProject,
  writeCodexTask,
} from './support.js';

const FAKE_ENV_KEYS = [
  'OSQ_FAKE_RECORD',
  'OSQ_FAKE_JSONL',
  'OSQ_FAKE_MODE',
  'OSQ_FAKE_EXIT',
  'OSQ_FAKE_STDERR',
  'OSQ_FAKE_RESULT_TEXT',
  'OSQ_FAKE_VERSION',
  'OSQ_FAKE_VERSION_CODE',
  'CODEX_PATH',
  'OSQ_MODEL',
] as const;

const SAVED_ENV = new Map(FAKE_ENV_KEYS.map((key) => [key, process.env[key]]));

function restoreFakeEnv(): void {
  for (const [key, value] of SAVED_ENV) {
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
}

function setEnv(values: Partial<Record<(typeof FAKE_ENV_KEYS)[number], string>>): void {
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
}

interface ParsedEvent {
  type: string;
  data?: Record<string, unknown>;
}

async function readEvents(specFolder: string, taskNumber: string): Promise<ParsedEvent[]> {
  const raw = await fs
    .readFile(path.join(specFolder, '.run', 'events', `${taskNumber}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

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
    taskTitle: "When Codex runs with 'quotes', spaces and $HOME; rm -rf /",
    verifyCommand: 'node -e "process.exit(0)"',
    scope: ['src/weird path/a.ts', "src/'quote'.ts"],
    entry: ['src/weird path/a.ts'],
    skills: [],
    tier: 'coding',
    config,
    ...overrides,
  };
}

async function cleanup(root: string): Promise<void> {
  restoreFakeEnv();
  await fs.rm(root, { recursive: true, force: true });
}

describe('Codex adapter registration, setup, and diagnostics', () => {
  afterEach(() => restoreFakeEnv());

  it('registers the codex harness with a no-op setup that creates no files', async () => {
    const { root } = await createCodexProject('codex-register');
    try {
      const adapter = getHarnessAdapter('codex');
      assert.ok(adapter instanceof CodexAdapter);
      assert.equal(adapter.name, 'codex');

      const before = await fs.readdir(root);
      await adapter.setup(root, codexConfig());
      await adapter.setup(root, codexConfig());
      assert.deepEqual(await fs.readdir(root), before);
      assert.equal(
        await fs
          .stat(path.join(root, '.codex'))
          .then(() => true)
          .catch(() => false),
        false,
      );
    } finally {
      await cleanup(root);
    }
  });

  it('setupCommand preserves consumer Codex files, foreign blocks, and mixed-harness setup', async () => {
    const { root } = await createCodexProject('codex-setup');
    const originalCwd = process.cwd();
    try {
      await fs.mkdir(path.join(root, '.codex'), { recursive: true });
      await fs.writeFile(path.join(root, '.codex', 'config.toml'), 'model = "consumer"\n', 'utf8');
      await fs.writeFile(
        path.join(root, 'AGENTS.md'),
        '# Instructions\n\n<!-- OPENSPEC:START -->\nforeign\n<!-- OPENSPEC:END -->\n',
        'utf8',
      );
      await fs.writeFile(
        path.join(root, 'osq.config.ts'),
        "export default { harness: 'codex', planner: { harness: 'opencode', model: 'planner-model' } };\n",
        'utf8',
      );

      process.chdir(root);
      await setupCommand();
      await setupCommand();

      assert.equal(
        await fs.readFile(path.join(root, '.codex', 'config.toml'), 'utf8'),
        'model = "consumer"\n',
      );
      const agents = await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8');
      assert.ok(agents.includes('<!-- OPENSPEC:START -->'));
      assert.ok(agents.includes('<!-- OSQ:START -->'));
      // The other selected adapter still receives its own setup.
      assert.ok(
        await fs
          .stat(path.join(root, '.opencode', 'agent', 'osq-planner.md'))
          .then(() => true)
          .catch(() => false),
      );
    } finally {
      process.chdir(originalCwd);
      await cleanup(root);
    }
  });

  it('doctor probes the same configured Codex binary and reports failures', async () => {
    const { root } = await createCodexProject('codex-doctor');
    try {
      await fs.writeFile(
        path.join(root, 'osq.config.ts'),
        `export default { harness: 'codex', codex: { bin: ${JSON.stringify(FAKE_CODEX)} } };\n`,
        'utf8',
      );
      const healthy = await runDoctorChecks(root, {
        probeValidator: async () => OPENSPEC_EXPECTED_VERSION,
      });
      const harness = healthy.checks.find((check) => check.name === 'harness');
      assert.equal(harness?.ok, true);
      assert.match(harness?.message ?? '', /codex-cli 0\.0\.0-fake/);

      const lines: string[] = [];
      await doctorCommand({
        stdout: (line) => lines.push(line),
        report: healthy,
        exit: () => {},
      });
      assert.equal(lines.length, 8);

      await fs.writeFile(
        path.join(root, 'osq.config.ts'),
        "export default { harness: 'codex', codex: { bin: '/nope/missing-codex' } };\n",
        'utf8',
      );
      const broken = await runDoctorChecks(root, {
        probeValidator: async () => OPENSPEC_EXPECTED_VERSION,
      });
      const brokenCheck = broken.checks.find((check) => check.name === 'harness');
      assert.equal(brokenCheck?.ok, false);
      assert.match(brokenCheck?.message ?? '', /\/nope\/missing-codex/);
    } finally {
      await cleanup(root);
    }
  });

  it('buildManifest records the Codex model or default sentinel and configured effort', async () => {
    const { root, specFolder } = await createCodexProject('codex-manifest');
    try {
      Reflect.deleteProperty(process.env, 'OSQ_MODEL');
      const configured = await buildManifest(
        root,
        specFolder,
        codexConfig({ model: 'gpt-5-codex', effort: 'high' }),
      );
      assert.equal(configured.harness, 'codex');
      assert.equal(configured.model, 'gpt-5-codex');
      assert.equal(configured.effort, 'high');
      assert.equal(configured.planner, null);

      const native = await buildManifest(root, specFolder, codexConfig());
      assert.equal(native.model, 'default');
      assert.equal(native.effort, null);
    } finally {
      await cleanup(root);
    }
  });

  it('preflightCodex resolves CODEX_PATH and returns the version', async () => {
    const { root } = await createCodexProject('codex-preflight');
    try {
      setEnv({ CODEX_PATH: FAKE_CODEX });
      const config = await loadConfig(root);
      const result = await preflightCodex(root, config);
      assert.equal(result.bin, FAKE_CODEX);
      assert.equal(result.version, 'codex-cli 0.0.0-fake');
    } finally {
      await cleanup(root);
    }
  });
});

describe('Codex noninteractive execution', () => {
  it('builds literal argv with sandboxing, approval, model, and effort controls', async () => {
    const { root, specFolder } = await createCodexProject('codex-args');
    try {
      await writeCodexTask(specFolder);
      const config = defineConfig({
        harness: 'codex',
        codex: { bin: FAKE_CODEX, model: 'gpt-5-codex', effort: 'xhigh' },
      });
      const options = spawnOptions(root, specFolder, config);
      const args = await buildCodexArgs(options);
      const prompt = await buildCodexPrompt(options);

      assert.deepEqual(args.slice(0, 3), ['--ask-for-approval', 'never', 'exec']);
      assert.ok(args.includes('--json'));
      assert.deepEqual(args.slice(args.indexOf('--sandbox'), args.indexOf('--sandbox') + 2), [
        '--sandbox',
        'workspace-write',
      ]);
      assert.ok(args.includes('web_search="disabled"'));
      assert.ok(args.includes('sandbox_workspace_write.network_access=false'));
      assert.deepEqual(args.slice(args.indexOf('--model'), args.indexOf('--model') + 2), [
        '--model',
        'gpt-5-codex',
      ]);
      assert.ok(args.includes('model_reasoning_effort="xhigh"'));
      assert.equal(args.at(-1), prompt);
      assert.equal(args.filter((arg) => arg === prompt).length, 1);
      assert.ok(!args.includes('--auto'));
      assert.ok(!args.includes('--dangerously-skip-permissions'));
      assert.ok(!args.includes('--agent'));
    } finally {
      await cleanup(root);
    }
  });

  it('names full task context including delta, living specs, prior result, and one-attempt rules', async () => {
    const { root, specFolder } = await createCodexProject('codex-prompt');
    try {
      await writeCodexTask(specFolder);
      await fs.writeFile(
        path.join(specFolder, 'proposal.md'),
        [
          '---',
          'title: Codex Prompt Feature',
          'verify: node -e "process.exit(0)"',
          'features:',
          '  reads:',
          '    - cli-foundation',
          '---',
          '## Goal',
          'Probe the prompt.',
          '',
        ].join('\n'),
        'utf8',
      );
      const livingDir = path.join(root, 'openspec', 'specs', 'cli-foundation');
      await fs.mkdir(livingDir, { recursive: true });
      await fs.writeFile(path.join(livingDir, 'spec.md'), '# cli-foundation\n', 'utf8');

      const deltaDir = path.join(specFolder, 'specs', 'watcher-and-harness');
      await fs.mkdir(deltaDir, { recursive: true });
      await fs.writeFile(
        path.join(deltaDir, 'spec.md'),
        '### Requirement: Codex task execution\nOnly codex rules apply here.\n',
        'utf8',
      );
      const resultsDir = path.join(specFolder, '.run', 'results');
      await fs.mkdir(resultsDir, { recursive: true });
      await fs.writeFile(path.join(resultsDir, '1.md'), '# prior\n', 'utf8');

      const prompt = await buildCodexPrompt(spawnOptions(root, specFolder, codexConfig()));
      assert.ok(prompt.includes(path.join(specFolder, 'tasks', '1.md').replace(`${root}/`, '')));
      assert.ok(
        prompt.includes(
          `Parent Spec: ${path.relative(root, path.join(specFolder, 'proposal.md'))}`,
        ),
      );
      assert.ok(prompt.includes('Delta Specs:'));
      assert.ok(prompt.includes('specs/watcher-and-harness/spec.md'));
      assert.ok(prompt.includes('Living Capability Specs:'));
      assert.ok(prompt.includes('openspec/specs/cli-foundation/spec.md'));
      assert.ok(prompt.includes('Prior Result:'));
      assert.ok(prompt.includes('Result Destination:'));
      assert.ok(prompt.includes('CRITICAL: Before exiting, you MUST write'));
      assert.ok(prompt.includes('One attempt.'));
      assert.ok(prompt.includes('watcher-and-harness: Codex task execution'));
    } finally {
      await cleanup(root);
    }
  });

  it('spawns a fresh fake Codex with correct cwd, env, literal prompt, and translated events', async () => {
    const { root, specFolder } = await createCodexProject('codex-spawn');
    const record = path.join(root, 'record.json');
    try {
      await writeCodexTask(specFolder);
      setEnv({ OSQ_FAKE_RECORD: record, OSQ_FAKE_JSONL: FIXTURE_EVENTS });
      const config = codexConfig({ model: 'gpt-5-codex', effort: 'high' });
      const options = spawnOptions(root, specFolder, config);
      const expectedPrompt = await buildCodexPrompt(options);

      const spawnedPids: number[] = [];
      const result = await new CodexAdapter().spawn({
        ...options,
        onSpawn: (pid) => {
          spawnedPids.push(pid);
        },
      });

      assert.equal(result.exitCode, 0);
      assert.equal(spawnedPids.length, 1);
      assert.equal(result.pid, spawnedPids[0]);
      assert.equal(typeof result.elapsedMs, 'number');

      const recorded = JSON.parse(await fs.readFile(record, 'utf8')) as {
        argv: string[];
        cwd: string;
        taskNumber: string;
        specFolder: string;
      };
      assert.equal(recorded.cwd, root);
      assert.equal(recorded.argv.at(-1), expectedPrompt);
      assert.ok(recorded.argv.includes('gpt-5-codex'));
      assert.ok(recorded.argv.includes('--json'));
      assert.equal(recorded.taskNumber, '1');
      assert.equal(recorded.specFolder, specFolder);

      const events = await readEvents(specFolder, '1');
      assert.deepEqual(
        events.map((event) => event.type),
        ['text', 'tool', 'tool', 'file_changed', 'file_changed', 'tokens'],
      );
      assert.ok(
        events.every(
          (event) => !['started', 'exited', 'done', 'dead', 'verify_ran'].includes(event.type),
        ),
        'the adapter never emits watcher lifecycle or verification events',
      );
    } finally {
      await cleanup(root);
    }
  });

  it('preserves failure, timeout, and terminal turn.failed diagnostics', async () => {
    const { root, specFolder } = await createCodexProject('codex-failure');
    try {
      await writeCodexTask(specFolder);
      const adapter = new CodexAdapter();
      const config = codexConfig();

      setEnv({ OSQ_FAKE_MODE: 'fail', OSQ_FAKE_EXIT: '17', OSQ_FAKE_STDERR: 'boom detail' });
      const failed = await adapter.spawn(spawnOptions(root, specFolder, config));
      assert.equal(failed.exitCode, 17);
      assert.match(failed.error ?? '', /boom detail/);
      assert.equal(typeof failed.pid, 'number');

      setEnv({ OSQ_FAKE_MODE: 'hang' });
      const deadlineConfig = defineConfig({
        harness: 'codex',
        codex: { bin: FAKE_CODEX },
        timeouts: { taskTimeoutSeconds: 1 },
      });
      const timedOut = await adapter.spawn(spawnOptions(root, specFolder, deadlineConfig));
      assert.equal(timedOut.timedOut, true);
      assert.equal(timedOut.exitCode, 124);
      assert.equal(timedOut.signal, 'SIGTERM');
      assert.equal(timedOut.error, 'Task execution timed out');

      restoreFakeEnv();
      setEnv({ OSQ_FAKE_JSONL: FIXTURE_TURN_FAILED });
      const turnFailed = await adapter.spawn(spawnOptions(root, specFolder, config));
      assert.equal(turnFailed.exitCode, 1, 'turn.failed is terminal even with process exit zero');
      assert.match(turnFailed.error ?? '', /codex exploded mid-turn/);

      setEnv({ OSQ_FAKE_JSONL: FIXTURE_RECOVERABLE });
      const recovered = await adapter.spawn(spawnOptions(root, specFolder, config));
      assert.equal(recovered.exitCode, 0);
      assert.equal(recovered.error, undefined);
    } finally {
      await cleanup(root);
    }
  });
});
