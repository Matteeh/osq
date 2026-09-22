import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type OsqConfig, defineConfig } from '../../src/core/foundation/config.js';
import { scaffoldProject } from '../../src/core/foundation/init.js';
import { createNewSpec } from '../../src/core/foundation/new.js';
import { installFakeValidator } from '../helpers.js';

export const FAKE_CODEX = fileURLToPath(new URL('./fake-codex.mjs', import.meta.url));

export const FIXTURES_DIR = fileURLToPath(new URL('./fixtures', import.meta.url));

export const FIXTURE_EVENTS = path.join(FIXTURES_DIR, 'codex-events.jsonl');
export const FIXTURE_RECOVERABLE = path.join(FIXTURES_DIR, 'codex-recoverable.jsonl');
export const FIXTURE_TURN_FAILED = path.join(FIXTURES_DIR, 'codex-turn-failed.jsonl');

export interface ProjectFixture {
  root: string;
  specFolder: string;
}

/** Disposable scaffolded repository with no change folders yet. */
export async function createScaffoldedProject(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `osq-${prefix}-`));
  await installFakeValidator(root);
  await scaffoldProject(root);
  return root;
}

/** Disposable copy of the fixture repository sized for codex integration tests. */
export async function createCodexProject(prefix: string): Promise<ProjectFixture> {
  const root = await createScaffoldedProject(prefix);
  const spec = await createNewSpec(root, 'Codex Fixture Feature');
  return { root, specFolder: spec.folderPath };
}

export interface TaskOptions {
  verify?: string;
}

/** Overwrite task 1 with an approved-task shape and return its spec folder. */
export async function writeCodexTask(specFolder: string, options: TaskOptions = {}): Promise<void> {
  const lines = [
    '---',
    'title: When a Codex task runs',
    `verify: ${options.verify ?? 'node -e "process.exit(0)"'}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] codex task completes',
    '',
  ];
  await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(specFolder, 'tasks', '1.md'), lines.join('\n'), 'utf8');
}

/** Config selecting the fake Codex executable with optional model/effort. */
export function codexConfig(overrides: Partial<OsqConfig['codex']> = {}): OsqConfig {
  return defineConfig({
    harness: 'codex',
    codex: {
      bin: FAKE_CODEX,
      ...overrides,
    },
  });
}
