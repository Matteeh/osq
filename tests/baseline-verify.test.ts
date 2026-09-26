import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import type { Logger } from '../src/core/foundation/logger.js';
import { retrySpec } from '../src/core/lifecycle/retry.js';
import { approveSpec } from '../src/core/spec/approve.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import type { RunTaskFailureReason } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const HALT = 'tree was red before this change started';
const PASS = 'process.exit(0);\n';
const FAIL = 'process.exit(1);\n';
const COUNT = [
  "const fs = require('node:fs');",
  "const path = require('node:path');",
  "fs.appendFileSync(path.join(__dirname, 'baseline-count.txt'), 'x');",
  '',
].join('\n');
const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

interface ParsedEvent {
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

/** A logger that records its info lines, so the halt line can be asserted. */
function recordingLogger(): { infos: string[]; logger: Logger } {
  const infos: string[] = [];
  return {
    infos,
    logger: {
      info: (msg) => infos.push(msg),
      verbose: () => {},
      warn: () => {},
      error: () => {},
      status: () => {},
      clearStatus: () => {},
    },
  };
}

/** Adapter that writes a result, optionally mutating the tree after each spawn. */
class CountingAdapter implements HarnessAdapter {
  readonly name = 'counting';
  spawns = 0;

  constructor(private readonly onSpawn?: (projectRoot: string) => Promise<void>) {}

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.spawns += 1;
    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(path.join(resultsDir, `${options.taskNumber}.md`), '# Result\n', 'utf8');
    if (this.onSpawn) await this.onSpawn(options.projectRoot);
    return { exitCode: 0 };
  }
}

function configWith(baselineVerify?: string, autoRetries = 0): OsqConfig {
  return {
    ...DEFAULT_CONFIG,
    gates: {
      ...DEFAULT_GATES_CONFIG,
      preSpawnVerify: 'off',
      autoRetries,
      ...(baselineVerify ? { baselineVerify } : {}),
    },
  };
}

const PROPOSAL = `---
title: Baseline verify
depends_on: []
verify: node pass.cjs
features:
  reads: []
---
## Goal

Exercise the baseline gate.

## Surface

None.
`;

/** Scaffold a project with the fake validator and the pass/fail scripts. */
async function makeRoot(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'pass.cjs'), PASS, 'utf8');
  await fs.writeFile(path.join(root, 'fail.cjs'), FAIL, 'utf8');
  return root;
}

/** Write and return a change whose tasks carry `verifies` in order. */
async function writeChange(
  root: string,
  id: string,
  slug: string,
  verifies: string[],
): Promise<string> {
  const folder = path.join(root, 'openspec', 'changes', `${id}-${slug}`);
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folder, 'proposal.md'), PROPOSAL, 'utf8');
  for (const [index, verify] of verifies.entries()) {
    const number = index + 1;
    const task = [
      '---',
      `title: Baseline task ${number}`,
      `verify: ${verify}`,
      'scope: []',
      'entry: []',
      'skills: []',
      '---',
      '## Acceptance',
      `- [ ] task ${number} decides`,
      '',
    ].join('\n');
    await fs.writeFile(path.join(folder, 'tasks', `${number}.md`), task, 'utf8');
  }
  const items = verifies.map((_, index) => `- [ ] ${index + 1}. Baseline task ${index + 1}`);
  await fs.writeFile(path.join(folder, 'tasks.md'), `# Tasks\n\n${items.join('\n')}\n`, 'utf8');
  return folder;
}

async function events(folder: string, name = 'change'): Promise<ParsedEvent[]> {
  const raw = await fs
    .readFile(path.join(folder, '.run', 'events', `${name}.jsonl`), 'utf8')
    .catch(() => '');
  const trimmed = raw.trim();
  return trimmed === '' ? [] : trimmed.split('\n').map((line) => JSON.parse(line) as ParsedEvent);
}

function ofType(list: readonly ParsedEvent[], type: string): ParsedEvent[] {
  return list.filter((event) => event.type === type);
}

/** Run a git test command with redirecting variables cleared. */
async function git(args: string[], cwd: string): Promise<void> {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE']) {
    Reflect.deleteProperty(env, key);
  }
  await execFileAsync('git', args, { cwd, env });
}

