import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { acquireLock } from '../src/core/run/lock.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { parseFrontmatter } from '../src/core/spec/parser.js';
import { MockAdapter, type MockBehavior } from '../src/harness/mock.js';
import type {
  DeadEventData,
  DoneEventData,
  HarnessAdapter,
  HarnessEventType,
  SpawnResult,
  SpawnTaskOptions,
} from '../src/harness/types.js';
import type { RunTaskFailureReason } from '../src/watcher/outcome.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

// Compile-time acceptance: the union and payload interfaces must exist and have
// the documented shapes. These assertions run for real, so the imports are used.
const DONE_TYPE: HarnessEventType = 'done';
const DEAD_TYPE: HarnessEventType = 'dead';
const DONE_DATA: DoneEventData = { task: '1' };
const DEAD_DATA: DeadEventData = { task: '1', reason: 'no_result' };

/**
 * The single source of truth for every failure outcome the runner can report.
 * The parameterized table below must cover every member except `already_running`,
 * which is a lock collision rather than a task failure and never writes a marker.
 */
const ALL_FAILURE_REASONS: readonly RunTaskFailureReason[] = [
  'spec_conflict',
  'already_running',
  'no_result',
  'verify_red',
  'crashed',
  'timeout',
  'undeclared_test_change',
];
const DEAD_FAILURE_REASONS: readonly RunTaskFailureReason[] = ALL_FAILURE_REASONS.filter(
  (reason) => reason !== 'already_running',
);

interface ParsedEvent {
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

interface ScenarioContext {
  readonly tmpDir: string;
  readonly specFolder: string;
}

interface DeadScenario {
  readonly name: string;
  readonly reason: RunTaskFailureReason;
  readonly prepare?: (ctx: ScenarioContext) => Promise<void>;
  readonly behavior?: MockBehavior;
  readonly mutate?: (ctx: ScenarioContext) => Promise<void>;
}

/**
 * Adapter that mutates the workspace while the task is "running", then delegates
 * to the mock. This is how the undeclared_test_change scenario simulates an agent
 * editing a preexisting test file without touching the real `tests/` tree.
 */
class MutatingMockAdapter extends MockAdapter {
  constructor(private readonly mutate: (projectRoot: string) => Promise<void>) {
    super();
  }

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    await this.mutate(options.projectRoot);
    return super.spawn(options);
  }
}

const PASSING_VERIFY = 'node verify.cjs';
const FAILING_VERIFY = 'exit 1';
const EXISTING_TEST = path.join('tests', 'existing.test.ts');
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

const DEAD_SCENARIOS: readonly DeadScenario[] = [
  {
    name: 'no_result',
    reason: 'no_result',
    behavior: { writeResult: false },
  },
  {
    name: 'crashed',
    reason: 'crashed',
    behavior: { exitCode: 7, error: 'boom' },
  },
  {
    name: 'timeout',
    reason: 'timeout',
    behavior: { timedOut: true },
  },
  {
    name: 'verify_red',
    reason: 'verify_red',
    prepare: async ({ tmpDir, specFolder }) => {
      await writeTask(specFolder, FAILING_VERIFY);
      await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    },
  },
  {
    name: 'spec_conflict (tampered task)',
    reason: 'spec_conflict',
    prepare: async ({ specFolder }) => {
      await fs.appendFile(path.join(specFolder, 'tasks', '1.md'), '\n<!-- tampered -->\n', 'utf8');
    },
  },
  {
    name: 'spec_conflict (missing approval)',
    reason: 'spec_conflict',
    prepare: async ({ specFolder }) => {
      await fs.rm(path.join(specFolder, '.run', 'approved'), { force: true });
    },
  },
  {
    name: 'undeclared_test_change',
    reason: 'undeclared_test_change',
    prepare: async ({ tmpDir }) => {
      const testPath = path.join(tmpDir, EXISTING_TEST);
      await fs.mkdir(path.dirname(testPath), { recursive: true });
      await fs.writeFile(testPath, '// preexisting test\n', 'utf8');
    },
    mutate: async ({ tmpDir }) => {
      await fs.writeFile(path.join(tmpDir, EXISTING_TEST), '// modified by the agent\n', 'utf8');
    },
  },
];

