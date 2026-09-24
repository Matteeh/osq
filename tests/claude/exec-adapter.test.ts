import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { OsqConfig } from '../../src/core/foundation/config.js';
import { getHarnessAdapter } from '../../src/harness/index.js';
import { buildExecutorPrompt } from '../../src/harness/prompt.js';
import type { SpawnTaskOptions } from '../../src/harness/types.js';
import {
  ERROR_RESULT_RUN,
  TEXT_RUN,
  claudeConfig,
  createClaudeProject,
  envScope,
  writeClaudeTask,
} from './exec-support.js';

const env = envScope([
  'OSQ_FAKE_CLAUDE_RECORD',
  'OSQ_FAKE_CLAUDE_JSONL',
  'OSQ_FAKE_CLAUDE_MODE',
  'OSQ_FAKE_CLAUDE_EXIT',
  'OSQ_FAKE_CLAUDE_STDERR',
  'OSQ_FAKE_CLAUDE_VERSION',
  'OSQ_FAKE_CLAUDE_RESULT_TEXT',
  'ANTHROPIC_API_KEY',
  'OSQ_MODEL',
]);

interface FakeRecord {
  argv: string[];
  cwd: string;
  env: { OSQ_TASK_NUMBER?: string; OSQ_SPEC_FOLDER?: string; ANTHROPIC_API_KEY?: string };
  stdinLength: number;
  stdinClosed: boolean;
  kind: string;
}

async function readRecord(recordPath: string): Promise<FakeRecord | undefined> {
  return await fs
    .readFile(recordPath, 'utf8')
    .then((raw) => JSON.parse(raw) as FakeRecord)
    .catch(() => undefined);
}

function spawnOptions(root: string, specFolder: string, config: OsqConfig): SpawnTaskOptions {
  return {
    projectRoot: root,
    specFolderPath: specFolder,
    taskNumber: '1',
    taskTitle: 'When a Claude task runs',
    verifyCommand: 'node -e "process.exit(0)"',
    scope: [],
    entry: [],
    skills: [],
    tier: 'coding',
    config,
  };
}

const BASE_ARGS = [
  '-p',
  '--output-format',
  'stream-json',
  '--verbose',
  '--no-session-persistence',
  '--permission-mode',
  'dontAsk',
  '--tools',
  'Bash,Read,Edit,Write,Glob,Grep',
  '--allowedTools',
  'Bash',
  'Read',
  'Edit(./**)',
  'Write(./**)',
  'Glob',
  'Grep',
  '--disallowedTools',
  'Bash(git:*)',
  '--strict-mcp-config',
  '--disable-slash-commands',
  '--setting-sources',
  '',
];

const SANDBOX_JSON =
  '{"autoMemoryEnabled":false,"sandbox":{"enabled":true,"failIfUnavailable":true,"autoAllowBashIfSandboxed":true,"allowUnsandboxedCommands":false,"network":{"allowedDomains":[],"strictAllowlist":true}}}';