/** Two approved changes in a committed git repo, with a counting baseline. */
async function setupReuse(): Promise<{ root: string; config: OsqConfig; countPath: string }> {
  const root = await makeRoot('osq-baseline-reuse-');
  await fs.mkdir(path.join(root, '.run'), { recursive: true });
  const countPath = path.join(root, '.run', 'baseline-count.txt');
  await fs.writeFile(path.join(root, '.run', 'baseline.cjs'), COUNT, 'utf8');
  await writeChange(root, '001', 'reuse-one', ['node fail.cjs']);
  await writeChange(root, '002', 'reuse-two', ['node fail.cjs']);
  const config = configWith('node .run/baseline.cjs');
  await approveSpec(root, '001', config);
  await approveSpec(root, '002', config);
  await git(['init', '-q', '-b', 'main'], root);
  await git(['config', 'user.name', 'osq'], root);
  await git(['config', 'user.email', 'osq@example.invalid'], root);
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'init'], root);
  return { root, config, countPath };
}

async function countRuns(countPath: string): Promise<number> {
  return (await fs.readFile(countPath, 'utf8').catch(() => '')).length;
}

/** The second change's `baseline_ran` events. */
async function reuseBaselines(root: string): Promise<ParsedEvent[]> {
  const folder = path.join(root, 'openspec', 'changes', '002-reuse-two');
  return ofType(await events(folder), 'baseline_ran');
}

describe("baseline verify before a change's first task", () => {
  it('kills the first task with baseline_red before any agent spawns', async () => {
    const root = await makeRoot('osq-baseline-red-');
    const folder = await writeChange(root, '001', 'red', ['node pass.cjs']);
    const config = configWith('node fail.cjs', DEFAULT_GATES_CONFIG.autoRetries);
    await approveSpec(root, '001', config);
    const adapter = new CountingAdapter();
    const { infos, logger } = recordingLogger();

    const summary = await runWatcherOnce(root, config, adapter, logger);

    assert.equal(adapter.spawns, 0, 'no agent spawns for a red baseline');
    assert.equal(summary.retried, 0, 'baseline_red waits for a human');
    assert.equal(ofType(await events(folder), 'baseline_ran')[0]?.data?.outcome, 'failed');
    const taskEvents = await events(folder, '1');
    assert.equal(
      taskEvents.some((event) => event.type === 'started'),
      false,
    );
    assert.equal(
      taskEvents.some((event) => event.type === 'retry'),
      false,
    );
    await assert.rejects(fs.stat(path.join(folder, '.run', 'dead', '1.1.md')));

    const marker = await fs.readFile(path.join(folder, '.run', 'dead', '1.md'), 'utf8');
    assert.match(marker, /^reason: baseline_red$/m);
    assert.ok(marker.includes('command: "node fail.cjs"') && marker.includes('exit_code: 1'));
    assert.ok(marker.includes('run osq retry 001 1') && marker.includes(HALT));
    assert.ok(
      infos.some((line) => line.includes(HALT)),
      'the halt line is printed',
    );
  });

  it('records a passed baseline before the task start and runs the task', async () => {
    const root = await makeRoot('osq-baseline-green-');
    const folder = await writeChange(root, '001', 'green', ['node fail.cjs']);
    const config = configWith('node pass.cjs');
    await approveSpec(root, '001', config);
    const adapter = new CountingAdapter();

    await runWatcherOnce(root, config, adapter, undefined);

    const baselines = ofType(await events(folder), 'baseline_ran');
    assert.equal(baselines[0]?.data?.outcome, 'passed');
    const started = (await events(folder, '1')).find((event) => event.type === 'started');
    assert.ok(started, 'task 1 starts after the green baseline');
    assert.equal(adapter.spawns, 1);
    assert.ok(String(baselines[0]?.timestamp) <= String(started?.timestamp));
  });

  it('runs the baseline again after osq retry', async () => {
    const root = await makeRoot('osq-baseline-retry-');
    await fs.writeFile(
      path.join(root, 'flip.cjs'),
      "const fs = require('node:fs');\nprocess.exit(fs.existsSync('baseline-ok.txt') ? 0 : 1);\n",
      'utf8',
    );
    const folder = await writeChange(root, '001', 'retry', ['node fail.cjs']);
    const config = configWith('node flip.cjs');
    await approveSpec(root, '001', config);
    const adapter = new CountingAdapter();

    await runWatcherOnce(root, config, adapter, undefined);
    assert.equal(adapter.spawns, 0, 'the red baseline blocks the first spawn');

    await fs.writeFile(path.join(root, 'baseline-ok.txt'), 'ok\n', 'utf8');
    await retrySpec(root, '001', '1', config);
    await runWatcherOnce(root, config, adapter, undefined);

    assert.deepEqual(
      ofType(await events(folder), 'baseline_ran').map((event) => event.data?.outcome),
      ['failed', 'passed'],
    );
    assert.equal(adapter.spawns, 1);
  });

  it('runs no baseline for a later task once a task has started', async () => {
    const root = await makeRoot('osq-baseline-started-');
    const folder = await writeChange(root, '001', 'started', ['node pass.cjs', 'node fail.cjs']);
    const config = configWith('node pass.cjs');
    await approveSpec(root, '001', config);

    await runWatcherOnce(root, config, new CountingAdapter(), undefined);

    const baselines = ofType(await events(folder), 'baseline_ran');
    assert.equal(baselines.length, 1, 'only the first task settles the baseline');
    assert.equal(baselines[0]?.data?.outcome, 'passed');
    const second = await events(folder, '2');
    assert.ok(
      second.some((event) => event.type === 'started'),
      'task 2 runs',
    );
    assert.equal(
      second.some((event) => event.type === 'baseline_ran'),
      false,
    );
  });

  it('runs nothing when gates.baselineVerify is unset', async () => {
    const root = await makeRoot('osq-baseline-unset-');
    const folder = await writeChange(root, '001', 'unset', ['node fail.cjs']);
    const config = configWith(undefined);
    await approveSpec(root, '001', config);
    const adapter = new CountingAdapter();

    await runWatcherOnce(root, config, adapter, undefined);

    assert.equal(ofType(await events(folder), 'baseline_ran').length, 0);
    assert.equal(adapter.spawns, 1);
  });

  it('names baseline_red in the failure reason union', () => {
    const reason: RunTaskFailureReason = 'baseline_red';
    assert.equal(reason, 'baseline_red');
  });
});

