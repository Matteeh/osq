import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { buildAgyPrompt } from '../src/harness/agy/agy.js';
import { buildCodexPrompt } from '../src/harness/codex/codex-prompt.js';
import { buildOpencodePrompt } from '../src/harness/opencode/opencode.js';
import { buildExecutorPrompt } from '../src/harness/prompt.js';
import type { SpawnTaskOptions } from '../src/harness/types.js';

const PROJECT_ROOT = process.cwd();
const CHANGE_FOLDER = path.join(PROJECT_ROOT, 'openspec', 'changes', '001-test');

function options(): SpawnTaskOptions {
  return {
    projectRoot: PROJECT_ROOT,
    specFolderPath: CHANGE_FOLDER,
    taskNumber: '3',
    taskTitle: 'When an executor prompt is built',
    verifyCommand: 'node --import tsx --test tests/executor-no-git.test.ts',
    scope: ['src/harness/prompt.ts'],
    entry: ['src/harness/prompt.ts'],
    skills: [],
    tier: 'coding',
    config: DEFAULT_CONFIG,
  };
}

function lastLine(prompt: string): string {
  return prompt.split('\n').at(-1) ?? '';
}

describe('Executor prompt forbids running git', () => {
  it('ends the prompt built by buildExecutorPrompt with the no-git sentence', () => {
    const prompt = buildExecutorPrompt(options());
    const line = lastLine(prompt);

    assert.match(line, /never run git/i);
    assert.match(line, /Never run git\.$/);
  });

  it('ends every textual harness prompt with the same no-git sentence', async () => {
    const taskOptions = options();
    const prompts = [
      buildAgyPrompt(taskOptions),
      buildOpencodePrompt(taskOptions),
      await buildCodexPrompt(taskOptions),
    ];

    for (const prompt of prompts) {
      assert.match(lastLine(prompt), /Never run git\.$/);
    }
  });
});
