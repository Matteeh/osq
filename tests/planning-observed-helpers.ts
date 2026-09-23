import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import type { ObservedPlanningSession } from '../src/core/report/planning-observed.js';
import type { PlanningTurn } from '../src/core/report/planning-slice.js';
import { installFakeValidator } from './helpers.js';

export const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const CLAUDE_FIXTURE_DIR = path.join(
  TESTS_DIR,
  'fixtures',
  'planning-observed',
  'claude-projects',
);

export const PASSING_VERIFY = 'node verify.cjs';
export const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

export const ENV_KEYS = [
  'CODEX_HOME',
  'OPENCODE_PATH',
  'OSQ_OPENCODE_DB_ROWS_FILE',
  'OSQ_CLAUDE_PROJECTS_DIR',
  'CLAUDE_CONFIG_DIR',
] as const;
export const SAVED_ENV = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

export function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = SAVED_ENV.get(key);
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
}

export async function installLocalVerifier(root: string, folderPath: string): Promise<void> {
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

export async function createProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-planning-observed-'));
  await installFakeValidator(root);
  await scaffoldProject(root);
  return root;
}

export async function createChange(
  root: string,
  title: string,
): Promise<{ specId: string; folderPath: string }> {
  const spec = await createNewSpec(root, title);
  await installLocalVerifier(root, spec.folderPath);
  return { specId: spec.specId, folderPath: spec.folderPath };
}

export async function captureLogs(run: () => Promise<void>): Promise<string[]> {
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

export async function readManifest(folderPath: string): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(path.join(folderPath, '.run', 'manifest.json'), 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

export async function renderTree(
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

/** One turn carrying a single edited path and no recorded usage. */
export function editTurn(target: string, timestamp: string): PlanningTurn {
  return {
    timestamp,
    model: null,
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    reasoningTokens: null,
    cost: null,
    edits: [target],
  };
}

/** The default session turn, one per edit the helper used to list. */
const DEFAULT_TURNS: readonly PlanningTurn[] = [editTurn('tasks/1.md', '2026-01-01T00:00:30.000Z')];

export function candidate(
  overrides: Partial<ObservedPlanningSession> = {},
): ObservedPlanningSession {
  return {
    harness: 'claude',
    nativeSessionId: 'native-1',
    sessionDir: null,
    model: 'm',
    turns: DEFAULT_TURNS,
    ...overrides,
  };
}
