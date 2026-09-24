import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import type { Logger } from '../src/core/foundation/logger.js';
import { approveSpec } from '../src/core/spec/approve.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { type RunTaskFailureReason, runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

interface ParsedEvent {
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

const PASS_VERIFY = 'node pass.cjs';
const PASS_OUT_VERIFY = 'node pass-out.cjs';
const FAIL_VERIFY = 'node fail.cjs';
const FLIP_VERIFY = 'node flip.cjs';

const PASS_SCRIPT = 'process.exit(0);\n';
const PASS_OUT_SCRIPT = "process.stdout.write('declared start state\\n');\nprocess.exit(0);\n";
const FAIL_SCRIPT = "console.error('verify exploded');\nprocess.exit(3);\n";
const FLIP_SCRIPT = [
  "const fs = require('node:fs');",
  "process.exit(fs.existsSync('agent-flag.txt') ? 0 : 1);",
  '',
].join('\n');

const TASKS_MD = `# Tasks

- [ ] 1. When a task starts, the pre-spawn check runs
`;

function proposalFor(verify: string): string {
  return `---
title: Pre-spawn verify
depends_on: []
verify: ${verify}
features:
  reads: []
---
## Goal

Exercise the pre-spawn verify check.

## Surface

None.
`;
}

/** Adapter that writes an agent flag file and a result before returning success. */
class FlagAdapter implements HarnessAdapter {
  readonly name = 'flag';
  spawnCalls = 0;

  constructor(private readonly writesFlag: boolean) {}

  async setup(_projectRoot: string, _config: unknown): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.spawnCalls += 1;
    if (this.writesFlag) {
      await fs.writeFile(path.join(options.projectRoot, 'agent-flag.txt'), 'written\n', 'utf8');
    }
    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(
      path.join(resultsDir, `${options.taskNumber}.md`),
      '# Agent result\n',
      'utf8',
    );
    return { exitCode: 0 };
  }
}

/** Minimal logger stub capturing warned lines. */
class StubLogger implements Logger {
  readonly warns: string[] = [];

  constructor(private readonly sink: Logger) {}

  info(msg: string): void {
    this.sink.info(msg);
  }

  verbose(msg: string): void {
    this.sink.verbose(msg);
  }

  warn(msg: string): void {
    this.warns.push(msg);
  }

  error(msg: string): void {
    this.sink.error(msg);
  }

  status(text: string): void {
    this.sink.status(text);
  }

  clearStatus(): void {
    this.sink.clearStatus();
  }
}

function silentLogger(): Logger {
  return {
    info: () => {},
    verbose: () => {},
    warn: () => {},
    error: () => {},
    status: () => {},
    clearStatus: () => {},
  };
}

