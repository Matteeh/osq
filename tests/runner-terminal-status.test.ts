import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG, type OsqConfig, defineConfig } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { createLogger } from '../src/core/logger.js';
import { createNewSpec } from '../src/core/new.js';
import { MockAdapter } from '../src/harness/mock.js';
import { OpencodeAdapter } from '../src/harness/opencode.js';
import {
  type TaskHeartbeatStats,
  computeTaskHeartbeatStats,
  formatTaskHeartbeatLine,
  formatTaskStatusRow,
  formatTokens,
  relativizeToolSummary,
} from '../src/watcher/heartbeat.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

/** Fast heartbeat so the 1s TTY status cadence collapses to a test-friendly tick. */
const FAST_HEARTBEAT_CONFIG: OsqConfig = defineConfig({ log: { heartbeatSeconds: 0.05 } });

const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

/**
 * A minimal terminal so `logger.status()` actually renders. It records every
 * escape-coded chunk so a test can inspect the live status row byte stream.
 */
class FakeTtyStream extends Writable {
  readonly isTTY = true;
  readonly columns = 120;
  private chunks: string[] = [];

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    callback();
  }

  text(): string {
    return this.chunks.join('');
  }
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

function terminalWidth(): number {
  return (process.stderr as unknown as { columns?: number }).columns ?? 80;
}

