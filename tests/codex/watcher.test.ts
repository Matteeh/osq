import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { reportCommand } from '../../src/cli/report.js';
import { approveSpec } from '../../src/core/approve.js';
import { type OsqConfig, defineConfig } from '../../src/core/config.js';
import { getArchiveDir } from '../../src/core/layout.js';
import { CodexAdapter } from '../../src/harness/codex.js';
import { startWatcher } from '../../src/watcher/loop.js';
import { runTask } from '../../src/watcher/runner.js';
import {
  FAKE_CODEX,
  FIXTURE_EVENTS,
  FIXTURE_TURN_FAILED,
  codexConfig,
  createCodexProject,
  writeCodexTask,
} from './support.js';

const FAKE_ENV_KEYS = [
  'OSQ_FAKE_JSONL',
  'OSQ_FAKE_MODE',
  'OSQ_FAKE_EXIT',
  'OSQ_FAKE_STDERR',
  'OSQ_FAKE_RESULT_TEXT',
  'OSQ_FAKE_VERSION_CODE',
  'OSQ_FAKE_VERSION_HANG',
  'CODEX_PATH',
  'OSQ_MODEL',
] as const;

const SAVED_ENV = new Map(FAKE_ENV_KEYS.map((key) => [key, process.env[key]]));

const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