describe('Claude adapter arguments', () => {
  beforeEach(() => env.save());
  afterEach(() => env.restore());

  it('spawns the exact stripped argv with a closed stdin in the project root', async () => {
    const { root, specFolder } = await createClaudeProject('claude-args');
    const record = path.join(root, 'record.json');
    try {
      await writeClaudeTask(specFolder);
      Reflect.deleteProperty(process.env, 'ANTHROPIC_API_KEY');
      Reflect.deleteProperty(process.env, 'OSQ_MODEL');
      env.set({ OSQ_FAKE_CLAUDE_RECORD: record });
      const config = claudeConfig();
      const options = spawnOptions(root, specFolder, config);
      const expectedPrompt = await buildExecutorPrompt(options);

      const spawned: Array<{ pid: number; harnessVersion?: string; harnessAuth?: string }> = [];
      const result = await getHarnessAdapter('claude').spawn({
        ...options,
        onSpawn: (pid, details) => {
          spawned.push({
            pid,
            harnessVersion: details?.harnessVersion,
            harnessAuth: details?.harnessAuth,
          });
        },
      });

      assert.equal(result.exitCode, 0);
      assert.equal(result.error, undefined);
      assert.equal(spawned.length, 1);
      assert.equal(spawned[0]?.harnessVersion, '2.1.278 (Claude Code)');
      assert.equal(spawned[0]?.harnessAuth, 'login');

      const recorded = await readRecord(record);
      assert.deepEqual(recorded?.argv, [
        ...BASE_ARGS,
        '--settings',
        '{"autoMemoryEnabled":false}',
        '--',
        expectedPrompt,
      ]);
      assert.equal(recorded?.cwd, root);
      assert.equal(recorded?.env.OSQ_TASK_NUMBER, '1');
      assert.equal(recorded?.env.OSQ_SPEC_FOLDER, specFolder);
      assert.equal(recorded?.stdinLength, 0);
      assert.equal(recorded?.stdinClosed, true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('adds the sandbox settings and --bare with an API key', async () => {
    const { root, specFolder } = await createClaudeProject('claude-sandbox');
    const record = path.join(root, 'record.json');
    try {
      await writeClaudeTask(specFolder);
      env.set({ OSQ_FAKE_CLAUDE_RECORD: record, ANTHROPIC_API_KEY: 'sk-test' });
      Reflect.deleteProperty(process.env, 'OSQ_MODEL');
      const config = claudeConfig({ sandbox: true });
      const options = spawnOptions(root, specFolder, config);
      const expectedPrompt = await buildExecutorPrompt(options);

      const spawned: Array<{ harnessAuth?: string }> = [];
      const result = await getHarnessAdapter('claude').spawn({
        ...options,
        onSpawn: (_pid, details) => {
          spawned.push({ harnessAuth: details?.harnessAuth });
        },
      });
      assert.equal(result.exitCode, 0);
      assert.equal(spawned[0]?.harnessAuth, 'api_key');

      const recorded = await readRecord(record);
      assert.deepEqual(recorded?.argv, [
        ...BASE_ARGS,
        '--settings',
        SANDBOX_JSON,
        '--bare',
        '--',
        expectedPrompt,
      ]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('passes --model only when configured and never borrows another harness model', async () => {
    const { root, specFolder } = await createClaudeProject('claude-model');
    const record = path.join(root, 'record.json');
    try {
      await writeClaudeTask(specFolder);
      Reflect.deleteProperty(process.env, 'ANTHROPIC_API_KEY');
      Reflect.deleteProperty(process.env, 'OSQ_MODEL');
      env.set({ OSQ_FAKE_CLAUDE_RECORD: record });
      const config = claudeConfig({ model: 'claude-haiku-4-5' });
      const options = spawnOptions(root, specFolder, config);

      const result = await getHarnessAdapter('claude').spawn(options);
      assert.equal(result.exitCode, 0);
      const recorded = await readRecord(record);
      const modelIndex = recorded?.argv.indexOf('--model') ?? -1;
      assert.notEqual(modelIndex, -1);
      assert.equal(recorded?.argv[modelIndex + 1], 'claude-haiku-4-5');
      assert.ok(!recorded?.argv.includes('--bare'));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('streams parser output into harness events', async () => {
    const { root, specFolder } = await createClaudeProject('claude-stream-adapter');
    try {
      await writeClaudeTask(specFolder);
      env.set({ OSQ_FAKE_CLAUDE_JSONL: TEXT_RUN });
      const result = await getHarnessAdapter('claude').spawn(
        spawnOptions(root, specFolder, claudeConfig()),
      );
      assert.equal(result.exitCode, 0);

      const raw = await fs.readFile(path.join(specFolder, '.run', 'events', '1.jsonl'), 'utf8');
      const events = raw
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as { type: string; data?: Record<string, unknown> });
      assert.ok(events.some((event) => event.type === 'text'));
      assert.ok(events.some((event) => event.type === 'tokens'));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('carries the failing result subtype in the adapter error', async () => {
    const { root, specFolder } = await createClaudeProject('claude-subtype');
    try {
      await writeClaudeTask(specFolder);
      env.set({ OSQ_FAKE_CLAUDE_JSONL: ERROR_RESULT_RUN, OSQ_FAKE_CLAUDE_EXIT: '1' });
      const result = await getHarnessAdapter('claude').spawn(
        spawnOptions(root, specFolder, claudeConfig()),
      );
      assert.equal(result.exitCode, 1);
      assert.match(result.error ?? '', /error_max_turns/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
