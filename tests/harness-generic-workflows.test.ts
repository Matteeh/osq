import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { doctorCommand } from '../src/cli/doctor.js';
import { planCommand } from '../src/cli/plan.js';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG, type OsqConfig, defineConfig } from '../src/core/config.js';
import { type DoctorReport, runDoctorChecks } from '../src/core/doctor.js';
import { resolveExecutorIdentity } from '../src/core/harness-catalog.js';
import { getChangesDir } from '../src/core/layout.js';
import { OPENSPEC_EXPECTED_VERSION } from '../src/core/linter.js';
import { buildManifest } from '../src/core/manifest.js';
import { createNewSpec } from '../src/core/new.js';
import { parseFrontmatter } from '../src/core/parser.js';
import { AgyAdapter } from '../src/harness/agy.js';
import { CodexAdapter } from '../src/harness/codex.js';
import { MockAdapter } from '../src/harness/mock.js';
import { OpencodeAdapter } from '../src/harness/opencode.js';
import type {
  HarnessAdapter,
  InteractiveSessionOptions,
  SpawnResult,
} from '../src/harness/types.js';
import { startWatcher } from '../src/watcher/loop.js';
import { runTask } from '../src/watcher/runner.js';
import { FAKE_CODEX, createScaffoldedProject } from './codex/support.js';

const TASK_MD = [
  '---',
  'title: When a generic workflow task runs',
  'verify: node -e "process.exit(0)"',
  'scope: []',
  'entry: []',
  'skills: []',
  '---',
  '## Acceptance',
  '- [ ] generic workflow passes',
  '',
].join('\n');

const ENV_KEYS = ['AGY_PATH', 'OPENCODE_PATH', 'CODEX_PATH', 'OSQ_MODEL'] as const;
const SAVED_ENV = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = SAVED_ENV.get(key);
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
}

function clearModelEnv(): void {
  Reflect.deleteProperty(process.env, 'OSQ_MODEL');
}

