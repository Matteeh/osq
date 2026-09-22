import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { approveCommand } from '../src/cli/approve.js';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { createNewSpec } from '../src/core/new.js';
import {
  type ObservedPlanningSession,
  appendObservedSessions,
  findPlanningSessions,
  isSegmentContained,
  normalizeObservedTarget,
  observedSessionId,
  resolveChangeCreationTime,
} from '../src/core/planning-observed.js';
import {
  NULL_PLANNING_USAGE,
  getPlanLogPath,
  parsePlanRecords,
  planningRecordSource,
  readPlanRecords,
  recordPlanStarted,
} from '../src/core/planning.js';
import { parseClaudeSession, readClaudePlanningSessions } from '../src/harness/claude-usage.js';
import {
  parseCodexObservation,
  readCodexPlanningSessions,
} from '../src/harness/codex-observe-usage.js';
import { readOpencodePlanningSessions } from '../src/harness/opencode-observe-usage.js';
import { buildOpencodeObservationQuery } from '../src/harness/opencode-usage.js';
import { installFakeValidator } from './helpers.js';

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const CLAUDE_FIXTURE_DIR = path.join(TESTS_DIR, 'fixtures', 'planning-observed', 'claude-projects');

const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

const ENV_KEYS = [
  'CODEX_HOME',
  'OPENCODE_PATH',
  'OSQ_OPENCODE_DB_ROWS_FILE',
  'OSQ_CLAUDE_PROJECTS_DIR',
  'CLAUDE_CONFIG_DIR',
] as const;
const SAVED_ENV = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = SAVED_ENV.get(key);
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
}

