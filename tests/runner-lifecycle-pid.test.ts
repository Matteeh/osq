import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { createLogger } from '../src/core/logger.js';
import { createNewSpec } from '../src/core/new.js';
import { AgyAdapter } from '../src/harness/agy.js';
import { OpencodeAdapter } from '../src/harness/opencode.js';
import type { HarnessAdapter } from '../src/harness/types.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

interface ParsedEvent {
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

async function readEvents(specFolder: string, taskNumber: string): Promise<ParsedEvent[]> {
  const eventFilePath = path.join(specFolder, '.run', 'events', `${taskNumber}.jsonl`);
  let raw = '';
  try {
    raw = await fs.readFile(eventFilePath, 'utf8');
  } catch {
    return [];
  }
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

/**
 * A real-on-disk harness binary. It is executed by the actual adapters through
 * the shared `spawnWithTimeout` helper; nothing here is mocked. It writes the
 * result file the runner expects and exits cleanly.
 */
const FAKE_HARNESS_SCRIPT = `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const specFolder = process.env.OSQ_SPEC_FOLDER;
const taskNumber = process.env.OSQ_TASK_NUMBER;
if (specFolder && taskNumber) {
  const resultsDir = path.join(specFolder, '.run', 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(
    path.join(resultsDir, taskNumber + '.md'),
    '# Result written by fake harness binary\\n',
    'utf8',
  );
}
process.exit(0);
`;

const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

async function writeTask(specFolder: string): Promise<void> {
  const taskPath = path.join(specFolder, 'tasks', '1.md');
  const task = [
    '---',
    'title: When a task is spawned, onSpawn records started with pid',
    `verify: ${PASSING_VERIFY}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] should be observed',
  ].join('\n');
  await fs.writeFile(taskPath, `${task}\n`, 'utf8');
}

async function captureStderr(fn: () => Promise<void>): Promise<string> {
  const originalWrite = process.stderr.write;
  let stderr = '';
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stderr.write;

  try {
    await fn();
  } finally {
    process.stderr.write = originalWrite;
  }

  return stderr;
}

describe('Runner lifecycle PID ownership', () => {
  let tmpDir: string;
  let specFolder: string;
  let fakeAgyBin: string;
  let fakeOpencodeBin: string;
  let originalAgyPath: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-lifecycle-pid-test-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Lifecycle Pid');
    specFolder = spec.folderPath;
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
    const seededProposalPath = path.join(specFolder, 'proposal.md');
    const seededProposal = await fs.readFile(seededProposalPath, 'utf8').catch(() => null);
    if (seededProposal !== null) {
      await fs.writeFile(
        seededProposalPath,
        seededProposal.replace(/^verify:.*$/m, `verify: ${PASSING_VERIFY}`),
        'utf8',
      );
    }
    await writeTask(specFolder);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    fakeAgyBin = path.join(tmpDir, 'fake-agy.mjs');
    fakeOpencodeBin = path.join(tmpDir, 'fake-opencode.mjs');
    await fs.writeFile(fakeAgyBin, FAKE_HARNESS_SCRIPT, { mode: 0o755 });
    await fs.writeFile(fakeOpencodeBin, FAKE_HARNESS_SCRIPT, { mode: 0o755 });

    originalAgyPath = process.env.AGY_PATH;
    process.env.AGY_PATH = fakeAgyBin;
  });

  afterEach(async () => {
    if (originalAgyPath === undefined) {
      Reflect.deleteProperty(process.env, 'AGY_PATH');
    } else {
      process.env.AGY_PATH = originalAgyPath;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function opencodeConfig(): OsqConfig {
    return {
      ...DEFAULT_CONFIG,
      opencode: {
        ...DEFAULT_CONFIG.opencode,
        bin: fakeOpencodeBin,
      },
    };
  }

  function spawnOptions(adapter: HarnessAdapter): Parameters<HarnessAdapter['spawn']>[0] {
    return {
      projectRoot: tmpDir,
      specFolderPath: specFolder,
      taskNumber: '1',
      taskTitle: 'When a task is spawned, onSpawn records started with pid',
      verifyCommand: 'node -e "process.exit(0)"',
      scope: [],
      entry: [],
      skills: [],
      tier: 'coding',
      timeoutSeconds: 30,
      config: adapter instanceof OpencodeAdapter ? opencodeConfig() : DEFAULT_CONFIG,
    };
  }

  for (const { label, createAdapter } of [
    { label: 'AgyAdapter', createAdapter: () => new AgyAdapter() as HarnessAdapter },
    { label: 'OpencodeAdapter', createAdapter: () => new OpencodeAdapter() as HarnessAdapter },
  ]) {
    it(`${label} forwards onSpawn, returns pid/elapsedMs, and emits no lifecycle events`, async () => {
      const adapter = createAdapter();
      const spawnedPids: number[] = [];

      const result = await adapter.spawn({
        ...spawnOptions(adapter),
        onSpawn: (pid) => {
          spawnedPids.push(pid);
        },
      });

      assert.equal(result.exitCode, 0);
      assert.equal(spawnedPids.length, 1, 'onSpawn must fire exactly once');
      assert.equal(typeof result.pid, 'number');
      assert.ok((result.pid ?? 0) > 0, 'the adapter must return the real child pid');
      assert.equal(result.pid, spawnedPids[0]);
      assert.equal(typeof result.elapsedMs, 'number');
      assert.ok((result.elapsedMs ?? -1) >= 0);

      // Lifecycle events belong to the runner alone; the adapter emits none.
      const events = await readEvents(specFolder, '1');
      assert.equal(
        events.filter((event) => event.type === 'started').length,
        0,
        'adapter must not append started',
      );
      assert.equal(
        events.filter((event) => event.type === 'exited').length,
        0,
        'adapter must not append exited',
      );
    });

    it(`runTask through ${label} records exactly one started and one exited with matching pid`, async () => {
      const adapter = createAdapter();
      const config = adapter instanceof OpencodeAdapter ? opencodeConfig() : DEFAULT_CONFIG;
      const logger = createLogger('normal');

      let result: Awaited<ReturnType<typeof runTask>> | undefined;
      const stderr = await captureStderr(async () => {
        result = await runTask(tmpDir, specFolder, '1', config, adapter, logger);
      });

      assert.ok(result);
      assert.equal(result.success, true);

      const events = await readEvents(specFolder, '1');
      const startedEvents = events.filter((event) => event.type === 'started');
      const exitedEvents = events.filter((event) => event.type === 'exited');

      assert.equal(startedEvents.length, 1, 'exactly one started event');
      assert.equal(exitedEvents.length, 1, 'exactly one exited event');

      const startedIndex = events.findIndex((event) => event.type === 'started');
      const exitedIndex = events.findIndex((event) => event.type === 'exited');
      assert.ok(startedIndex < exitedIndex, 'started must precede exited');

      const startedPid = startedEvents[0].data?.pid;
      assert.equal(typeof startedPid, 'number');
      assert.ok((startedPid as number) > 0, 'started event carries the real pid');
      assert.equal(startedEvents[0].data?.timeoutSeconds, config.timeouts.taskTimeoutSeconds);

      assert.equal(exitedEvents[0].data?.pid, startedPid, 'exited pid matches started pid');
      assert.equal(exitedEvents[0].data?.exitCode, 0);
      assert.equal(exitedEvents[0].data?.timedOut, false);
      assert.equal(typeof exitedEvents[0].data?.elapsedSeconds, 'number');
      assert.ok((exitedEvents[0].data?.elapsedSeconds as number) >= 0);

      assert.match(
        stderr,
        new RegExp(
          `task 1 started \\(pid: ${startedPid}, timeout: ${config.timeouts.taskTimeoutSeconds}s\\)`,
        ),
        'the true pid is logged to stderr at start time',
      );
    });
  }
});