function restoreFakeEnv(): void {
  for (const [key, value] of SAVED_ENV) {
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
}

function setEnv(values: Partial<Record<(typeof FAKE_ENV_KEYS)[number], string>>): void {
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
}

async function approveTask(
  root: string,
  specFolder: string,
  config: OsqConfig,
  verify?: string,
): Promise<void> {
  await fs.writeFile(path.join(root, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  const proposalPath = path.join(specFolder, 'proposal.md');
  const proposal = await fs.readFile(proposalPath, 'utf8').catch(() => null);
  if (proposal !== null) {
    await fs.writeFile(
      proposalPath,
      proposal.replace(/^verify:.*$/m, `verify: ${PASSING_VERIFY}`),
      'utf8',
    );
  }
  await writeCodexTask(specFolder, { verify: verify ?? PASSING_VERIFY });
  await approveSpec(root, '001', config);
}

async function readEvents(
  specFolder: string,
  taskNumber: string,
): Promise<Array<Record<string, unknown>>> {
  const raw = await fs
    .readFile(path.join(specFolder, '.run', 'events', `${taskNumber}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function markerText(markerPath: string): Promise<string> {
  return await fs.readFile(markerPath, 'utf8').catch(() => '');
}

describe('Codex watcher preflight', () => {
  afterEach(() => restoreFakeEnv());

  it('fails before task spawn on a missing, nonzero, or timed-out probe', async () => {
    const { root, specFolder } = await createCodexProject('codex-preflight-watch');
    const originalExit = process.exit;
    const originalExitCode = process.exitCode;
    const originalError = console.error;
    const errors: string[] = [];
    try {
      await approveTask(root, specFolder, codexConfig());
      console.error = (...args: unknown[]) => errors.push(args.map(String).join(' '));
      process.exit = ((code: number) => {
        throw new Error(`PROCESS_EXIT_${code}`);
      }) as unknown as typeof process.exit;

      const missing: OsqConfig = defineConfig({
        harness: 'codex',
        codex: { bin: path.join(root, 'missing-codex') },
      });
      await assert.rejects(() => startWatcher(root, missing, new CodexAdapter(), { once: true }));
      assert.equal(errors.length, 1);
      assert.match(errors[0], /missing-codex/);

      errors.length = 0;
      setEnv({ OSQ_FAKE_VERSION_CODE: '2' });
      await assert.rejects(() =>
        startWatcher(root, codexConfig(), new CodexAdapter(), { once: true }),
      );
      assert.equal(errors.length, 1);
      assert.match(errors[0], new RegExp(FAKE_CODEX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

      errors.length = 0;
      restoreFakeEnv();
      setEnv({ OSQ_FAKE_VERSION_HANG: '1' });
      const timedOut = defineConfig({
        harness: 'codex',
        codex: { bin: FAKE_CODEX },
        timeouts: { harnessPreflightSeconds: 1 },
      });
      await assert.rejects(() => startWatcher(root, timedOut, new CodexAdapter(), { once: true }));

      // No lock or task marker was created: preflight stopped before spawn.
      assert.equal(
        await fs
          .stat(path.join(specFolder, '.run', 'running', '1.pid'))
          .then(() => true)
          .catch(() => false),
        false,
      );
    } finally {
      process.exit = originalExit;
      process.exitCode = originalExitCode;
      console.error = originalError;
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('probes the configured binary and dispatches an approved task after a successful probe', async () => {
    const { root, specFolder } = await createCodexProject('codex-preflight-ok');
    try {
      await approveTask(root, specFolder, codexConfig());
      setEnv({ OSQ_FAKE_RESULT_TEXT: '# Authored by fake codex\n' });

      const logLines: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => logLines.push(args.map(String).join(' '));
      try {
        await startWatcher(root, codexConfig(), new CodexAdapter(), { once: true });
      } finally {
        console.log = originalLog;
      }

      assert.ok(logLines.some((line) => line.includes('codex-cli 0.0.0-fake')));
      const folderName = path.basename(specFolder);
      const archived = path.join(getArchiveDir('openspec', root), folderName);
      assert.ok(
        await fs
          .stat(path.join(archived, '.run', 'done', '1'))
          .then(() => true)
          .catch(() => false),
        'the approved task runs to done after preflight',
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe('Codex runner outcomes', () => {
  afterEach(() => restoreFakeEnv());

  it('preserves a supplied result and reaches done only after watcher verification', async () => {
    const { root, specFolder } = await createCodexProject('codex-run-supplied');
    try {
      const config = codexConfig({ model: 'gpt-5-codex' });
      await approveTask(root, specFolder, config);
      setEnv({ OSQ_FAKE_RESULT_TEXT: '# Authored result\n\nAll good.\n' });

      const result = await runTask(root, specFolder, '1', config, new CodexAdapter());
      assert.equal(result.success, true);

      const authored = await fs.readFile(path.join(specFolder, '.run', 'results', '1.md'), 'utf8');
      assert.equal(authored, '# Authored result\n\nAll good.\n');

      const events = await readEvents(specFolder, '1');
      assert.ok(events.some((event) => event.type === 'verify_ran'));
      assert.ok(events.some((event) => event.type === 'done'));
      const started = events.find((event) => event.type === 'started');
      assert.equal((started?.data as { model?: string } | undefined)?.model, 'gpt-5-codex');
      assert.ok(await markerText(path.join(specFolder, '.run', 'done', '1')));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('synthesizes a missing result from the last completed assistant text', async () => {
    const { root, specFolder } = await createCodexProject('codex-run-synth');
    try {
      const config = codexConfig();
      await approveTask(root, specFolder, config);
      setEnv({ OSQ_FAKE_JSONL: FIXTURE_EVENTS });

      const result = await runTask(root, specFolder, '1', config, new CodexAdapter());
      assert.equal(result.success, true);

      const synthesized = await fs.readFile(
        path.join(specFolder, '.run', 'results', '1.md'),
        'utf8',
      );
      assert.match(synthesized, /^---\nsynthesized: true\n---\n/);
      assert.ok(synthesized.includes('Implemented the change.'));

      const events = await readEvents(specFolder, '1');
      const started = events.find((event) => event.type === 'started');
      assert.equal(
        (started?.data as { model?: string } | undefined)?.model,
        'default',
        'native Codex model is the default sentinel',
      );
      assert.ok(events.some((event) => event.type === 'result_written'));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('fails with no_result when neither a result file nor final text exists', async () => {
    const { root, specFolder } = await createCodexProject('codex-run-no-result');
    try {
      const config = codexConfig();
      await approveTask(root, specFolder, config);

      const result = await runTask(root, specFolder, '1', config, new CodexAdapter());
      assert.equal(result.success, false);
      assert.equal(result.reason, 'no_result');
      assert.match(
        await markerText(path.join(specFolder, '.run', 'dead', '1.md')),
        /reason: no_result/,
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('fails with verify_red when independent verification fails', async () => {
    const { root, specFolder } = await createCodexProject('codex-run-verify-red');
    try {
      const config = codexConfig();
      await approveTask(root, specFolder, config, 'node -e "process.exit(1)"');
      setEnv({ OSQ_FAKE_RESULT_TEXT: '# Authored result\n' });

      const result = await runTask(root, specFolder, '1', config, new CodexAdapter());
      assert.equal(result.success, false);
      assert.equal(result.reason, 'verify_red');
      assert.match(
        await markerText(path.join(specFolder, '.run', 'dead', '1.md')),
        /reason: verify_red/,
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('records crashed for a terminal turn.failed even when the process exits zero', async () => {
    const { root, specFolder } = await createCodexProject('codex-run-turn-failed');
    try {
      const config = codexConfig();
      await approveTask(root, specFolder, config);
      setEnv({ OSQ_FAKE_JSONL: FIXTURE_TURN_FAILED });

      const result = await runTask(root, specFolder, '1', config, new CodexAdapter());
      assert.equal(result.success, false);
      assert.equal(result.reason, 'crashed');
      const dead = await markerText(path.join(specFolder, '.run', 'dead', '1.md'));
      assert.match(dead, /reason: crashed/);
      assert.match(dead, /codex exploded mid-turn/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('reportCommand JSON consumes normalized usage and file events without double counting', async () => {
    const { root, specFolder } = await createCodexProject('codex-report');
    try {
      const config = codexConfig({ model: 'gpt-5-codex' });
      await approveTask(root, specFolder, config);
      setEnv({ OSQ_FAKE_JSONL: FIXTURE_EVENTS });
      const result = await runTask(root, specFolder, '1', config, new CodexAdapter());
      assert.equal(result.success, true);

      const output = await reportCommand({ cwd: root, config, json: true });
      const report = JSON.parse(output) as {
        tokens: {
          input: number;
          output: number;
          cached_input: number;
          reasoning: number;
          total: number;
          cacheSharePercent: number;
        };
        fileChanges: { totalChanges: number; uniqueCount: number; uniqueFiles: string[] };
      };

      assert.deepEqual(report.tokens, {
        input: 100,
        output: 25,
        cached_input: 40,
        reasoning: 7,
        total: 125,
        cacheSharePercent: 28.6,
      });
      assert.equal(report.fileChanges.totalChanges, 2);
      assert.equal(report.fileChanges.uniqueCount, 2);
      assert.deepEqual(report.fileChanges.uniqueFiles, ['src/a.ts', 'src/b.ts']);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
