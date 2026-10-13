import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { buildOpeningPrompt } from '../src/cli/plan.js';
import {
  DEFAULT_PLANNING_CONFIG,
  DEFAULT_PLANNING_HISTORY,
  type PlanningHistoryConfig,
} from '../src/core/foundation/config-planning.js';
import { DEFAULT_CONFIG, type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import {
  HISTORY_HINTS_HEADING,
  type HistoryHintRow,
  formatHistoryHints,
} from '../src/core/report/history-hints.js';
import { RECENT_DISCLOSURES_HEADING } from '../src/core/report/recent-disclosures.js';

/** The five rows of the "Counted window" scenario, oldest first. */
const ROWS: readonly HistoryHintRow[] = [
  {
    change: '040-a',
    task: '1',
    scopeFiles: 2,
    verifyKind: 'one',
    testsModify: 0,
    sharesScope: 0,
    position: 1,
    firstAttempt: 1,
    deadReason: null,
  },
  {
    change: '040-a',
    task: '2',
    scopeFiles: 4,
    verifyKind: 'several',
    testsModify: 1,
    sharesScope: 1,
    position: 2,
    firstAttempt: 0,
    deadReason: 'verify_red',
  },
  {
    change: '041-b',
    task: '1',
    scopeFiles: 1,
    verifyKind: 'one',
    testsModify: 0,
    sharesScope: 0,
    position: 1,
    firstAttempt: 1,
    deadReason: null,
  },
  {
    change: '041-b',
    task: '2',
    scopeFiles: 9,
    verifyKind: 'suite',
    testsModify: 0,
    sharesScope: 0,
    position: 2,
    firstAttempt: 0,
    deadReason: 'crashed',
  },
  {
    change: '041-b',
    task: '3',
    scopeFiles: 6,
    verifyKind: 'one',
    testsModify: 0,
    sharesScope: 0,
    position: 3,
    firstAttempt: 0,
    deadReason: 'verify_red',
  },
];

const LIMITS: PlanningHistoryConfig = {
  minimumTasks: 2,
  recentTasks: 4,
  maxCharacters: 1500,
};

/** The exact section body the "Counted window" scenario's table names. */
const WINDOW: readonly string[] = [
  "Counts from the last 4 archived tasks that ran, from the osq query table task_outcomes. They describe this project's history; nothing enforces them.",
  'First attempt by scope files: 1-2 1/1, 3-4 0/1, 5-8 0/1, over 8 0/1',
  'First attempt by verify kind: one 1/2, several 0/1, suite 0/1',
  'First attempt by tests.modify: true 0/1, false 1/3',
  'First attempt by shared scope: shared 0/1, not shared 1/3',
  'First attempt by position: first task 1/1, later task 0/3',
  'Most common last dead reasons: verify_red 2, crashed 1',
];

describe('formatHistoryHints', () => {
  it('formats the counted window line for line', () => {
    assert.equal(formatHistoryHints(ROWS, LIMITS), WINDOW.join('\n'));
  });

  it('keeps only the lines that fit the character cap', () => {
    const maxCharacters = WINDOW[0].length + 1 + WINDOW[1].length;
    assert.equal(
      formatHistoryHints(ROWS, { ...LIMITS, maxCharacters }),
      WINDOW.slice(0, 2).join('\n'),
    );
  });

  it('is absent when the first line alone does not fit', () => {
    assert.equal(
      formatHistoryHints(ROWS, { ...LIMITS, maxCharacters: WINDOW[0].length - 1 }),
      null,
    );
  });

  it('is absent below the minimum task count', () => {
    assert.equal(formatHistoryHints(ROWS.slice(0, 1), { ...LIMITS, minimumTasks: 2 }), null);
  });
});

describe('planning history configuration', () => {
  it('keeps the other defaults from a partial history block', () => {
    const resolved = defineConfig({ planning: { history: { minimumTasks: 5 } } } as never);
    assert.deepEqual(resolved.planning?.history, {
      minimumTasks: 5,
      recentTasks: 100,
      maxCharacters: 1500,
    });
  });

  it('rejects a value that is not a positive integer naming the key', () => {
    for (const key of ['minimumTasks', 'recentTasks', 'maxCharacters'] as const) {
      for (const value of [0, -1, 1.5, Number.NaN, '3']) {
        assert.throws(
          () => defineConfig({ planning: { history: { [key]: value } } } as never),
          new RegExp(`planning\\.history\\.${key}`),
          `expected rejection for ${key}=${String(value)}`,
        );
      }
    }
  });
});

describe('plan prompt history section', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-plan-history-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function configWithHistory(history: Partial<PlanningHistoryConfig>): OsqConfig {
    const planning = DEFAULT_CONFIG.planning ?? DEFAULT_PLANNING_CONFIG;
    return {
      ...DEFAULT_CONFIG,
      planning: { ...planning, history: { ...DEFAULT_PLANNING_HISTORY, ...history } },
    };
  }

  async function openingPrompt(config: OsqConfig): Promise<string> {
    return await buildOpeningPrompt({
      projectRoot: tmpDir,
      folderPath: path.join(tmpDir, 'openspec', 'changes', '001-probe'),
      specId: '001',
      specTitle: 'Probe',
      briefContent: '# Probe\n',
      openspecRoot: config.paths.openspecRoot,
      config,
    });
  }

  it('omits the section when too few tasks ran', async () => {
    await writeArchivedChange(tmpDir, '001-alpha', [{ n: 1, events: [event('started')] }]);

    const prompt = await openingPrompt(configWithHistory({ minimumTasks: 2 }));

    assert.ok(!prompt.includes(HISTORY_HINTS_HEADING), prompt);
    assert.ok(prompt.includes("## This repository's record"), prompt);
  });

  it('places the section after the record and before the disclosures', async () => {
    await writeArchivedChange(tmpDir, '001-alpha', [
      {
        n: 1,
        events: [event('started')],
        result: '## Outside scope\n\nAlpha outside scope text\n',
      },
      { n: 2, events: [event('started')] },
    ]);

    const prompt = await openingPrompt(configWithHistory({ minimumTasks: 2 }));
    const record = prompt.indexOf("## This repository's record");
    const history = prompt.indexOf(HISTORY_HINTS_HEADING);
    const disclosures = prompt.indexOf(RECENT_DISCLOSURES_HEADING);

    assert.ok(record >= 0, prompt);
    assert.ok(history > record, prompt);
    assert.ok(disclosures > history, prompt);
  });
});