async function writeTask(
  specFolder: string,
  title: string,
  verify = PASSING_VERIFY,
): Promise<void> {
  const taskPath = path.join(specFolder, 'tasks', '1.md');
  const task = [
    '---',
    `title: ${title}`,
    `verify: ${verify}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] should be observed',
  ].join('\n');
  await fs.writeFile(taskPath, `${task}\n`, 'utf8');
}

/**
 * Real on-disk OpenCode binary. It speaks the real JSON event stream: one tool
 * call and one step_finish carrying tokens and a non-zero cost. It writes its
 * own result file and lingers long enough for the heartbeat to observe it.
 * Nothing here is a mock adapter: the real `OpencodeAdapter` spawns this process
 * through the shared `spawnWithTimeout` helper.
 */
const FAKE_OPENCODE_SCRIPT = [
  '#!/usr/bin/env node',
  "import fs from 'node:fs';",
  "import path from 'node:path';",
  '',
  'const specFolder = process.env.OSQ_SPEC_FOLDER;',
  "const taskNumber = process.env.OSQ_TASK_NUMBER || '1';",
  '',
  'function emit(obj) { process.stdout.write(JSON.stringify(obj) + "\\n"); }',
  '',
  "emit({ type: 'tool_use', timestamp: Date.now(), tool: 'read', part: { state: { input: { path: 'src/watcher/runner.ts' } } } });",
  "emit({ type: 'step_finish', timestamp: Date.now(), part: { tokens: { total: 150, input: 100, output: 50, cache: { read: 0, write: 0 } }, cost: 0.0123 } });",
  '',
  "const resultsDir = path.join(specFolder, '.run', 'results');",
  'fs.mkdirSync(resultsDir, { recursive: true });',
  'fs.writeFileSync(path.join(resultsDir, taskNumber + ".md"), "# Result\\n\\nDone by fake opencode.\\n");',
  '',
  'setTimeout(() => process.exit(0), 300);',
  '',
].join('\n');

describe('Runner terminal status', () => {
  let tmpDir: string;
  let specFolder: string;
  let fakeOpencodeBin: string;
  let originalCI: string | undefined;

  function opencodeConfig(): OsqConfig {
    return {
      ...FAST_HEARTBEAT_CONFIG,
      opencode: {
        ...DEFAULT_CONFIG.opencode,
        bin: fakeOpencodeBin,
      },
    };
  }

  function opencodeAdapter(): OpencodeAdapter {
    return new OpencodeAdapter();
  }

  function makeTtyLogger(level: 'normal' | 'verbose', stream: FakeTtyStream) {
    return createLogger(level, undefined, { stream, isTTY: true });
  }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-terminal-status-test-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Terminal Status');
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
    await writeTask(specFolder, 'When a task runs the status row shows live counters');

    fakeOpencodeBin = path.join(tmpDir, 'fake-opencode.mjs');
    await fs.writeFile(fakeOpencodeBin, FAKE_OPENCODE_SCRIPT, { mode: 0o755 });

    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    originalCI = process.env.CI;
    Reflect.deleteProperty(process.env, 'CI');
  });

  afterEach(async () => {
    if (originalCI === undefined) {
      Reflect.deleteProperty(process.env, 'CI');
    } else {
      process.env.CI = originalCI;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('formatTaskStatusRow', () => {
    const stats: TaskHeartbeatStats = {
      elapsedSeconds: 12.3,
      eventCount: 7,
      totalTokens: 1500,
      toolCount: 3,
      cost: 0.0123,
      lastToolSummary: 'read src/index.ts',
    };

    it('renders task number, elapsed, tool count, tokens, cost, and summary', () => {
      const row = formatTaskStatusRow('7', stats);

      assert.match(row, /task 7/);
      assert.match(row, /12\.3s/);
      assert.match(row, /3 tools/);
      assert.match(row, /1\.5k tokens/);
      assert.match(row, /\$0\.0123/);
      assert.match(row, /read src\/index\.ts/);
    });

    it('omits cost and summary when they are not reported', () => {
      const row = formatTaskStatusRow('7', {
        elapsedSeconds: 1,
        eventCount: 1,
        totalTokens: 5,
        toolCount: 0,
      });

      assert.doesNotMatch(row, /\$/);
      assert.match(row, /task 7/);
    });

    it('renders the token count abbreviated in the status row', () => {
      const row = formatTaskStatusRow('7', { ...stats, totalTokens: 1_500_000 });
      assert.match(row, /1\.5M tokens/);
      assert.doesNotMatch(row, /1500000 tokens/);

      const kiloRow = formatTaskStatusRow('7', { ...stats, totalTokens: 1500 });
      assert.match(kiloRow, /1\.5k tokens/);
    });

    it('assembles the full row without truncating, leaving fitting to the logger sink', () => {
      const summary = 'x'.repeat(200);
      const row = formatTaskStatusRow('7', { ...stats, lastToolSummary: summary });

      assert.ok(row.endsWith(summary));
      assert.doesNotMatch(row, /…/);
    });
  });

  describe('formatTokens', () => {
    it('abbreviates counts at the 1k and 1M boundaries', () => {
      const cases: Array<[number, string]> = [
        [999, '999'],
        [1000, '1.0k'],
        [999_949, '999.9k'],
        [999_950, '1.0M'],
        [1_000_000, '1.0M'],
      ];

      for (const [tokens, expected] of cases) {
        assert.equal(formatTokens(tokens), expected, `formatTokens(${tokens})`);
      }
    });

    it('is applied identically to the heartbeat line', () => {
      const line = formatTaskHeartbeatLine('7', {
        elapsedSeconds: 12.3,
        eventCount: 7,
        totalTokens: 1500,
        toolCount: 3,
      });
      assert.match(line, /tokens: 1\.5k/);
      assert.doesNotMatch(line, /tokens: 1500/);
    });
  });

  describe('relativizeToolSummary', () => {
    const root = path.join(path.sep, 'tmp', 'project');

    it('strips the project root and its trailing separator from absolute paths', () => {
      const relative = path.join('specs', '014-x', 'tasks', '4.md');
      const summary = `read ${path.join(root, relative)}`;

      const relativized = relativizeToolSummary(summary, root);

      assert.equal(relativized, `read ${relative}`);
      assert.ok(
        !relativized.includes(`${path.sep}specs`),
        `expected no leading slash before specs, got: ${relativized}`,
      );
    });

    it('normalizes a trailing separator on the supplied root', () => {
      const relative = path.join('src', 'a.ts');
      assert.equal(
        relativizeToolSummary(`edit ${path.join(root, relative)}`, `${root}${path.sep}`),
        `edit ${relative}`,
      );
    });

    it('falls back to process.cwd() when no root is supplied', () => {
      const relative = path.join('src', 'index.ts');
      assert.equal(
        relativizeToolSummary(`read ${path.join(process.cwd(), relative)}`),
        `read ${relative}`,
      );
    });

    it('leaves absolute paths outside the project root untouched', () => {
      const outside = path.join(path.sep, 'etc', 'hosts');
      assert.equal(relativizeToolSummary(`read ${outside}`, root), `read ${outside}`);
    });

    it('relativizes an exact root match to a dot', () => {
      assert.equal(relativizeToolSummary(root, root), '.');
    });
  });

  describe('computeTaskHeartbeatStats', () => {
    async function appendLine(event: Record<string, unknown>): Promise<void> {
      const eventsDir = path.join(specFolder, '.run', 'events');
      await fs.mkdir(eventsDir, { recursive: true });
      await fs.appendFile(path.join(eventsDir, '1.jsonl'), `${JSON.stringify(event)}\n`, 'utf8');
    }

    it('counts tool events, sums tokens and cost, and keeps the last tool summary', async () => {
      await appendLine({ type: 'started', timestamp: 't', data: {} });
      await appendLine({ type: 'tokens', timestamp: 't', data: { totalTokens: 100, cost: 0.01 } });
      await appendLine({
        type: 'tool',
        timestamp: 't',
        data: { tool: 'read', summary: 'src/a.ts' },
      });
      await appendLine({
        type: 'tool',
        timestamp: 't',
        data: { tool: 'bash', summary: 'npm test' },
      });
      await appendLine({ type: 'tokens', timestamp: 't', data: { totalTokens: 50, cost: 0.02 } });

      const stats = await computeTaskHeartbeatStats(specFolder, '1', Date.now() - 1000);

      assert.equal(stats.eventCount, 5);
      assert.equal(stats.totalTokens, 150);
      assert.equal(stats.toolCount, 2);
      assert.equal(stats.lastToolSummary, 'npm test');
      assert.ok(Math.abs((stats.cost ?? 0) - 0.03) < 1e-9, `cost was ${stats.cost}`);
    });

    it('accumulates new events in memory instead of re-reading already-counted lines', async () => {
      const eventsDir = path.join(specFolder, '.run', 'events');
      await fs.mkdir(eventsDir, { recursive: true });
      const eventFilePath = path.join(eventsDir, '1.jsonl');

      // First complete line plus a partial second line that has not landed yet.
      await fs.writeFile(
        eventFilePath,
        `${JSON.stringify({ type: 'tokens', timestamp: 't', data: { totalTokens: 100 } })}\n{"type":"tokens","timestamp":"t","data":{"totalTokens":50`,
        'utf8',
      );

      const first = await computeTaskHeartbeatStats(specFolder, '1', Date.now());
      assert.equal(first.eventCount, 1);
      assert.equal(first.totalTokens, 100);

      // Complete the partial line. The already-counted first event must not be
      // counted twice, proving the counters live in memory between polls.
      await fs.appendFile(eventFilePath, '}}\n', 'utf8');

      const second = await computeTaskHeartbeatStats(specFolder, '1', Date.now());
      assert.equal(second.eventCount, 2);
      assert.equal(second.totalTokens, 150);
    });

    it('tolerates a missing event file with zeroed counters', async () => {
      const stats = await computeTaskHeartbeatStats(specFolder, '1', Date.now());
      assert.equal(stats.eventCount, 0);
      assert.equal(stats.totalTokens, 0);
      assert.equal(stats.toolCount, 0);
      assert.equal(stats.cost, undefined);
      assert.equal(stats.lastToolSummary, undefined);
    });

    it('relativizes tool summaries against the project root but keeps the raw event intact', async () => {
      const relative = path.join('specs', '014-status-row-fixes', 'tasks', '4.md');
      const absolute = path.join(tmpDir, relative);
      await appendLine({ type: 'tool', timestamp: 't', data: { tool: 'read', summary: absolute } });

      const stats = await computeTaskHeartbeatStats(specFolder, '1', Date.now(), tmpDir);

      assert.equal(stats.lastToolSummary, relative);

      const raw = await fs.readFile(path.join(specFolder, '.run', 'events', '1.jsonl'), 'utf8');
      assert.ok(raw.includes(absolute), 'raw events.jsonl must preserve the absolute summary');
    });

    it('falls back to process.cwd() for tool summaries when projectRoot is omitted', async () => {
      const relative = path.join('src', 'watcher', 'runner.ts');
      const absolute = path.join(process.cwd(), relative);
      await appendLine({ type: 'tool', timestamp: 't', data: { tool: 'read', summary: absolute } });

      const stats = await computeTaskHeartbeatStats(specFolder, '1', Date.now());

      assert.equal(stats.lastToolSummary, relative);
    });

    it('renders the relativized tool path in the status row without a leading slash', async () => {
      const relative = path.join('specs', '014-status-row-fixes', 'tasks', '4.md');
      const absolute = path.join(tmpDir, relative);
      await appendLine({ type: 'tool', timestamp: 't', data: { tool: 'read', summary: absolute } });

      const stats = await computeTaskHeartbeatStats(specFolder, '1', Date.now(), tmpDir);
      const row = formatTaskStatusRow('1', stats);

      assert.ok(row.includes(relative), `expected relative path in row: ${row}`);
      assert.ok(
        !row.includes(`${path.sep}specs`),
        `expected no leading slash before specs in row: ${row}`,
      );
    });
  });

  describe('task start and outcome lines', () => {
    it('logs a single started line with the title truncated to the terminal width', async () => {
      const longTitle =
        'When a task runs the runner prints an extremely long descriptive title that overflows';
      await writeTask(specFolder, longTitle);
      await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

      const stderr = await captureStderr(async () => {
        const result = await runTask(
          tmpDir,
          specFolder,
          '1',
          DEFAULT_CONFIG,
          new MockAdapter(),
          createLogger('normal'),
        );
        assert.equal(result.success, true);
      });

      const started = stderr.split('\n').find((line) => line.includes('started'));
      assert.ok(started, `expected a started line in: ${stderr}`);
      assert.equal(started.includes('\n'), false);
      assert.ok(
        started.length <= terminalWidth(),
        `started line exceeded terminal width: ${started}`,
      );
      assert.match(started, /started/);
    });

    it('logs a verified outcome line with elapsed seconds', async () => {
      const stderr = await captureStderr(async () => {
        await runTask(
          tmpDir,
          specFolder,
          '1',
          DEFAULT_CONFIG,
          new MockAdapter(),
          createLogger('normal'),
        );
      });

      assert.match(stderr, /task 1 verified \(elapsed: \d+(\.\d+)?s\)/);
    });

    it('logs a dead outcome line with the reason and elapsed seconds', async () => {
      await writeTask(
        specFolder,
        'When verify fails the outcome line carries the reason',
        'node -e "process.exit(1)"',
      );
      await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

      const stderr = await captureStderr(async () => {
        await runTask(
          tmpDir,
          specFolder,
          '1',
          DEFAULT_CONFIG,
          new MockAdapter(),
          createLogger('normal'),
        );
      });

      assert.match(stderr, /task 1 dead \(reason: verify_red, elapsed: \d+(\.\d+)?s\)/);
    });
  });

  describe('end-to-end status via the real opencode stream parser', () => {
    it('redraws a TTY status row with the live tool count, tokens, cost, and summary', async () => {
      const stream = new FakeTtyStream();
      const logger = makeTtyLogger('normal', stream);

      const result = await runTask(
        tmpDir,
        specFolder,
        '1',
        opencodeConfig(),
        opencodeAdapter(),
        logger,
      );

      assert.equal(result.success, true);

      const output = stream.text();
      assert.match(output, /task 1/);
      assert.match(output, /1 tools/);
      assert.match(output, /150 tokens/);
      assert.match(output, /\$0\.0123/);
      assert.match(output, /src\/watcher\/runner\.ts/);
      // The status row is rendered by the logger, which owns the spinner.
      assert.match(output, /[\u2800-\u28ff]/, `expected a spinner frame in: ${output}`);
    });

    it('redraws the status row with a repo-relative tool path from an absolute summary', async () => {
      const absPath = path.join(tmpDir, 'src', 'watcher', 'runner.ts');
      const script = [
        '#!/usr/bin/env node',
        "import fs from 'node:fs';",
        "import path from 'node:path';",
        'const specFolder = process.env.OSQ_SPEC_FOLDER;',
        "const taskNumber = process.env.OSQ_TASK_NUMBER || '1';",
        'function emit(obj) { process.stdout.write(JSON.stringify(obj) + "\\n"); }',
        `emit({ type: 'tool_use', timestamp: Date.now(), tool: 'read', part: { state: { input: { path: ${JSON.stringify(absPath)} } } } });`,
        "const resultsDir = path.join(specFolder, '.run', 'results');",
        'fs.mkdirSync(resultsDir, { recursive: true });',
        'fs.writeFileSync(path.join(resultsDir, taskNumber + ".md"), "# Result\\n\\nDone.\\n");',
        'setTimeout(() => process.exit(0), 300);',
        '',
      ].join('\n');

      const bin = path.join(tmpDir, 'fake-opencode-abs.mjs');
      await fs.writeFile(bin, script, { mode: 0o755 });
      const config: OsqConfig = {
        ...FAST_HEARTBEAT_CONFIG,
        opencode: { ...DEFAULT_CONFIG.opencode, bin },
      };

      const stream = new FakeTtyStream();
      const logger = makeTtyLogger('normal', stream);

      const result = await runTask(tmpDir, specFolder, '1', config, opencodeAdapter(), logger);

      assert.equal(result.success, true);
      const output = stream.text();
      const relative = path.join('src', 'watcher', 'runner.ts');
      assert.ok(output.includes(relative), `expected relative path in status output: ${output}`);
      assert.ok(
        !output.includes(`${path.sep}src${path.sep}watcher`),
        `expected no absolute path in status output: ${output}`,
      );
    });

    it('derives the non-TTY heartbeat log from the same counters', async () => {
      const stderr = await captureStderr(async () => {
        await runTask(
          tmpDir,
          specFolder,
          '1',
          opencodeConfig(),
          opencodeAdapter(),
          createLogger('normal'),
        );
      });

      assert.match(stderr, /heartbeat \(elapsed: \d+(\.\d+)?s, events: \d+, tokens: 150\)/);
      assert.doesNotMatch(stderr, /heartbeat .*cost/);
    });

    it('demotes the periodic heartbeat log to verbose on a TTY', async () => {
      const stream = new FakeTtyStream();
      const logger = makeTtyLogger('normal', stream);

      await runTask(tmpDir, specFolder, '1', opencodeConfig(), opencodeAdapter(), logger);

      assert.match(stream.text(), /task 1/);
      assert.doesNotMatch(
        stream.text(),
        /heartbeat \(elapsed:/,
        'normal TTY logger must not emit heartbeat lines at info level',
      );
    });

    it('still emits the periodic heartbeat at verbose on a TTY', async () => {
      const stream = new FakeTtyStream();
      const logger = makeTtyLogger('verbose', stream);

      await runTask(tmpDir, specFolder, '1', opencodeConfig(), opencodeAdapter(), logger);

      assert.match(stream.text(), /heartbeat \(elapsed: \d+(\.\d+)?s, events: \d+, tokens: 150\)/);
    });
  });
});
