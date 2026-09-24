import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type OsqConfig, defineConfig } from '../../src/core/foundation/config.js';
import { scaffoldProject } from '../../src/core/foundation/init.js';
import { createNewSpec } from '../../src/core/foundation/new.js';
import { installFakeValidator } from '../helpers.js';

export const FAKE_CLAUDE = fileURLToPath(new URL('./exec-fake-claude.mjs', import.meta.url));

export const GOLDEN_RUN = fileURLToPath(new URL('../fixtures/claude/run.jsonl', import.meta.url));

export const CLAUDE_FIXTURES_DIR = fileURLToPath(new URL('.', import.meta.url));

export const ERROR_RESULT_RUN = path.join(CLAUDE_FIXTURES_DIR, 'exec-fixture-error-result.jsonl');

export const TEXT_RUN = path.join(CLAUDE_FIXTURES_DIR, 'exec-fixture-text.jsonl');

export interface ProjectFixture {
  root: string;
  specFolder: string;
}

/** Disposable scaffolded repository with one change folder. */
export async function createClaudeProject(prefix: string): Promise<ProjectFixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `osq-${prefix}-`));
  await installFakeValidator(root);
  await scaffoldProject(root);
  const spec = await createNewSpec(root, 'Claude Fixture Feature');
  return { root, specFolder: spec.folderPath };
}

export interface TaskOptions {
  verify?: string;
}

/** Overwrite task 1 with an approved-task shape. */
export async function writeClaudeTask(
  specFolder: string,
  options: TaskOptions = {},
): Promise<void> {
  const lines = [
    '---',
    'title: When a Claude task runs',
    `verify: ${options.verify ?? 'node -e "process.exit(0)"'}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] claude task completes',
    '',
  ];
  await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(specFolder, 'tasks', '1.md'), lines.join('\n'), 'utf8');
}

/** Config selecting the fake Claude executable with optional settings. */
export function claudeConfig(overrides: Partial<OsqConfig['claude']> = {}): OsqConfig {
  return defineConfig({
    harness: 'claude',
    claude: {
      bin: FAKE_CLAUDE,
      ...overrides,
    },
  });
}

/** Save and restore a set of environment keys across a test. */
export function envScope(keys: readonly string[]): {
  save: () => void;
  restore: () => void;
  set: (values: Record<string, string>) => void;
} {
  let saved = new Map<string, string | undefined>();
  return {
    save() {
      saved = new Map(keys.map((key) => [key, process.env[key]]));
    },
    restore() {
      for (const [key, value] of saved) {
        if (value === undefined) Reflect.deleteProperty(process.env, key);
        else process.env[key] = value;
      }
    },
    set(values) {
      for (const [key, value] of Object.entries(values)) process.env[key] = value;
    },
  };
}