describe('Pre-spawn verify check', () => {
  let tmpDir: string;
  let specFolder: string;

  async function writeChange(proposalVerify: string = PASS_VERIFY): Promise<void> {
    specFolder = path.join(tmpDir, 'openspec', 'changes', '001-pre-spawn');
    await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(specFolder, 'proposal.md'), proposalFor(proposalVerify), 'utf8');
    await fs.writeFile(path.join(specFolder, 'tasks.md'), TASKS_MD, 'utf8');
  }

  async function writeTask(options: {
    verify: string;
    verifyStarts?: 'red' | 'green' | 'any';
  }): Promise<void> {
    const lines = [
      '---',
      'title: When a task starts, the pre-spawn check runs',
      `verify: ${options.verify}`,
      'scope: []',
      'entry: []',
      'skills: []',
    ];
    if (options.verifyStarts) lines.push(`verify_starts: ${options.verifyStarts}`);
    lines.push('---', '## Acceptance', '- [ ] pre-spawn check runs');
    await fs.writeFile(path.join(specFolder, 'tasks', '1.md'), `${lines.join('\n')}\n`, 'utf8');
  }

  async function readEvents(taskNumber: string): Promise<ParsedEvent[]> {
    const eventPath = path.join(specFolder, '.run', 'events', `${taskNumber}.jsonl`);
    let raw = '';
    try {
      raw = await fs.readFile(eventPath, 'utf8');
    } catch {
      return [];
    }
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ParsedEvent);
  }

  async function approve(): Promise<void> {
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
  }

  function preSpawnEvents(events: ParsedEvent[]): ParsedEvent[] {
    return events.filter(
      (event) => event.type === 'verify_ran' && event.data?.phase === 'pre_spawn',
    );
  }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-pre-spawn-test-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'pass.cjs'), PASS_SCRIPT, 'utf8');
    await fs.writeFile(path.join(tmpDir, 'pass-out.cjs'), PASS_OUT_SCRIPT, 'utf8');
    await fs.writeFile(path.join(tmpDir, 'fail.cjs'), FAIL_SCRIPT, 'utf8');
    await fs.writeFile(path.join(tmpDir, 'flip.cjs'), FLIP_SCRIPT, 'utf8');
    await writeChange();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('RunTaskFailureReason includes verify_precondition', () => {
    const reason: RunTaskFailureReason = 'verify_precondition';
    assert.equal(reason, 'verify_precondition');
  });

  it('red start as expected: failing verify records mismatch false and runs to done', async () => {
    await writeTask({ verify: FLIP_VERIFY });
    await approve();
    const logger = new StubLogger(silentLogger());

    const result = await runTask(
      tmpDir,
      specFolder,
      '1',
      DEFAULT_CONFIG,
      new FlagAdapter(true),
      logger,
    );

    assert.equal(result.success, true);
    const events = await readEvents('1');
    const pre = preSpawnEvents(events);
    assert.equal(pre.length, 1);
    assert.equal(pre[0].data?.expected, 'red');
    assert.equal(pre[0].data?.mismatch, false);
    assert.equal(pre[0].data?.exitCode, 1);
    assert.equal(pre[0].data?.command, FLIP_VERIFY);
    assert.equal(logger.warns.length, 0, 'a matching red start logs no warning');

    // The pre-spawn run precedes both the measures start and the agent start.
    const preIndex = events.findIndex((event) => event.type === 'verify_ran');
    const measuresIndex = events.findIndex((event) => event.type === 'measures');
    const startedIndex = events.findIndex((event) => event.type === 'started');
    assert.ok(preIndex < measuresIndex, 'pre-spawn verify must precede measures');
    assert.ok(preIndex < startedIndex, 'pre-spawn verify must precede the agent start');

    // The post-spawn verify stays a plain verification event.
    const postSpawn = events.find(
      (event) => event.type === 'verify_ran' && event.data?.phase !== 'pre_spawn',
    );
    assert.ok(postSpawn, 'the ordinary task verify still runs');
    assert.equal(postSpawn.data?.exitCode, 0);
    assert.equal('expected' in (postSpawn.data ?? {}), false);
  });

  it('a passing verify under warn records mismatch true and warns once naming the task', async () => {
    await writeTask({ verify: PASS_VERIFY });
    await approve();
    const logger = new StubLogger(silentLogger());

    const result = await runTask(
      tmpDir,
      specFolder,
      '1',
      DEFAULT_CONFIG,
      new FlagAdapter(false),
      logger,
    );

    assert.equal(result.success, true);
    const events = await readEvents('1');
    const pre = preSpawnEvents(events);
    assert.equal(pre.length, 1);
    assert.equal(pre[0].data?.expected, 'red');
    assert.equal(pre[0].data?.mismatch, true);
    assert.equal(pre[0].data?.exitCode, 0);
    assert.equal(logger.warns.length, 1, 'exactly one warning');
    assert.equal(logger.warns[0], 'task 1 started green, but it declared red');
  });

  it('declared green start with a passing verify records mismatch false', async () => {
    await writeTask({ verify: PASS_VERIFY, verifyStarts: 'green' });
    await approve();
    const logger = new StubLogger(silentLogger());

    const result = await runTask(
      tmpDir,
      specFolder,
      '1',
      DEFAULT_CONFIG,
      new FlagAdapter(false),
      logger,
    );

    assert.equal(result.success, true);
    const pre = preSpawnEvents(await readEvents('1'));
    assert.equal(pre.length, 1);
    assert.equal(pre[0].data?.expected, 'green');
    assert.equal(pre[0].data?.mismatch, false);
    assert.equal(logger.warns.length, 0);
  });

  it('declared green start with a failing verify records mismatch true', async () => {
    await writeTask({ verify: FAIL_VERIFY, verifyStarts: 'green' });
    await approve();
    const logger = new StubLogger(silentLogger());

    const result = await runTask(
      tmpDir,
      specFolder,
      '1',
      DEFAULT_CONFIG,
      new FlagAdapter(false),
      logger,
    );

    assert.equal(result.reason, 'verify_red');
    const pre = preSpawnEvents(await readEvents('1'));
    assert.equal(pre.length, 1);
    assert.equal(pre[0].data?.expected, 'green');
    assert.equal(pre[0].data?.mismatch, true);
    assert.equal(logger.warns.length, 1);
    assert.equal(logger.warns[0], 'task 1 started red: verify fails, but it declared green');
  });

  it('an any start never mismatches', async () => {
    await writeTask({ verify: PASS_VERIFY, verifyStarts: 'any' });
    await approve();
    const logger = new StubLogger(silentLogger());

    const result = await runTask(
      tmpDir,
      specFolder,
      '1',
      DEFAULT_CONFIG,
      new FlagAdapter(false),
      logger,
    );

    assert.equal(result.success, true);
    const pre = preSpawnEvents(await readEvents('1'));
    assert.equal(pre.length, 1);
    assert.equal(pre[0].data?.expected, 'any');
    assert.equal(pre[0].data?.mismatch, false);
    assert.equal(logger.warns.length, 0);
  });

  it('fail mode kills before spawn with verify_precondition evidence', async () => {
    await writeTask({ verify: PASS_OUT_VERIFY });
    await approve();
    const failConfig: OsqConfig = {
      ...DEFAULT_CONFIG,
      gates: { changeVerifyAfterTask: true, preSpawnVerify: 'fail' },
    };
    const adapter = new FlagAdapter(false);

    const result = await runTask(tmpDir, specFolder, '1', failConfig, adapter);

    assert.equal(result.success, false);
    assert.equal(result.reason, 'verify_precondition');
    assert.equal(adapter.spawnCalls, 0, 'no agent may spawn on a pre-spawn failure');

    const events = await readEvents('1');
    assert.equal(
      events.some((event) => event.type === 'measures'),
      false,
      'no measures event may follow',
    );
    assert.equal(
      events.some((event) => event.type === 'started'),
      false,
      'no started event may follow',
    );
    const dead = events.find((event) => event.type === 'dead');
    assert.deepEqual(dead?.data, { task: '1', reason: 'verify_precondition' });

    const marker = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.match(marker, /reason: verify_precondition/);
    assert.match(marker, /command: "node pass-out\.cjs"/);
    assert.match(marker, /expected: red/);
    assert.match(marker, /exit_code: 0/);
    assert.match(marker, /declared start state/);
  });

  it('off mode runs no pre-spawn verify', async () => {
    await writeTask({ verify: PASS_VERIFY });
    await approve();
    const offConfig: OsqConfig = {
      ...DEFAULT_CONFIG,
      gates: { changeVerifyAfterTask: true, preSpawnVerify: 'off' },
    };

    const result = await runTask(tmpDir, specFolder, '1', offConfig, new FlagAdapter(false));

    assert.equal(result.success, true);
    const events = await readEvents('1');
    assert.equal(preSpawnEvents(events).length, 0);
    assert.ok(
      events.some((event) => event.type === 'verify_ran' && event.data?.phase !== 'pre_spawn'),
      'the ordinary task verify still runs',
    );
  });

  it('a later attempt runs no pre-spawn verify', async () => {
    await writeTask({ verify: PASS_VERIFY });
    await approve();
    const eventsDir = path.join(specFolder, '.run', 'events');
    await fs.mkdir(eventsDir, { recursive: true });
    await fs.appendFile(
      path.join(eventsDir, '1.jsonl'),
      `${JSON.stringify({
        type: 'retry',
        timestamp: new Date().toISOString(),
        data: { target: '1', reason: 'verify_red', attempt: 2 },
      })}\n`,
      'utf8',
    );

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, new FlagAdapter(false));

    assert.equal(result.success, true);
    const events = await readEvents('1');
    assert.equal(preSpawnEvents(events).length, 0, 'attempt 2 skips the pre-spawn check');
    const started = events.find((event) => event.type === 'started');
    assert.equal(started?.data?.attempt, 2);
  });
});