async function readEvents(specFolder: string, taskNumber: string): Promise<ParsedEvent[]> {
  const eventFilePath = path.join(specFolder, '.run', 'events', `${taskNumber}.jsonl`);
  const raw = await fs.readFile(eventFilePath, 'utf8');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

async function writeTask(specFolder: string, verify: string): Promise<void> {
  const taskPath = path.join(specFolder, 'tasks', '1.md');
  const task = [
    '---',
    'title: When the runner writes a marker, a matching event is appended',
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
 * Assert marker/event parity for a failure: the dead marker exists, its YAML
 * frontmatter declares the reason, and exactly one matching dead event exists.
 */
async function assertDeadMarkerAndEvent(
  specFolder: string,
  taskNumber: string,
  reason: RunTaskFailureReason,
): Promise<void> {
  const markerPath = path.join(specFolder, '.run', 'dead', `${taskNumber}.md`);
  const content = await fs.readFile(markerPath, 'utf8');
  const { data } = parseFrontmatter(content);
  assert.equal(data.reason, reason, `dead marker frontmatter must declare reason ${reason}`);

  const deadEvents = (await readEvents(specFolder, taskNumber)).filter((e) => e.type === 'dead');
  assert.equal(deadEvents.length, 1, `expected exactly one dead event for ${reason}`);
  assert.deepEqual(deadEvents[0].data, { task: taskNumber, reason });
}

describe('Runner done and dead events', () => {
  let tmpDir: string;
  let specFolder: string;
  let adapter: MockAdapter;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-done-dead-events-test-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Done Dead Events');
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
    adapter = new MockAdapter();
    await writeTask(specFolder, PASSING_VERIFY);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    adapter.resetBehavior();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('defines the done and dead event payloads', () => {
    assert.equal(DONE_TYPE, 'done');
    assert.equal(DEAD_TYPE, 'dead');
    assert.equal(DONE_DATA.task, '1');
    assert.equal(DEAD_DATA.task, '1');
    assert.equal(DEAD_DATA.reason, 'no_result');
  });

  it('parameterizes every dead RunTaskFailureReason and isolates already_running', () => {
    const covered = new Set(DEAD_SCENARIOS.map((scenario) => scenario.reason));
    for (const reason of DEAD_FAILURE_REASONS) {
      assert.ok(covered.has(reason), `missing parameterized scenario for ${reason}`);
    }
    assert.equal(covered.has('already_running'), false);
  });

  it('appends a done event alongside the done marker on success', async () => {
    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.success, true);

    // The done marker exists...
    await fs.stat(path.join(specFolder, '.run', 'done', '1'));

    // ...no dead marker is left behind...
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.md')), false);

    // ...and exactly one matching done event was appended.
    const doneEvents = (await readEvents(specFolder, '1')).filter((e) => e.type === 'done');
    assert.equal(doneEvents.length, 1);
    assert.deepEqual(doneEvents[0].data, { task: '1' });
    assert.ok(!Number.isNaN(Date.parse(doneEvents[0].timestamp)));
  });

  for (const scenario of DEAD_SCENARIOS) {
    it(`appends a dead event alongside the dead marker for ${scenario.name}`, async () => {
      const ctx: ScenarioContext = { tmpDir, specFolder };
      if (scenario.prepare) {
        await scenario.prepare(ctx);
      }
      if (scenario.behavior) {
        adapter.setBehavior(scenario.behavior);
      }

      const { mutate } = scenario;
      const runAdapter: HarnessAdapter = mutate
        ? new MutatingMockAdapter(() => mutate(ctx))
        : adapter;

      const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, runAdapter);
      assert.equal(result.success, false);
      assert.equal(result.reason, scenario.reason);

      await assertDeadMarkerAndEvent(specFolder, '1', scenario.reason);
    });
  }

  it('writes neither a dead marker nor a dead event for already_running', async () => {
    await acquireLock(path.join(specFolder, '.run'), '1');

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.success, false);
    assert.equal(result.reason, 'already_running');

    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.md')), false);

    let deadEvents: ParsedEvent[] = [];
    try {
      deadEvents = (await readEvents(specFolder, '1')).filter((e) => e.type === 'dead');
    } catch {
      // Event file may not exist if no events were appended
    }
    assert.equal(deadEvents.length, 0);
  });
});
