import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { OsqConfig } from '../../src/core/foundation/config.js';
import { approveSpec } from '../../src/core/spec/approve.js';
import { ClaudeAdapter } from '../../src/harness/claude/claude-exec.js';
import { runTask } from '../../src/watcher/runner.js';
import {
  ERROR_RESULT_RUN,
  GOLDEN_RUN,
  claudeConfig,
  createClaudeProject,
  envScope,
  writeClaudeTask,
} from './exec-support.js';

const env = envScope([
  'OSQ_FAKE_CLAUDE_JSONL',
  'OSQ_FAKE_CLAUDE_MODE',
  'OSQ_FAKE_CLAUDE_EXIT',
  'OSQ_FAKE_CLAUDE_STDERR',
  'OSQ_FAKE_CLAUDE_RESULT_TEXT',
  'ANTHROPIC_API_KEY',
  'OSQ_MODEL',
]);

const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

async function approveTask(root: string, specFolder: string, config: OsqConfig): Promise<void> {
  await fs.writeFile(path.join(root, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  const proposalPath = path.join(specFolder, 'proposal.md');
  const proposal = await fs.readFile(proposalPath, 'utf8').catch(() => null);
  if (proposal !== null) {
    await fs.writeFile(
      proposalPath,
      proposal.replace(/^verify:.*$/m, `verify: ${PASSING_VERIFY}`),
      'utf8',
    );
  }
  await writeClaudeTask(specFolder, { verify: PASSING_VERIFY });
  await approveSpec(root, '001', config);
}

async function markerText(markerPath: string): Promise<string> {
  return await fs.readFile(markerPath, 'utf8').catch(() => '');
}

interface ParsedEvent {
  type: string;
  data?: Record<string, unknown>;
}

async function readEvents(specFolder: string, taskNumber: string): Promise<ParsedEvent[]> {
  const raw = await fs
    .readFile(path.join(specFolder, '.run', 'events', `${taskNumber}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

describe('Claude runner outcomes through the watcher', () => {
  beforeEach(() => env.save());
  afterEach(() => env.restore());

  it('synthesizes the result and reaches done only after its own verify', async () => {
    const { root, specFolder } = await createClaudeProject('claude-run-done');
    try {
      Reflect.deleteProperty(process.env, 'ANTHROPIC_API_KEY');
      const config = claudeConfig();
      await approveTask(root, specFolder, config);
      env.set({ OSQ_FAKE_CLAUDE_JSONL: GOLDEN_RUN });

      const result = await runTask(root, specFolder, '1', config, new ClaudeAdapter());
      assert.equal(result.success, true);

      const synthesized = await fs.readFile(
        path.join(specFolder, '.run', 'results', '1.md'),
        'utf8',
      );
      assert.match(synthesized, /^---\nsynthesized: true\n---\n/);
      assert.match(synthesized, /<text>/);

      const events = await readEvents(specFolder, '1');
      assert.equal(events.find((event) => event.type === 'started')?.data?.harness, 'claude');
      assert.equal(events.find((event) => event.type === 'started')?.data?.harnessAuth, 'login');
      assert.ok(events.some((event) => event.type === 'verify_ran'));
      assert.ok(events.some((event) => event.type === 'done'));
      assert.equal(
        await fs
          .stat(path.join(specFolder, '.run', 'done', '1'))
          .then(() => true)
          .catch(() => false),
        true,
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('writes a crashed dead letter with Claude stderr when the sandbox is unavailable', async () => {
    const { root, specFolder } = await createClaudeProject('claude-run-sandbox');
    try {
      const config = claudeConfig({ sandbox: true });
      await approveTask(root, specFolder, config);
      env.set({
        OSQ_FAKE_CLAUDE_EXIT: '1',
        OSQ_FAKE_CLAUDE_STDERR: 'sandbox required but unavailable',
      });

      const result = await runTask(root, specFolder, '1', config, new ClaudeAdapter());
      assert.equal(result.success, false);
      assert.equal(result.reason, 'crashed');
      const dead = await markerText(path.join(specFolder, '.run', 'dead', '1.md'));
      assert.match(dead, /reason: crashed/);
      assert.match(dead, /sandbox required but unavailable/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('names the failing result subtype in the crashed dead letter', async () => {
    const { root, specFolder } = await createClaudeProject('claude-run-subtype');
    try {
      const config = claudeConfig();
      await approveTask(root, specFolder, config);
      env.set({ OSQ_FAKE_CLAUDE_JSONL: ERROR_RESULT_RUN, OSQ_FAKE_CLAUDE_EXIT: '1' });

      const result = await runTask(root, specFolder, '1', config, new ClaudeAdapter());
      assert.equal(result.success, false);
      assert.equal(result.reason, 'crashed');
      const dead = await markerText(path.join(specFolder, '.run', 'dead', '1.md'));
      assert.match(dead, /error_max_turns/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