async function writeFakeExecutable(root: string, label: string, version: string): Promise<string> {
  const bin = path.join(root, `fake-${label}.mjs`);
  await fs.writeFile(
    bin,
    [
      `#!${process.execPath}`,
      "if (process.argv.includes('--version')) {",
      `  console.log(${JSON.stringify(version)});`,
      '  process.exit(0);',
      '}',
      'process.exit(0);',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  return bin;
}

async function writeFailingExecutable(root: string, label: string, code: number): Promise<string> {
  const bin = path.join(root, `fake-${label}.mjs`);
  await fs.writeFile(
    bin,
    [
      `#!${process.execPath}`,
      "process.stderr.write('probe failed\\n');",
      `process.exit(${code});`,
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  return bin;
}

async function writeHangingExecutable(root: string, label: string): Promise<string> {
  const bin = path.join(root, `fake-${label}.mjs`);
  await fs.writeFile(
    bin,
    [`#!${process.execPath}`, 'setInterval(() => {}, 1000);', ''].join('\n'),
    { mode: 0o755 },
  );
  return bin;
}

function findCheck(report: DoctorReport, name: string) {
  return report.checks.find((check) => check.name === name);
}

async function createApprovedChange(
  root: string,
  config: OsqConfig,
  title: string,
): Promise<string> {
  const spec = await createNewSpec(root, title);
  await fs.writeFile(path.join(spec.folderPath, 'tasks', '1.md'), TASK_MD, 'utf8');
  await approveSpec(root, spec.specId, config);
  return spec.folderPath;
}

async function readStartedEvent(specFolder: string): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(path.join(specFolder, '.run', 'events', '1.jsonl'), 'utf8');
  const events = raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type: string; data: Record<string, unknown> });
  const started = events.find((event) => event.type === 'started');
  assert.ok(started, 'expected a started event');
  return started.data;
}

class PreflightProbeAdapter implements HarnessAdapter {
  readonly name: string;
  calls = 0;

  constructor(name = 'agy') {
    this.name = name;
  }

  async setup(): Promise<void> {}

  async spawn(): Promise<SpawnResult> {
    return { exitCode: 0 };
  }

  async preflight(): Promise<void> {
    this.calls++;
  }
}

class PlainAdapter implements HarnessAdapter {
  readonly name = 'agy';

  async setup(): Promise<void> {}

  async spawn(): Promise<SpawnResult> {
    return { exitCode: 0 };
  }
}

describe('doctor harness diagnostics resolve through the catalog', () => {
  let root: string;

  beforeEach(async () => {
    root = await createScaffoldedProject('generic-doctor');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    restoreEnv();
  });

  it('probes each external executable and passes a no-binary harness without a process', async () => {
    const agyBin = await writeFakeExecutable(root, 'agy', 'agy 9.1.0');
    const opencodeBin = await writeFakeExecutable(root, 'opencode', 'opencode 8.2.0');
    const codexBin = await writeFakeExecutable(root, 'codex', 'codex 7.3.0');
    process.env.AGY_PATH = agyBin;

    const cases: Array<{ config: OsqConfig; version: string }> = [
      { config: defineConfig({ harness: 'agy' }), version: 'agy 9.1.0' },
      {
        config: defineConfig({ harness: 'opencode', opencode: { bin: opencodeBin } }),
        version: 'opencode 8.2.0',
      },
      {
        config: defineConfig({ harness: 'codex', codex: { bin: codexBin } }),
        version: 'codex 7.3.0',
      },
      { config: defineConfig({ harness: 'mock' }), version: '' },
    ];

    for (const testCase of cases) {
      const report = await runDoctorChecks(root, {
        loadConfig: async () => testCase.config,
        probeValidator: async () => OPENSPEC_EXPECTED_VERSION,
      });
      const check = findCheck(report, 'harness');
      assert.equal(check?.ok, true, JSON.stringify(report.checks));
      if (testCase.version) {
        assert.ok(check?.message.includes(testCase.version), check?.message);
      } else {
        assert.match(check?.message ?? '', /no external executable/);
      }
    }
  });

  it('reports missing, nonzero, and timeout probes as failing harness checks', async () => {
    const missing = path.join(root, 'missing-opencode-bin');
    const failing = await writeFailingExecutable(root, 'opencode-fail', 2);
    const hanging = await writeHangingExecutable(root, 'opencode-hang');

    const diagnose = (config: OsqConfig) =>
      runDoctorChecks(root, {
        loadConfig: async () => config,
        probeValidator: async () => OPENSPEC_EXPECTED_VERSION,
      });

    const missingCheck = findCheck(
      await diagnose(defineConfig({ harness: 'opencode', opencode: { bin: missing } })),
      'harness',
    );
    assert.equal(missingCheck?.ok, false);
    assert.match(missingCheck?.message ?? '', /binary unavailable/);
    assert.ok(missingCheck?.message.includes(missing));

    const failingCheck = findCheck(
      await diagnose(defineConfig({ harness: 'opencode', opencode: { bin: failing } })),
      'harness',
    );
    assert.equal(failingCheck?.ok, false);

    const hangingCheck = findCheck(
      await diagnose(
        defineConfig({
          harness: 'opencode',
          opencode: { bin: hanging },
          timeouts: { harnessPreflightSeconds: 1 },
        }),
      ),
      'harness',
    );
    assert.equal(hangingCheck?.ok, false);
  });

  it('prints the harness result through the doctorCommand output contract', async () => {
    const bin = await writeFakeExecutable(root, 'opencode-cli', 'opencode 5.5.5');
    await fs.writeFile(
      path.join(root, 'osq.config.ts'),
      `export default { harness: 'opencode', opencode: { bin: ${JSON.stringify(bin)} } };\n`,
      'utf8',
    );

    const lines: string[] = [];
    await doctorCommand({ cwd: root, stdout: (line) => lines.push(line), exit: () => {} });

    assert.ok(
      lines.some((line) => line.startsWith('[ok] harness:') && line.includes('opencode 5.5.5')),
      lines.join('\n'),
    );
  });
});

describe('approval manifest uses the shared executor identity', () => {
  let root: string;

  beforeEach(async () => {
    clearModelEnv();
    root = await createScaffoldedProject('generic-manifest');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    restoreEnv();
  });

  async function manifestFor(title: string, config: OsqConfig) {
    const spec = await createNewSpec(root, title);
    return buildManifest(root, spec.folderPath, config);
  }

  it('records the selected harness model or default and applicable effort', async () => {
    const agy = await manifestFor('Agy Identity', defineConfig({ harness: 'agy' }));
    assert.equal(agy.harness, 'agy');
    assert.equal(agy.model, DEFAULT_CONFIG.agy?.model);
    assert.equal(agy.effort, null);

    const opencode = await manifestFor('Opencode Identity', defineConfig({ harness: 'opencode' }));
    assert.equal(opencode.harness, 'opencode');
    assert.equal(opencode.model, DEFAULT_CONFIG.opencode?.model);
    assert.equal(opencode.effort, null);

    const mock = await manifestFor('Mock Identity', defineConfig({ harness: 'mock' }));
    assert.equal(mock.harness, 'mock');
    assert.equal(mock.model, 'default');
    assert.equal(mock.effort, null);

    const native = await manifestFor('Codex Native', defineConfig({ harness: 'codex' }));
    assert.equal(native.harness, 'codex');
    assert.equal(native.model, 'default');
    assert.equal(native.effort, null);
    assert.notEqual(native.model, DEFAULT_CONFIG.agy?.model);

    const explicit = await manifestFor(
      'Codex Explicit',
      defineConfig({ harness: 'codex', codex: { model: 'gpt-5-codex', effort: 'high' } }),
    );
    assert.equal(explicit.model, 'gpt-5-codex');
    assert.equal(explicit.effort, 'high');
  });

  it('keeps planner.model-or-null independent of the executor identity', async () => {
    const mixed = await manifestFor(
      'Mixed Identity',
      defineConfig({ harness: 'codex', planner: { harness: 'agy', model: 'planner-model-x' } }),
    );
    assert.equal(mixed.harness, 'codex');
    assert.equal(mixed.model, 'default');
    assert.equal(mixed.planner, 'planner-model-x');
    assert.equal(mixed.effort, null);

    const none = await manifestFor('No Planner', defineConfig({ harness: 'mock' }));
    assert.equal(none.planner, null);
  });

  it('approveSpec writes the same identity through the real approval path', async () => {
    const config = defineConfig({
      harness: 'codex',
      codex: { model: 'gpt-5-1', effort: 'low' },
      planner: { harness: 'mock', model: 'planner-m' },
    });
    const spec = await createNewSpec(root, 'Approved Identity');
    await fs.writeFile(path.join(spec.folderPath, 'tasks', '1.md'), TASK_MD, 'utf8');
    await approveSpec(root, spec.specId, config);

    const written = JSON.parse(
      await fs.readFile(path.join(spec.folderPath, '.run', 'manifest.json'), 'utf8'),
    ) as Record<string, unknown>;
    assert.equal(written.harness, 'codex');
    assert.equal(written.model, 'gpt-5-1');
    assert.equal(written.effort, 'low');
    assert.equal(written.planner, 'planner-m');
  });
});

describe('watcher preflight uses the adapter port', () => {
  let root: string;

  beforeEach(async () => {
    root = await createScaffoldedProject('generic-preflight');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    restoreEnv();
  });

  it('invokes a supplied preflight and continues when the port is absent', async () => {
    const withPreflight = new PreflightProbeAdapter();
    await startWatcher(root, defineConfig({ harness: 'agy' }), withPreflight, { once: true });
    assert.equal(withPreflight.calls, 1, 'the adapter preflight port must run');

    const withoutPreflight = new PlainAdapter();
    await startWatcher(root, defineConfig({ harness: 'agy' }), withoutPreflight, { once: true });
  });

  it('does not probe a catalogued no-binary harness even when a preflight is supplied', async () => {
    const mock = new MockAdapter();
    let called = false;
    (mock as unknown as { preflight?: () => Promise<void> }).preflight = async () => {
      called = true;
    };

    await startWatcher(root, defineConfig({ harness: 'mock' }), mock, { once: true });
    assert.equal(called, false);
  });

  it('probes the resolved opencode and codex executables before the first cycle', async () => {
    const opencodeBin = await writeFakeExecutable(root, 'opencode-preflight', 'opencode 2.0.0');
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
    try {
      await startWatcher(
        root,
        defineConfig({ harness: 'opencode', opencode: { bin: opencodeBin } }),
        new OpencodeAdapter(),
        { once: true },
      );
      await startWatcher(
        root,
        defineConfig({ harness: 'codex', codex: { bin: FAKE_CODEX } }),
        new CodexAdapter(),
        { once: true },
      );
    } finally {
      console.log = originalLog;
    }

    assert.ok(
      logs.some((line) => line.includes('opencode 2.0.0')),
      logs.join('\n'),
    );
    assert.ok(
      logs.some((line) => line.includes('codex-cli 0.0.0-fake')),
      logs.join('\n'),
    );
  });
});

describe('task started events use the shared executor identity', () => {
  let root: string;

  beforeEach(async () => {
    clearModelEnv();
    root = await createScaffoldedProject('generic-started');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    restoreEnv();
  });

  it('records the selected harness and its model for agy, opencode, mock, and codex', async () => {
    const agyBin = await writeFakeExecutable(root, 'agy-started', 'agy 1.0.0');
    const opencodeBin = await writeFakeExecutable(root, 'opencode-started', 'opencode 1.0.0');
    process.env.AGY_PATH = agyBin;

    const cases: Array<{
      label: string;
      config: OsqConfig;
      adapter: HarnessAdapter;
      expected: string;
    }> = [
      {
        label: 'agy',
        config: defineConfig({ harness: 'agy' }),
        adapter: new AgyAdapter(),
        expected: DEFAULT_CONFIG.agy?.model ?? 'default',
      },
      {
        label: 'opencode',
        config: defineConfig({ harness: 'opencode', opencode: { bin: opencodeBin } }),
        adapter: new OpencodeAdapter(),
        expected: DEFAULT_CONFIG.opencode?.model ?? 'default',
      },
      {
        label: 'mock',
        config: defineConfig({ harness: 'mock' }),
        adapter: new MockAdapter(),
        expected: 'default',
      },
      {
        label: 'codex',
        config: defineConfig({ harness: 'codex', codex: { bin: FAKE_CODEX } }),
        adapter: new CodexAdapter(),
        expected: 'default',
      },
    ];

    for (const testCase of cases) {
      const specFolder = await createApprovedChange(
        root,
        testCase.config,
        `Started ${testCase.label}`,
      );
      await runTask(root, specFolder, '1', testCase.config, testCase.adapter);

      const expected = resolveExecutorIdentity(testCase.config);
      const started = await readStartedEvent(specFolder);
      assert.equal(started.harness, testCase.label, `${testCase.label} harness`);
      assert.equal(started.model, testCase.expected, `${testCase.label} model`);
      assert.equal(started.model, expected.model, `${testCase.label} shared identity model`);
      assert.equal(typeof started.osqVersion, 'string');
    }
  });
});

describe('planCommand uses the shared planner selection', () => {
  let root: string;
  let brief: string;

  beforeEach(async () => {
    clearModelEnv();
    root = await createScaffoldedProject('generic-plan');
    brief = path.join(root, 'brief.md');
    await fs.writeFile(brief, '# Plan Brief\n\nDesign the slice.\n', 'utf8');
  });

  afterEach(async () => {
    const mock = new MockAdapter();
    mock.resetBehavior();
    await fs.rm(root, { recursive: true, force: true });
    restoreEnv();
  });

  async function runPlan(name: string, configSource: string): Promise<InteractiveSessionOptions> {
    await fs.writeFile(path.join(root, 'osq.config.ts'), configSource, 'utf8');
    const adapter = new MockAdapter();
    await planCommand(name, { brief, cwd: root, adapter });
    assert.equal(adapter.recordedInteractiveSpawns.length, 1, 'one interactive session');
    return adapter.recordedInteractiveSpawns[0];
  }

  async function readBriefPlanner(name: string): Promise<string> {
    const changesDir = getChangesDir(DEFAULT_CONFIG.paths.openspecRoot, root);
    const folder = (await fs.readdir(changesDir)).find((entry) => entry.includes(name));
    assert.ok(folder, `change folder for ${name}`);
    const content = await fs.readFile(path.join(changesDir, folder, 'brief.md'), 'utf8');
    return String(parseFrontmatter(content).data.planner ?? '');
  }

  it('uses explicit planner values in brief metadata and interactive arguments', async () => {
    const session = await runPlan(
      'explicit-plan',
      "export default { harness: 'agy', planner: { harness: 'opencode', model: 'planner-model' } };\n",
    );
    assert.equal(session.model, 'planner-model');
    assert.equal(session.agent, 'osq-planner');
    assert.equal(await readBriefPlanner('explicit-plan'), 'planner-model');
    assert.notEqual(session.model, DEFAULT_CONFIG.agy?.model);
  });

  it('falls back to the selected executor entry when no planner block exists', async () => {
    const agy = await runPlan('implicit-agy', "export default { harness: 'agy' };\n");
    assert.equal(agy.model, DEFAULT_CONFIG.agy?.model);
    assert.equal(agy.agent, undefined);
    assert.equal(await readBriefPlanner('implicit-agy'), DEFAULT_CONFIG.agy?.model);

    const opencode = await runPlan(
      'implicit-opencode',
      "export default { harness: 'opencode' };\n",
    );
    assert.equal(opencode.model, DEFAULT_CONFIG.opencode?.model);
    assert.equal(opencode.agent, 'osq-planner');
    assert.equal(await readBriefPlanner('implicit-opencode'), DEFAULT_CONFIG.opencode?.model);

    const mock = await runPlan('implicit-mock', "export default { harness: 'mock' };\n");
    assert.equal(mock.model, undefined);
    assert.equal(mock.agent, undefined);
    assert.equal(await readBriefPlanner('implicit-mock'), '');
  });

  it('records default and passes no invented model for native Codex planning', async () => {
    const codex = await runPlan('implicit-codex', "export default { harness: 'codex' };\n");
    assert.equal(codex.model, undefined);
    assert.equal(codex.agent, undefined);
    assert.equal(await readBriefPlanner('implicit-codex'), 'default');

    const mixed = await runPlan(
      'mixed-codex-plan',
      "export default { harness: 'agy', planner: { harness: 'codex', model: 'codex-planner' } };\n",
    );
    assert.equal(mixed.model, 'codex-planner');
    assert.equal(mixed.agent, undefined);
    assert.equal(await readBriefPlanner('mixed-codex-plan'), 'codex-planner');
    assert.notEqual(mixed.model, DEFAULT_CONFIG.agy?.model);
  });
});
