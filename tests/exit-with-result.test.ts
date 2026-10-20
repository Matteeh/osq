import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { parseFrontmatter } from '../src/core/spec/parser.js';
import { MockAdapter, type MockBehavior } from '../src/harness/mock.js';
import type { RunTaskResult } from '../src/watcher/outcome.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

const PASSING_VERIFY = 'node verify.cjs';
const FAILING_VERIFY = 'exit 1';
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

interface ExitScenario {
  readonly name: string;
  readonly behavior: MockBehavior;
  readonly verify?: string;
  readonly earlierResult?: boolean;
  readonly taskEnds: 'done' | 'dead';
  readonly deadReason?: string;
  readonly exitContinued: readonly Record<string, unknown>[];
}

/**
 * Rows of the "Agent exit and result file" scenario: timeouts and attempts that
 * wrote no result die as before, while a non-zero exit after writing the result
 * continues into the watcher's own checks.
 */
const EXIT_SCENARIOS: readonly ExitScenario[] = [
  {
    name: 'a non-zero exit after writing its result passes the checks',
    behavior: { exitCode: 1 },
    taskEnds: 'done',
    exitContinued: [{ exitCode: 1 }],
  },
  {
    name: 'a non-zero exit after writing its result with a red verify dies',
    behavior: { exitCode: 1 },
    verify: FAILING_VERIFY,
    taskEnds: 'dead',
    deadReason: 'verify_red',
    exitContinued: [{ exitCode: 1 }],
  },
  {
    name: 'a non-zero exit after writing a blocked result dies blocked',
    behavior: {
      exitCode: 1,
      resultContent: '# Result\n\n## Changed\n\n- work\n\n## Blocked\n\nNeeds src/b.ts in scope\n',
    },
    taskEnds: 'dead',
    deadReason: 'blocked',
    exitContinued: [{ exitCode: 1 }],
  },
  {
    name: 'a non-zero exit without a result dies crashed',
    behavior: { exitCode: 1, writeResult: false },
    taskEnds: 'dead',
    deadReason: 'crashed',
    exitContinued: [],
  },
  {
    name: 'a result left from an earlier attempt does not count',
    behavior: { exitCode: 1, writeResult: false },
    earlierResult: true,
    taskEnds: 'dead',
    deadReason: 'crashed',
    exitContinued: [],
  },
  {
    name: 'a timeout after writing its result dies as before',
    behavior: { timedOut: true },
    taskEnds: 'dead',
    deadReason: 'timeout',
    exitContinued: [],
  },
  {
    name: 'a zero exit after writing its result runs the checks',
    behavior: { exitCode: 0 },
    taskEnds: 'done',
    exitContinued: [],
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
    'title: When the agent exits non-zero after writing its result, the watcher judges the task',
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

describe('Agent exit and result file', () => {
  let tmpDir: string;
  let specFolder: string;
  let adapter: MockAdapter;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-exit-with-result-test-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Exit With Result');
    specFolder = spec.folderPath;
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
    const proposalPath = path.join(specFolder, 'proposal.md');
    const proposal = await fs.readFile(proposalPath, 'utf8');
    await fs.writeFile(
      proposalPath,
      proposal.replace(/^verify:.*$/m, `verify: ${PASSING_VERIFY}`),
      'utf8',
    );
    adapter = new MockAdapter();
    await writeTask(specFolder, PASSING_VERIFY);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    adapter.resetBehavior();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  for (const scenario of EXIT_SCENARIOS) {
    it(scenario.name, async () => {
      if (scenario.verify) {
        await writeTask(specFolder, scenario.verify);
        await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
      }
      if (scenario.earlierResult) {
        const earlierPath = path.join(specFolder, '.run', 'results', '1.md');
        await fs.mkdir(path.dirname(earlierPath), { recursive: true });
        await fs.writeFile(earlierPath, '# Result from an earlier attempt\n', 'utf8');
        const anHourAgo = (Date.now() - 60 * 60 * 1000) / 1000;
        await fs.utimes(earlierPath, anHourAgo, anHourAgo);
      }
      adapter.setBehavior(scenario.behavior);

      const result: RunTaskResult = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);

      assert.equal(result.success, scenario.taskEnds === 'done');
      if (scenario.taskEnds === 'done') {
        assert.equal(await exists(path.join(specFolder, '.run', 'done', '1')), true);
        assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.md')), false);
      } else {
        assert.equal(result.reason, scenario.deadReason);
        assert.equal(await exists(path.join(specFolder, '.run', 'done', '1')), false);
        const markerPath = path.join(specFolder, '.run', 'dead', '1.md');
        const { data } = parseFrontmatter(await fs.readFile(markerPath, 'utf8'));
        assert.equal(data.reason, scenario.deadReason);
      }

      const exitContinued = (await readEvents(specFolder, '1'))
        .filter((event) => event.type === 'exit_continued')
        .map((event) => event.data);
      assert.deepEqual(exitContinued, scenario.exitContinued);
    });
  }
});
