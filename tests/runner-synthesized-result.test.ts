import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createLogger } from '../src/core/foundation/logger.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { AgyAdapter } from '../src/harness/agy/agy.js';
import { OpencodeAdapter } from '../src/harness/opencode/opencode.js';
import type { HarnessAdapter, HarnessEventType, TextEventData } from '../src/harness/types.js';
import { runTask } from '../src/watcher/runner.js';
import {
  extractFinalTextFromStream,
  findUndeclaredTestChanges,
  runVerificationGate,
  snapshotTestFiles,
  synthesizeResultFile,
} from '../src/watcher/verify.js';
import { installFakeValidator } from './helpers.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

interface ParsedEvent {
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

async function appendRawEvent(
  specFolder: string,
  taskNumber: string,
  event: Record<string, unknown>,
): Promise<void> {
  const eventsDir = path.join(specFolder, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  await fs.appendFile(
    path.join(eventsDir, `${taskNumber}.jsonl`),
    `${JSON.stringify(event)}\n`,
    'utf8',
  );
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

async function writePassingTask(specFolder: string): Promise<void> {
  const taskPath = path.join(specFolder, 'tasks', '1.md');
  const task = [
    '---',
    'title: When synthesis runs, the verify gate still decides',
    `verify: ${PASSING_VERIFY}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] should pass',
  ].join('\n');
  await fs.writeFile(taskPath, `${task}\n`, 'utf8');
}

/**
 * Real on-disk agy binary. It speaks the stream-json protocol with partial
 * `text_delta` fragments and a final `result` payload carrying the completed
 * response, and deliberately writes no result file so the runner must
 * synthesize one. Nothing here is a mock adapter: the real `AgyAdapter` spawns
 * this process through the shared `spawnWithTimeout` helper.
 */
const FAKE_AGY_SCRIPT = `#!/usr/bin/env node
const lines = [
  JSON.stringify({ event: 'init', init: { cwd: process.cwd() } }),
  JSON.stringify({ event: 'step_update', step_update: { step_index: 1, state: 'ACTIVE', step_type: 'agent_response', text_delta: 'partial one ' } }),
  JSON.stringify({ event: 'step_update', step_update: { step_index: 1, state: 'ACTIVE', step_type: 'agent_response', text_delta: 'partial two' } }),
  JSON.stringify({ event: 'step_update', step_update: { step_index: 1, state: 'DONE', step_type: 'agent_response', text_delta: '\\n', usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } } }),
  JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'I finished the agy task.\\n' } }),
];
for (const line of lines) process.stdout.write(line + '\\n');
process.exit(0);
`;

/**
 * Real on-disk OpenCode binary emitting the JSON event stream with a completed
 * `text` part, again without writing a result file.
 */
const FAKE_OPENCODE_SCRIPT = `#!/usr/bin/env node
const lines = [
  JSON.stringify({ type: 'step_start', timestamp: 1789673165771, part: { id: 'prt_1', type: 'step-start' } }),
  JSON.stringify({ type: 'text', timestamp: 1789673166596, part: { id: 'prt_2', type: 'text', text: 'I finished the opencode task.' } }),
  JSON.stringify({ type: 'step_finish', timestamp: 1789673166622, part: { tokens: { total: 15, input: 10, output: 5, cache: { write: 0, read: 0 } }, cost: 0 } }),
];
for (const line of lines) process.stdout.write(line + '\\n');
process.exit(0);
`;

/** Real on-disk OpenCode binary that emits no assistant text at all. */
const FAKE_OPENCODE_SILENT_SCRIPT = `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ type: 'step_start', timestamp: 1789673165771, part: { id: 'prt_1', type: 'step-start' } }) + '\\n');
process.exit(0);
`;

describe('Runner synthesized result', () => {
  let tmpDir: string;
  let specFolder: string;
  let fakeAgyBin: string;
  let fakeOpencodeBin: string;
  let originalAgyPath: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-synthesized-result-test-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Synthesized Result');
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
    await writePassingTask(specFolder);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    fakeAgyBin = path.join(tmpDir, 'fake-agy.mjs');
    fakeOpencodeBin = path.join(tmpDir, 'fake-opencode.mjs');
    await fs.writeFile(fakeAgyBin, FAKE_AGY_SCRIPT, { mode: 0o755 });
    await fs.writeFile(fakeOpencodeBin, FAKE_OPENCODE_SCRIPT, { mode: 0o755 });

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

  function opencodeConfig(bin: string = fakeOpencodeBin): OsqConfig {
    return {
      ...DEFAULT_CONFIG,
      opencode: {
        ...DEFAULT_CONFIG.opencode,
        bin,
      },
    };
  }

  function spawnOptions(config: OsqConfig): Parameters<HarnessAdapter['spawn']>[0] {
    return {
      projectRoot: tmpDir,
      specFolderPath: specFolder,
      taskNumber: '1',
      taskTitle: 'When synthesis runs, the verify gate still decides',
      verifyCommand: 'node -e "process.exit(0)"',
      scope: [],
      entry: [],
      skills: [],
      tier: 'coding',
      timeoutSeconds: 30,
      config,
    };
  }

  it('HarnessEventType includes text and TextEventData carries a text string', () => {
    const eventType: HarnessEventType = 'text';
    const data: TextEventData = { text: 'completed assistant message' };
    assert.equal(eventType, 'text');
    assert.equal(data.text, 'completed assistant message');
  });

  it('extractFinalTextFromStream returns null when no text event exists', async () => {
    await appendRawEvent(specFolder, '1', {
      type: 'tokens',
      timestamp: new Date().toISOString(),
      data: { promptTokens: 1, candidateTokens: 2 },
    });

    assert.equal(await extractFinalTextFromStream(specFolder, '1'), null);
  });

  it('extractFinalTextFromStream returns null when the event stream is missing', async () => {
    assert.equal(await extractFinalTextFromStream(specFolder, '404'), null);
  });

  it('extractFinalTextFromStream returns the last emitted text message', async () => {
    await appendRawEvent(specFolder, '1', {
      type: 'text',
      timestamp: new Date().toISOString(),
      data: { text: 'first message' },
    });
    await appendRawEvent(specFolder, '1', {
      type: 'text',
      timestamp: new Date().toISOString(),
      data: { text: 'final message' },
    });

    assert.equal(await extractFinalTextFromStream(specFolder, '1'), 'final message');
  });

  it('extractFinalTextFromStream ignores raw harness payload shapes (fallback candidate list dropped)', async () => {
    // None of these are first-class `text` events; the old candidate list would
    // have picked them up.
    await appendRawEvent(specFolder, '1', {
      type: 'step_update',
      timestamp: new Date().toISOString(),
      data: { text_delta: 'streamed delta', response: 'raw response' },
      step_update: { text_delta: 'raw step delta', text: 'raw step text' },
    });
    await appendRawEvent(specFolder, '1', {
      type: 'tokens',
      timestamp: new Date().toISOString(),
      data: { text: 'not a text event', message: 'nope' },
    });

    assert.equal(await extractFinalTextFromStream(specFolder, '1'), null);
  });

  it('synthesizeResultFile writes synthesized: true frontmatter and an attribution header', async () => {
    const resultsDir = path.join(specFolder, '.run', 'results');
    const resultPath = await synthesizeResultFile(resultsDir, '1', 'the agent final message');

    assert.equal(resultPath, path.join(resultsDir, '1.md'));
    const content = await fs.readFile(resultPath, 'utf8');
    assert.match(content, /^---\nsynthesized: true\n---\n/);
    assert.match(content, /Synthesized by the osq watcher/);
    assert.ok(content.includes('the agent final message'));
  });

  it('verify.ts exports the synthesis and gating helpers', () => {
    assert.equal(typeof extractFinalTextFromStream, 'function');
    assert.equal(typeof synthesizeResultFile, 'function');
    assert.equal(typeof snapshotTestFiles, 'function');
    assert.equal(typeof findUndeclaredTestChanges, 'function');
    assert.equal(typeof runVerificationGate, 'function');
  });

  it('verify.ts stays under the 200 line lifecycle module budget', async () => {
    const source = await fs.readFile(path.join(REPO_ROOT, 'src', 'watcher', 'verify.ts'), 'utf8');
    assert.ok(source.split('\n').length < 200, 'verify.ts must be under 200 lines');
  });

  it('snapshotTestFiles and findUndeclaredTestChanges report edits and deletions but allow new files', async () => {
    const testsDir = path.join(tmpDir, 'tests');
    await fs.mkdir(testsDir, { recursive: true });
    const tracked = path.join(testsDir, 'tracked.test.ts');
    await fs.writeFile(tracked, '// original\n', 'utf8');

    const snapshot = await snapshotTestFiles(tmpDir);
    assert.equal(snapshot.has('tests/tracked.test.ts'), true);
    assert.deepEqual(await findUndeclaredTestChanges(tmpDir, snapshot), []);

    await fs.writeFile(path.join(testsDir, 'brand-new.test.ts'), '// new\n', 'utf8');
    assert.deepEqual(await findUndeclaredTestChanges(tmpDir, snapshot), []);

    await fs.writeFile(tracked, '// edited\n', 'utf8');
    assert.deepEqual(await findUndeclaredTestChanges(tmpDir, snapshot), [
      'tests/tracked.test.ts (modified)',
    ]);

    await fs.rm(tracked);
    assert.deepEqual(await findUndeclaredTestChanges(tmpDir, snapshot), [
      'tests/tracked.test.ts (deleted)',
    ]);
  });

  it('runVerificationGate passes a zero exit and reports a non-zero diagnostic', async () => {
    const pass = await runVerificationGate(tmpDir, 'node -e "process.exit(0)"', 30);
    assert.deepEqual(pass, { passed: true, timedOut: false });

    const fail = await runVerificationGate(
      tmpDir,
      'node -e "process.stderr.write(\'boom\'); process.exit(1)"',
      30,
    );
    assert.equal(fail.passed, false);
    assert.equal(fail.timedOut, false);
    assert.match(fail.error ?? '', /boom/);
  });

  it('runVerificationGate enforces the timeout and reports timedOut', async () => {
    const result = await runVerificationGate(tmpDir, 'node -e "setTimeout(() => {}, 30000)"', 1);
    assert.equal(result.passed, false);
    assert.equal(result.timedOut, true);
    assert.match(result.error ?? '', /timed out/);
  });

  const harnessCases = [
    {
      label: 'AgyAdapter',
      createAdapter: () => new AgyAdapter() as HarnessAdapter,
      config: () => DEFAULT_CONFIG,
      expectedText: 'I finished the agy task.\n',
      partialFragments: ['partial one ', 'partial two', '\n'],
    },
    {
      label: 'OpencodeAdapter',
      createAdapter: () => new OpencodeAdapter() as HarnessAdapter,
      config: () => opencodeConfig(),
      expectedText: 'I finished the opencode task.',
      partialFragments: [],
    },
  ] as const;

  for (const harnessCase of harnessCases) {
    it(`${harnessCase.label} emits a text event carrying the completed assistant message`, async () => {
      const adapter = harnessCase.createAdapter();
      const result = await adapter.spawn(spawnOptions(harnessCase.config()));

      assert.equal(result.exitCode, 0);

      const events = await readEvents(specFolder, '1');
      const textEvents = events.filter((event) => event.type === 'text');
      assert.equal(textEvents.length, 1, 'exactly one completed text event');
      assert.deepEqual(textEvents[0].data, { text: harnessCase.expectedText });

      for (const fragment of harnessCase.partialFragments) {
        assert.ok(
          !textEvents.some((event) => event.data?.text === fragment),
          `partial text fragment ${JSON.stringify(fragment)} must not become a text event`,
        );
      }
    });

    it(`${harnessCase.label} exit 0 with no result file synthesizes from the last text event`, async () => {
      const adapter = harnessCase.createAdapter();
      const logger = createLogger('verbose');

      let success = false;
      const stderr = await captureStderr(async () => {
        const result = await runTask(
          tmpDir,
          specFolder,
          '1',
          harnessCase.config(),
          adapter,
          logger,
        );
        success = result.success;
      });

      assert.equal(success, true);

      // Result file was synthesized from the real adapter's text event.
      const resultPath = path.join(specFolder, '.run', 'results', '1.md');
      const content = await fs.readFile(resultPath, 'utf8');
      assert.match(content, /^---\nsynthesized: true\n---\n/);
      assert.match(content, /Synthesized by the osq watcher/);
      assert.ok(content.includes(harnessCase.expectedText.trim()));

      const events = await readEvents(specFolder, '1');
      const textEvents = events.filter((event) => event.type === 'text');
      assert.equal(textEvents.length, 1, 'the adapter emitted exactly one text event');

      const resultWritten = events.find((event) => event.type === 'result_written');
      assert.ok(resultWritten, 'expected a result_written event');
      assert.equal(resultWritten.data?.synthesized, true);

      // The independent verify still ran and passed, and the task is done.
      assert.ok(events.some((event) => event.type === 'verify_ran'));
      await fs.stat(path.join(specFolder, '.run', 'done', '1'));

      assert.match(stderr, /task 1 result synthesized from agent message/);
    });
  }

  it('case B: real adapter exit 0 with neither result file nor text is dead with reason no_result', async () => {
    const silentBin = path.join(tmpDir, 'fake-opencode-silent.mjs');
    await fs.writeFile(silentBin, FAKE_OPENCODE_SILENT_SCRIPT, { mode: 0o755 });

    const adapter = new OpencodeAdapter();
    const result = await runTask(tmpDir, specFolder, '1', opencodeConfig(silentBin), adapter);

    assert.equal(result.success, false);
    assert.equal(result.reason, 'no_result');

    const deadContent = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.ok(deadContent.includes('reason: no_result'));

    const resultExists = await fs
      .stat(path.join(specFolder, '.run', 'results', '1.md'))
      .then(() => true)
      .catch(() => false);
    assert.equal(resultExists, false);
  });

  it('README documents the synthesized result behavior for the no_result reason', async () => {
    const readme = await fs.readFile(path.join(REPO_ROOT, 'README.md'), 'utf8');
    assert.match(readme, /synthesi[sz]ed/i);
    assert.match(readme, /no_result/);
  });
});