describe('baseline reuse', () => {
  it("reuses the first change's green baseline on an unchanged tree", async () => {
    const { root, config, countPath } = await setupReuse();

    await runWatcherOnce(root, config, new CountingAdapter(), undefined);

    const baselines = await reuseBaselines(root);
    assert.equal(baselines[0]?.data?.outcome, 'reused');
    assert.equal(baselines[0]?.data?.reusedFrom, '001-reuse-one');
    assert.equal(await countRuns(countPath), 1, 'the command ran only for the first change');
  });

  const mutations = [
    [
      'tracked',
      (root: string) => fs.appendFile(path.join(root, 'tracked.txt'), 'changed\n', 'utf8'),
    ],
    [
      'untracked',
      (root: string) => fs.writeFile(path.join(root, 'untracked.txt'), 'new\n', 'utf8'),
    ],
  ] as const;

  for (const [label, mutate] of mutations) {
    it(`runs again when a ${label} file changed after the first green baseline`, async () => {
      const { root, config, countPath } = await setupReuse();
      if (label === 'tracked') {
        await fs.writeFile(path.join(root, 'tracked.txt'), 'one\n', 'utf8');
        await git(['add', 'tracked.txt'], root);
        await git(['commit', '-qm', 'tracked'], root);
      }

      await runWatcherOnce(root, config, new CountingAdapter(mutate), undefined);

      const baselines = await reuseBaselines(root);
      assert.equal(baselines[0]?.data?.outcome, 'passed');
      assert.equal(baselines[0]?.data?.reusedFrom, undefined);
      assert.equal(await countRuns(countPath), 2);
    });
  }
});