async function installLocalVerifier(root: string, folderPath: string): Promise<void> {
  await fs.writeFile(path.join(root, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  for (const rel of ['proposal.md', path.join('tasks', '1.md')]) {
    const target = path.join(folderPath, rel);
    const content = await fs.readFile(target, 'utf8').catch(() => null);
    if (content === null) continue;
    await fs.writeFile(
      target,
      content.replace(/^verify:.*$/m, `verify: ${PASSING_VERIFY}`),
      'utf8',
    );
  }
}

async function createProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-planning-observed-'));
  await installFakeValidator(root);
  await scaffoldProject(root);
  return root;
}

async function createChange(
  root: string,
  title: string,
): Promise<{ specId: string; folderPath: string }> {
  const spec = await createNewSpec(root, title);
  await installLocalVerifier(root, spec.folderPath);
  return { specId: spec.specId, folderPath: spec.folderPath };
}

async function captureLogs(run: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  try {
    await run();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return lines;
}

async function readManifest(folderPath: string): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(path.join(folderPath, '.run', 'manifest.json'), 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

async function renderTree(
  sourceDir: string,
  destDir: string,
  values: Record<string, string | number>,
): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  for (const entry of await fs.readdir(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await renderTree(source, dest, values);
      continue;
    }
    const content = (await fs.readFile(source, 'utf8')).replace(/__([A-Z_]+)__/g, (match, key) =>
      Object.hasOwn(values, key) ? String(values[key]) : match,
    );
    await fs.writeFile(dest, content, 'utf8');
  }
}

function candidate(overrides: Partial<ObservedPlanningSession> = {}): ObservedPlanningSession {
  return {
    harness: 'claude',
    nativeSessionId: 'native-1',
    sessionDir: null,
    model: 'm',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:01:00.000Z',
    usage: NULL_PLANNING_USAGE,
    edits: [{ path: 'tasks/1.md', timestamp: '2026-01-01T00:00:30.000Z' }],
    ...overrides,
  };
}

describe('planning record source compatibility', () => {
  it('reads a legacy record without a source as owned', () => {
    const records = parsePlanRecords(
      JSON.stringify({
        type: 'plan_started',
        sessionId: 'legacy',
        timestamp: '2026-01-01T00:00:00.000Z',
        data: {
          harness: 'agy',
          model: 'legacy-model',
          osqVersion: '1.0.0',
          briefHash: 'sha256:x',
        },
      }),
    );
    assert.equal(records.length, 1);
    assert.equal(records[0].source, undefined);
    assert.equal(planningRecordSource(records[0]), 'owned');
    assert.equal(records[0].type === 'plan_started' && records[0].data.model, 'legacy-model');
  });

  it('parses observed records with nullable model, exit code, and usage', () => {
    const records = parsePlanRecords(
      [
        JSON.stringify({
          type: 'plan_started',
          sessionId: 'observed:claude:abc',
          timestamp: '2026-01-01T00:00:00.000Z',
          source: 'observed',
          data: { harness: 'claude', model: null, osqVersion: '1.0.0', briefHash: 'sha256:b' },
        }),
        JSON.stringify({
          type: 'plan_exited',
          sessionId: 'observed:claude:abc',
          timestamp: '2026-01-01T00:00:12.000Z',
          source: 'observed',
          data: {
            exitCode: null,
            wallSeconds: 12,
            usage: {
              inputTokens: 100,
              outputTokens: null,
              cachedTokens: 25,
              reasoningTokens: 10,
              cost: 0.42,
            },
          },
        }),
      ].join('\n'),
    );
    assert.equal(records.length, 2);
    const started = records[0];
    const exited = records[1];
    assert.equal(started.type === 'plan_started' && started.data.model, null);
    assert.equal(planningRecordSource(started), 'observed');
    assert.equal(exited.type === 'plan_exited' && exited.data.exitCode, null);
    assert.equal(planningRecordSource(exited), 'observed');
    if (exited.type === 'plan_exited') {
      assert.deepEqual(exited.data.usage, {
        inputTokens: 100,
        outputTokens: null,
        cachedTokens: 25,
        reasoningTokens: 10,
        cost: 0.42,
      });
    }
  });

  it('writes source owned for new owned lifecycle records', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-owned-record-'));
    try {
      const briefPath = path.join(root, 'brief.md');
      await fs.writeFile(briefPath, '# brief\n', 'utf8');
      await recordPlanStarted(root, { harness: 'mock', model: 'owned-model', briefPath });
      const records = await readPlanRecords(root);
      assert.equal(records.length, 1);
      assert.equal(records[0].source, 'owned');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe('path containment', () => {
  it('accepts nested targets and rejects sibling prefixes and escapes', () => {
    assert.equal(isSegmentContained('/a/001-x', '/a/001-x/tasks/1.md'), true);
    assert.equal(isSegmentContained('/a/001-x', '/a/001-x'), false);
    assert.equal(isSegmentContained('/a/001-x', '/a/001-xy/tasks/1.md'), false);
    assert.equal(isSegmentContained('/a/001-x', '/a/tasks/1.md'), false);
  });

  it('resolves relative targets from the session directory', () => {
    assert.equal(
      normalizeObservedTarget('tasks/1.md', '/a/001-x', '/a/001-x'),
      path.resolve('/a/001-x/tasks/1.md'),
    );
    assert.equal(
      normalizeObservedTarget('/a/001-x/tasks/1.md', null, '/a/001-x'),
      path.resolve('/a/001-x/tasks/1.md'),
    );
    assert.equal(normalizeObservedTarget('../001-xy/x.md', '/a/001-x', '/a/001-x'), null);
    assert.equal(normalizeObservedTarget('../../etc/passwd', '/a/001-x', '/a/001-x'), null);
    assert.equal(normalizeObservedTarget('tasks/1.md', null, '/a/001-x'), null);
  });
});

describe('findPlanningSessions', () => {
  const created = '2026-01-01T00:00:00.000Z';
  const observed = '2026-01-01T00:01:00.000Z';
  let changeFolder = '';

  beforeEach(async () => {
    changeFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-find-observed-'));
  });
  afterEach(async () => {
    if (changeFolder) await fs.rm(changeFolder, { recursive: true, force: true });
  });

  it('matches inclusive window boundaries and the segment-contained folder', async () => {
    const readings = [
      candidate({ sessionDir: changeFolder, edits: [{ path: 'tasks/1.md', timestamp: created }] }),
      candidate({
        sessionDir: changeFolder,
        nativeSessionId: 'native-2',
        edits: [{ path: 'tasks/2.md', timestamp: observed }],
      }),
      candidate({
        sessionDir: changeFolder,
        nativeSessionId: 'native-3',
        edits: [{ path: 'tasks/3.md', timestamp: '2025-12-31T23:59:59.000Z' }],
      }),
      candidate({
        sessionDir: changeFolder,
        nativeSessionId: 'native-4',
        edits: [{ path: 'tasks/4.md', timestamp: '2026-01-01T00:01:00.001Z' }],
      }),
    ];
    const matches = await findPlanningSessions(changeFolder, {
      createdAt: created,
      observedAt: observed,
      readers: [() => Promise.resolve(readings)],
    });
    assert.deepEqual(
      matches.map((match) => match.nativeSessionId),
      ['native-1', 'native-2'],
    );
  });

  it('rejects sibling prefixes, escapes, and out-of-folder edits', async () => {
    const sibling = `${changeFolder}-x`;
    const readings = [
      candidate({
        nativeSessionId: 'sib',
        sessionDir: changeFolder,
        edits: [
          { path: `../${path.basename(sibling)}/f.md`, timestamp: '2026-01-01T00:00:30.000Z' },
        ],
      }),
      candidate({
        nativeSessionId: 'esc',
        sessionDir: changeFolder,
        edits: [{ path: '../../outside/f.md', timestamp: '2026-01-01T00:00:30.000Z' }],
      }),
      candidate({
        nativeSessionId: 'inside',
        sessionDir: changeFolder,
        edits: [{ path: 'tasks/1.md', timestamp: '2026-01-01T00:00:30.000Z' }],
      }),
    ];
    const matches = await findPlanningSessions(changeFolder, {
      createdAt: created,
      observedAt: observed,
      readers: [() => Promise.resolve(readings)],
    });
    assert.deepEqual(
      matches.map((match) => match.nativeSessionId),
      ['inside'],
    );
  });

  it('deduplicates by harness and native id and orders deterministically', async () => {
    const readerA = () =>
      Promise.resolve([
        candidate({
          harness: 'opencode',
          sessionDir: changeFolder,
          nativeSessionId: 'z',
          edits: [{ path: 'tasks/1.md', timestamp: '2026-01-01T00:00:10.000Z' }],
        }),
        candidate({
          harness: 'codex',
          sessionDir: changeFolder,
          nativeSessionId: 'b',
          edits: [{ path: 'tasks/1.md', timestamp: '2026-01-01T00:00:20.000Z' }],
        }),
      ]);
    const readerB = () =>
      Promise.resolve([
        candidate({
          harness: 'codex',
          sessionDir: changeFolder,
          nativeSessionId: 'b',
          edits: [{ path: 'tasks/1.md', timestamp: '2026-01-01T00:00:20.000Z' }],
        }),
        candidate({
          harness: 'claude',
          sessionDir: changeFolder,
          nativeSessionId: 'a',
          edits: [{ path: 'tasks/1.md', timestamp: '2026-01-01T00:00:05.000Z' }],
        }),
      ]);
    const matches = await findPlanningSessions(changeFolder, {
      createdAt: created,
      observedAt: observed,
      readers: [readerA, readerB],
    });
    assert.deepEqual(
      matches.map((match) => match.sessionId),
      [
        observedSessionId('codex', 'b'),
        observedSessionId('opencode', 'z'),
        observedSessionId('claude', 'a'),
      ],
    );
  });

  it('isolates reader failures and invalid windows', async () => {
    const throwing = () => Promise.reject(new Error('boom'));
    const good = () =>
      Promise.resolve([
        candidate({
          sessionDir: changeFolder,
          edits: [{ path: 'tasks/1.md', timestamp: '2026-01-01T00:00:30.000Z' }],
        }),
      ]);
    const matches = await findPlanningSessions(changeFolder, {
      createdAt: created,
      observedAt: observed,
      readers: [throwing, good],
    });
    assert.equal(matches.length, 1);

    assert.deepEqual(
      await findPlanningSessions(changeFolder, {
        createdAt: null,
        observedAt: observed,
        readers: [good],
      }),
      [],
    );
    assert.deepEqual(
      await findPlanningSessions(changeFolder, {
        createdAt: created,
        observedAt: '2025-12-31T23:59:59.000Z',
        readers: [good],
      }),
      [],
    );
  });
});

describe('Codex rollout observation', () => {
  it('reads apply_patch headers and ignores shell text and failed calls', () => {
    const lines = [
      JSON.stringify({
        type: 'session_meta',
        timestamp: '2026-01-01T00:00:00.000Z',
        payload: { id: 'codex-1', timestamp: '2026-01-01T00:00:00.000Z', cwd: '/project/001-x' },
      }),
      JSON.stringify({
        type: 'turn_context',
        timestamp: '2026-01-01T00:00:00.000Z',
        payload: { model: 'gpt-5' },
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: '2026-01-01T00:00:05.000Z',
        payload: {
          type: 'custom_tool_call',
          name: 'apply_patch',
          status: 'completed',
          input:
            '*** Begin Patch\n*** Update File: tasks/1.md\n*** Move to: tasks/2.md\n*** Delete File: tasks/old.md\n+line\n*** End Patch',
        },
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: '2026-01-01T00:00:05.000Z',
        payload: {
          type: 'custom_tool_call',
          name: 'exec_command',
          input: '*** Add File: tasks/evil.md',
        },
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: '2026-01-01T00:00:05.000Z',
        payload: {
          type: 'custom_tool_call',
          name: 'apply_patch',
          status: 'failed',
          input: '*** Add File: tasks/failed.md',
        },
      }),
      JSON.stringify({
        type: 'token_usage_record',
        timestamp: '2026-01-01T00:00:06.000Z',
        payload: {
          thread_token_usage: {
            input_tokens: 10,
            output_tokens: 5,
            cached_input_tokens: 2,
            reasoning_output_tokens: 1,
          },
        },
      }),
    ].join('\n');

    const observation = parseCodexObservation(lines);
    assert.ok(observation);
    assert.equal(observation.harness, 'codex');
    assert.equal(observation.nativeSessionId, 'codex-1');
    assert.equal(observation.sessionDir, '/project/001-x');
    assert.equal(observation.model, 'gpt-5');
    assert.deepEqual(
      observation.edits.map((edit) => edit.path),
      ['tasks/1.md', 'tasks/2.md', 'tasks/old.md'],
    );
    assert.deepEqual(observation.usage, {
      inputTokens: 10,
      outputTokens: 5,
      cachedTokens: 2,
      reasoningTokens: 1,
      cost: null,
    });
    assert.equal(observation.startedAt, '2026-01-01T00:00:00.000Z');
    assert.equal(observation.endedAt, '2026-01-01T00:00:06.000Z');
  });

  it('reads the event_msg cumulative total token usage without summing', () => {
    const observation = parseCodexObservation(
      [
        JSON.stringify({
          type: 'session_meta',
          timestamp: '2026-01-01T00:00:00.000Z',
          payload: { id: 'codex-2', cwd: '/project/001-x' },
        }),
        JSON.stringify({
          type: 'event_msg',
          timestamp: '2026-01-01T00:00:01.000Z',
          payload: {
            type: 'token_count',
            info: {
              total_token_usage: {
                input_tokens: 7,
                output_tokens: 3,
                cached_input_tokens: 1,
                reasoning_output_tokens: 2,
              },
            },
          },
        }),
      ].join('\n'),
    );
    assert.ok(observation);
    assert.deepEqual(observation.usage, {
      inputTokens: 7,
      outputTokens: 3,
      cachedTokens: 1,
      reasoningTokens: 2,
      cost: null,
    });
    assert.deepEqual(observation.edits, []);
  });

  it('reads every rollout below the Codex data home and degrades a missing store', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-codex-observe-'));
    try {
      const home = path.join(root, 'codex-home');
      const sessions = path.join(home, 'sessions', '2026', '01');
      await fs.mkdir(sessions, { recursive: true });
      await fs.writeFile(
        path.join(sessions, 'rollout.jsonl'),
        [
          JSON.stringify({
            type: 'session_meta',
            timestamp: '2026-01-01T00:00:00.000Z',
            payload: { id: 'codex-home', cwd: '/project/001-x' },
          }),
          JSON.stringify({
            type: 'response_item',
            timestamp: '2026-01-01T00:00:05.000Z',
            payload: {
              type: 'custom_tool_call',
              name: 'apply_patch',
              status: 'completed',
              input: '*** Add File: tasks/1.md',
            },
          }),
        ].join('\n'),
        'utf8',
      );
      process.env.CODEX_HOME = home;
      const found = await readCodexPlanningSessions();
      assert.equal(found.length, 1);
      assert.equal(found[0].nativeSessionId, 'codex-home');

      process.env.CODEX_HOME = path.join(root, 'missing-home');
      assert.deepEqual(await readCodexPlanningSessions(), []);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe('OpenCode observation', () => {
  it('builds an edit-only join projected through json_extract', () => {
    const query = buildOpencodeObservationQuery();
    assert.match(query, /JOIN part/);
    assert.match(query, /state\.input\.filePath/);
    assert.match(query, /\('write', 'edit'\)/);
    assert.match(query, /'completed'/);
  });

  it('groups completed edit parts by session and sums cache read plus write', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-opencode-observe-'));
    try {
      const rowsFile = path.join(root, 'rows.json');
      const fakeBin = path.join(root, 'fake-db.mjs');
      await fs.writeFile(
        fakeBin,
        `#!${process.execPath}\nimport fs from 'node:fs';\nprocess.stdout.write(fs.readFileSync(process.env.OSQ_OPENCODE_DB_ROWS_FILE, 'utf8'));\n`,
        { mode: 0o755 },
      );
      const now = Date.now();
      await fs.writeFile(
        rowsFile,
        JSON.stringify({
          rows: [
            {
              session_id: 'oc-1',
              directory: '/project/001-x',
              time_created: now - 60000,
              time_updated: now,
              model: 'oc-model',
              tokens_input: 11,
              tokens_output: 22,
              tokens_reasoning: 3,
              tokens_cache_read: 4,
              tokens_cache_write: 5,
              cost: 0.7,
              edit_tool: 'edit',
              edit_path: 'tasks/1.md',
              edit_time: now - 30000,
            },
          ],
        }),
        'utf8',
      );
      process.env.OSQ_OPENCODE_DB_ROWS_FILE = rowsFile;

      const found = await readOpencodePlanningSessions(fakeBin);
      assert.equal(found.length, 1);
      assert.equal(found[0].nativeSessionId, 'oc-1');
      assert.equal(found[0].sessionDir, '/project/001-x');
      assert.equal(found[0].model, 'oc-model');
      assert.deepEqual(found[0].usage, {
        inputTokens: 11,
        outputTokens: 22,
        cachedTokens: 9,
        reasoningTokens: 3,
        cost: 0.7,
      });
      assert.equal(found[0].edits.length, 1);
      assert.equal(found[0].edits[0].path, 'tasks/1.md');

      assert.deepEqual(await readOpencodePlanningSessions(path.join(root, 'missing-bin')), []);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('keeps a session model nullable', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-opencode-null-'));
    try {
      const rowsFile = path.join(root, 'rows.json');
      const fakeBin = path.join(root, 'fake-db.mjs');
      await fs.writeFile(
        fakeBin,
        `#!${process.execPath}\nimport fs from 'node:fs';\nprocess.stdout.write(fs.readFileSync(process.env.OSQ_OPENCODE_DB_ROWS_FILE, 'utf8'));\n`,
        { mode: 0o755 },
      );
      await fs.writeFile(
        rowsFile,
        JSON.stringify({
          rows: [
            {
              session_id: 'oc-null',
              directory: '/project/001-x',
              time_created: 1,
              time_updated: 2,
              model: null,
              edit_path: 'tasks/1.md',
              edit_time: 1,
            },
          ],
        }),
        'utf8',
      );
      process.env.OSQ_OPENCODE_DB_ROWS_FILE = rowsFile;
      const found = await readOpencodePlanningSessions(fakeBin);
      assert.equal(found.length, 1);
      assert.equal(found[0].model, null);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe('Claude session observation', () => {
  it('parses successful edits and the final cost-state without content', () => {
    const content = [
      JSON.stringify({
        type: 'assistant',
        sessionId: 'claude-1',
        cwd: '/project/001-x',
        timestamp: '2026-01-01T00:00:10.000Z',
        message: {
          role: 'assistant',
          model: 'claude-x',
          content: [
            { type: 'tool_use', id: 'tu-1', name: 'Write', input: { file_path: 'tasks/1.md' } },
          ],
        },
      }),
      JSON.stringify({
        type: 'user',
        sessionId: 'claude-1',
        timestamp: '2026-01-01T00:00:11.000Z',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu-2', is_error: true }],
        },
      }),
      JSON.stringify({
        type: 'assistant',
        sessionId: 'claude-1',
        cwd: '/project/001-x',
        timestamp: '2026-01-01T00:00:12.000Z',
        message: {
          role: 'assistant',
          model: 'claude-x',
          content: [
            { type: 'tool_use', id: 'tu-2', name: 'Edit', input: { file_path: 'tasks/2.md' } },
            {
              type: 'tool_use',
              id: 'tu-3',
              name: 'NotebookEdit',
              input: { notebook_path: 'tasks/3.ipynb' },
            },
          ],
        },
      }),
      JSON.stringify({
        type: 'cost-state',
        sessionId: 'claude-1',
        startTime: 1767225600000,
        totalDuration: 12000,
        totalCostUSD: 0.5,
        modelUsage: {
          'claude-x': {
            input_tokens: 100,
            output_tokens: 50,
            thinking_tokens: 10,
            cache_read_input_tokens: 20,
            cache_creation_input_tokens: 5,
          },
        },
      }),
    ].join('\n');

    const observation = parseClaudeSession(content);
    assert.ok(observation);
    assert.equal(observation.harness, 'claude');
    assert.equal(observation.nativeSessionId, 'claude-1');
    assert.equal(observation.sessionDir, '/project/001-x');
    assert.equal(observation.model, 'claude-x');
    assert.deepEqual(
      observation.edits.map((edit) => edit.path),
      ['tasks/1.md', 'tasks/3.ipynb'],
    );
    assert.deepEqual(observation.usage, {
      inputTokens: 100,
      outputTokens: 50,
      cachedTokens: 25,
      reasoningTokens: 10,
      cost: 0.5,
    });
    assert.equal(observation.startedAt, new Date(1767225600000).toISOString());
    assert.equal(observation.endedAt, new Date(1767225600000 + 12000).toISOString());
    assert.equal(JSON.stringify(observation).includes('tool_result'), false);
  });

  it('returns null when no edit is present and leaves missing values null', () => {
    const observation = parseClaudeSession(
      JSON.stringify({
        type: 'assistant',
        sessionId: 'claude-2',
        cwd: '/project/001-x',
        timestamp: '2026-01-01T00:00:10.000Z',
        message: {
          role: 'assistant',
          model: 'claude-y',
          content: [{ type: 'text', text: 'no edit here' }],
        },
      }),
    );
    assert.equal(observation, null);
  });
});

describe('approval-time observation', () => {
  let root = '';

  beforeEach(() => {
    restoreEnv();
  });
  afterEach(async () => {
    restoreEnv();
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = '';
  });

  it('appends one observed pair, preserves usage/model, and never duplicates', async () => {
    root = await createProject();
    const change = await createChange(root, 'Observed Claude');
    const now = Date.now();
    const createdMs = now - 120000;
    const createdAt = new Date(createdMs).toISOString();
    // Keep the persisted creation time stable across reapproval: the manifest
    // `createdAt` is derived from the change document's modification time.
    await fs.utimes(
      path.join(change.folderPath, 'proposal.md'),
      new Date(createdMs),
      new Date(createdMs),
    );
    await fs.mkdir(path.join(change.folderPath, '.run'), { recursive: true });
    await fs.writeFile(
      path.join(change.folderPath, '.run', 'manifest.json'),
      JSON.stringify({ createdAt }),
      'utf8',
    );

    const projectsDir = path.join(root, 'claude-projects');
    await renderTree(CLAUDE_FIXTURE_DIR, projectsDir, {
      CWD: change.folderPath,
      INSIDE_PATH: 'tasks/1.md',
      OUTSIDE_PATH: '../999-other/file.md',
      NOW_ISO: new Date(now - 30000).toISOString(),
      START_MS: now - 42000,
    });
    const reader = () => readClaudePlanningSessions(projectsDir);

    const first = await approveSpec(root, change.specId, DEFAULT_CONFIG, {
      planningReaders: [reader],
      now: new Date(now),
    });
    assert.equal(first.planningMatches, 1);

    const records = await readPlanRecords(change.folderPath);
    assert.equal(records.length, 2);
    const started = records[0];
    const exited = records[1];
    assert.equal(started.type, 'plan_started');
    assert.equal(started.source, 'observed');
    assert.equal(planningRecordSource(started), 'observed');
    assert.equal(started.type === 'plan_started' && started.data.model, 'claude-x');
    assert.equal(exited.type, 'plan_exited');
    assert.equal(exited.type === 'plan_exited' && exited.data.exitCode, null);
    if (started.type === 'plan_started' && exited.type === 'plan_exited') {
      assert.equal(started.sessionId, exited.sessionId);
      assert.equal(started.sessionId, observedSessionId('claude', 'claude-session-inside'));
      assert.deepEqual(exited.data.usage, {
        inputTokens: 100,
        outputTokens: 50,
        cachedTokens: 25,
        reasoningTokens: 10,
        cost: 0.42,
      });
    }

    const manifest = await readManifest(change.folderPath);
    assert.equal(manifest.planningSessions, 1);
    assert.equal(manifest.planner, 'claude-x');

    const second = await approveSpec(root, change.specId, DEFAULT_CONFIG, {
      planningReaders: [reader],
      now: new Date(now + 1000),
    });
    assert.equal(second.planningMatches, 1);
    assert.equal((await readPlanRecords(change.folderPath)).length, 2);
    assert.equal((await readManifest(change.folderPath)).planningSessions, 1);
  });

  it('records no observed pair and leaves planner null when nothing matches', async () => {
    root = await createProject();
    const change = await createChange(root, 'No Observed');
    const result = await approveSpec(root, change.specId, DEFAULT_CONFIG, {
      planningReaders: [],
      now: new Date(),
    });
    assert.equal(result.planningMatches, 0);
    assert.deepEqual(await readPlanRecords(change.folderPath), []);
    const manifest = await readManifest(change.folderPath);
    assert.equal(manifest.planningSessions, 0);
    assert.equal(manifest.planner, null);
  });

  it('attributes the newest observed model then the newest owned model, never config', async () => {
    root = await createProject();
    const change = await createChange(root, 'Attribution');
    const briefPath = path.join(change.folderPath, 'brief.md');
    await fs.writeFile(briefPath, '# brief\n', 'utf8');

    // Config alone never populates attribution.
    await approveSpec(root, change.specId, DEFAULT_CONFIG, { planningReaders: [] });
    assert.equal((await readManifest(change.folderPath)).planner, null);

    // An owned record supplies the fallback.
    await recordPlanStarted(change.folderPath, {
      harness: 'mock',
      model: 'owned-model',
      briefPath,
    });
    await approveSpec(root, change.specId, DEFAULT_CONFIG, { planningReaders: [] });
    assert.equal((await readManifest(change.folderPath)).planner, 'owned-model');

    // A newer observed model wins over the owned model.
    await appendObservedSessions(
      change.folderPath,
      [
        {
          harness: 'claude',
          nativeSessionId: 'winner',
          sessionId: observedSessionId('claude', 'winner'),
          model: 'observed-model',
          startedAt: '2030-01-01T00:00:00.000Z',
          endedAt: '2030-01-01T00:01:00.000Z',
          usage: NULL_PLANNING_USAGE,
        },
      ],
      { briefHash: 'sha256:brief', osqVersion: '1.0.0' },
    );
    await approveSpec(root, change.specId, DEFAULT_CONFIG, { planningReaders: [] });
    const manifest = await readManifest(change.folderPath);
    assert.equal(manifest.planner, 'observed-model');
    assert.equal(manifest.planningSessions, 2);
  });

  it('prefers a persisted creation time and rejects edits before it', async () => {
    root = await createProject();
    const change = await createChange(root, 'Window');
    const now = Date.now();
    await fs.mkdir(path.join(change.folderPath, '.run'), { recursive: true });
    await fs.writeFile(
      path.join(change.folderPath, '.run', 'manifest.json'),
      JSON.stringify({ createdAt: new Date(now).toISOString() }),
      'utf8',
    );
    const createdAt = await resolveChangeCreationTime(change.folderPath);
    assert.equal(createdAt, new Date(now).toISOString());

    const before = await findPlanningSessions(change.folderPath, {
      createdAt,
      observedAt: new Date(now + 60000).toISOString(),
      readers: [
        () =>
          Promise.resolve([
            candidate({
              sessionDir: change.folderPath,
              edits: [{ path: 'tasks/1.md', timestamp: new Date(now - 1000).toISOString() }],
            }),
          ]),
      ],
    });
    assert.deepEqual(before, []);
  });

  it('appends deterministically without re-reading a duplicate native session', async () => {
    root = await createProject();
    const change = await createChange(root, 'Idempotent');
    const observation = {
      harness: 'codex',
      nativeSessionId: 'native-z',
      sessionId: observedSessionId('codex', 'native-z'),
      model: null,
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: '2026-01-01T00:00:30.000Z',
      usage: NULL_PLANNING_USAGE,
    };
    assert.equal(
      await appendObservedSessions(change.folderPath, [observation], {
        briefHash: 'sha256:b',
        osqVersion: '1.0.0',
      }),
      1,
    );
    assert.equal(
      await appendObservedSessions(change.folderPath, [observation], {
        briefHash: 'sha256:b',
        osqVersion: '1.0.0',
      }),
      0,
    );
    const records = await readPlanRecords(change.folderPath);
    assert.equal(records.length, 2);
    const exited = records[1];
    assert.equal(exited.type === 'plan_exited' && exited.data.wallSeconds, 30);
    assert.equal(exited.type === 'plan_exited' && exited.data.exitCode, null);
  });
});

describe('approve command planning notice', () => {
  let root = '';

  beforeEach(() => {
    restoreEnv();
  });
  afterEach(async () => {
    restoreEnv();
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = '';
  });

  it('prints exactly one no-record notice when no observed session matches', async () => {
    root = await createProject();
    const change = await createChange(root, 'No Log');
    const lines = await captureLogs(() =>
      approveCommand([change.specId], {
        cwd: root,
        config: DEFAULT_CONFIG,
        planningReaders: [],
        now: new Date(),
      }),
    );
    const notices = lines.filter((line) => line.startsWith('No planning record found for'));
    assert.deepEqual(notices, [`No planning record found for ${change.specId}.`]);
    assert.ok(lines.some((line) => line.startsWith('Approved ')));
  });

  it('prints no notice when a session matches', async () => {
    root = await createProject();
    const change = await createChange(root, 'Log Found');
    const now = Date.now();
    await fs.mkdir(path.join(change.folderPath, '.run'), { recursive: true });
    await fs.writeFile(
      path.join(change.folderPath, '.run', 'manifest.json'),
      JSON.stringify({ createdAt: new Date(now - 60000).toISOString() }),
      'utf8',
    );
    const reader = () =>
      Promise.resolve([
        candidate({
          harness: 'claude',
          sessionDir: change.folderPath,
          nativeSessionId: 'matched',
          edits: [{ path: 'tasks/1.md', timestamp: new Date(now - 30000).toISOString() }],
        }),
      ]);
    const lines = await captureLogs(() =>
      approveCommand([change.specId], {
        cwd: root,
        config: DEFAULT_CONFIG,
        planningReaders: [reader],
        now: new Date(now),
      }),
    );
    assert.equal(
      lines.some((line) => line.startsWith('No planning record found for')),
      false,
    );
    assert.equal((await readPlanRecords(change.folderPath)).length, 2);
  });

  it('supplies the default readers and still approves with empty local stores', async () => {
    root = await createProject();
    const change = await createChange(root, 'Default Readers');
    process.env.CODEX_HOME = path.join(root, 'empty-codex');
    process.env.OSQ_CLAUDE_PROJECTS_DIR = path.join(root, 'empty-claude');
    process.env.OPENCODE_PATH = path.join(root, 'missing-opencode');
    const lines = await captureLogs(() =>
      approveCommand([change.specId], {
        cwd: root,
        config: DEFAULT_CONFIG,
        now: new Date(),
      }),
    );
    assert.ok(lines.some((line) => line.startsWith('Approved ')));
    assert.deepEqual(
      lines.filter((line) => line.startsWith('No planning record found for')),
      [`No planning record found for ${change.specId}.`],
    );
  });

  it('does not write approval artifacts when lint fails', async () => {
    root = await createProject();
    const change = await createChange(root, 'Broken');
    await fs.writeFile(
      path.join(change.folderPath, 'tasks', '1.md'),
      `---
title: Broken
verify: pnpm test && pnpm lint
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] fails`,
      'utf8',
    );
    await assert.rejects(
      () =>
        approveSpec(root, change.specId, DEFAULT_CONFIG, {
          planningReaders: [() => Promise.resolve([candidate()])],
        }),
      /Lint failed/,
    );
    assert.deepEqual(await readPlanRecords(change.folderPath), []);
    await assert.rejects(fs.stat(path.join(change.folderPath, '.run', 'approved')));
    await assert.rejects(fs.stat(getPlanLogPath(change.folderPath)));
  });
});
