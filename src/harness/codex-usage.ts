import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  type InteractiveUsage,
  NULL_INTERACTIVE_USAGE,
  type ReadInteractiveUsageOptions,
} from './types.js';

/**
 * Read-only Codex rollout usage. Resolves the native data home, considers only
 * rollout JSONL candidates created during the observed interval, requires
 * exactly one whose `session_meta.payload.cwd` resolves to the planning working
 * directory, and reads the last cumulative `thread_token_usage` counters. No
 * transcript or per-request usage is consulted, and cost stays null because the
 * local rollout record does not carry it.
 */

/** Resolve Codex's data home: `CODEX_HOME` when set, else the platform home. */
export function resolveCodexDataHome(
  env: NodeJS.ProcessEnv = process.env,
  homeDir: string = os.homedir(),
): string {
  const configured = env.CODEX_HOME?.trim();
  return configured && configured.length > 0 ? configured : path.join(homeDir, '.codex');
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function finiteNonNegative(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

async function listRolloutFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listRolloutFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(full);
    }
  }
  return files;
}

interface RolloutData {
  readonly cwd: string | null;
  readonly usage: InteractiveUsage | null;
}

/** Extract session cwd and the last cumulative thread usage from a rollout. */
export function parseCodexRollout(content: string): RolloutData {
  let cwd: string | null = null;
  let usage: InteractiveUsage | null = null;

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const event = asRecord(parsed);
    const payload = asRecord(event?.payload);
    if (!event || !payload) continue;

    if (event.type === 'session_meta') {
      if (typeof payload.cwd === 'string') cwd = payload.cwd;
      continue;
    }

    if (event.type === 'token_usage_record') {
      const counters = asRecord(payload.thread_token_usage);
      if (!counters) continue;
      usage = {
        inputTokens: finiteNonNegative(counters.input_tokens),
        outputTokens: finiteNonNegative(counters.output_tokens),
        cachedTokens: finiteNonNegative(counters.cached_input_tokens),
        reasoningTokens: finiteNonNegative(counters.reasoning_output_tokens),
        cost: null,
      };
    }
  }

  return { cwd, usage };
}

function sameDirectory(value: string | null, cwd: string): boolean {
  if (!value) return false;
  try {
    return path.resolve(value) === path.resolve(cwd);
  } catch {
    return false;
  }
}

/**
 * Reads observed usage from the one new matching rollout. Missing data,
 * malformed files, unreadable directories, and multiple matches all degrade to
 * the all-null value.
 */
export async function readCodexInteractiveUsage(
  options: ReadInteractiveUsageOptions,
): Promise<InteractiveUsage> {
  const startedMs = Date.parse(options.startedAt);
  const endedMs = Date.parse(options.endedAt);
  if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs)) {
    return NULL_INTERACTIVE_USAGE;
  }

  const sessionsDir = path.join(resolveCodexDataHome(), 'sessions');
  const files = await listRolloutFiles(sessionsDir);

  const matches: RolloutData[] = [];
  for (const file of files) {
    const stat = await fs.stat(file).catch(() => null);
    if (!stat || stat.mtimeMs < startedMs || stat.mtimeMs > endedMs) continue;
    const content = await fs.readFile(file, 'utf8').catch(() => null);
    if (content === null) continue;
    const rollout = parseCodexRollout(content);
    if (!sameDirectory(rollout.cwd, options.cwd)) continue;
    matches.push(rollout);
  }

  if (matches.length !== 1) {
    return NULL_INTERACTIVE_USAGE;
  }
  return matches[0].usage ?? NULL_INTERACTIVE_USAGE;
}