/** One `started` event line. */
function event(type: string, data: Record<string, unknown> = {}): string {
  return JSON.stringify({ type, data });
}

interface ArchiveTask {
  readonly n: number;
  readonly events?: readonly string[];
  readonly result?: string;
}

/** Writes one archived change with proposal, task files, streams and results. */
async function writeArchivedChange(
  root: string,
  folder: string,
  tasks: readonly ArchiveTask[],
): Promise<void> {
  const base = path.join(root, 'openspec', 'changes', 'archive', folder);
  await fs.mkdir(path.join(base, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(base, 'proposal.md'),
    `---\ntitle: ${folder}\nverify: pnpm verify\n---\n## Goal\n\nDo the thing.\n`,
    'utf8',
  );
  for (const task of tasks) {
    await fs.writeFile(
      path.join(base, 'tasks', `${task.n}.md`),
      [
        '---',
        `title: Task ${task.n}`,
        'scope:',
        `  - src/a${task.n}.ts`,
        `verify: node --test tests/t${task.n}.test.ts`,
        '---',
        '## Acceptance',
        '- [ ] ok',
        '',
      ].join('\n'),
      'utf8',
    );
    if (task.events) {
      const eventsDir = path.join(base, '.run', 'events');
      await fs.mkdir(eventsDir, { recursive: true });
      await fs.writeFile(
        path.join(eventsDir, `${task.n}.jsonl`),
        `${task.events.join('\n')}\n`,
        'utf8',
      );
    }
    if (task.result !== undefined) {
      const resultsDir = path.join(base, '.run', 'results');
      await fs.mkdir(resultsDir, { recursive: true });
      await fs.writeFile(path.join(resultsDir, `${task.n}.md`), task.result, 'utf8');
    }
  }
}
