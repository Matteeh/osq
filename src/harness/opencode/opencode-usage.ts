import path from 'node:path';
import { spawnWithTimeout } from '../process.js';
import {
  type InteractiveUsage,
  NULL_INTERACTIVE_USAGE,
  type ReadInteractiveUsageOptions,
} from '../types.js';

/**
 * Read-only OpenCode session usage. Uses the resolved harness CLI's
 * `db --format json` interface to select only the session metadata and usage
 * columns, then requires exactly one row for the planning working directory
 * whose creation time falls inside the observed interval. Transcripts and
 * message content are never read.
 */

const SESSION_COLUMNS = [
  'directory',
  'time_created',
  'tokens_input',
  'tokens_output',
  'tokens_reasoning',
  'tokens_cache_read',
  'tokens_cache_write',
  'cost',
];

/** Build a read-only session query with safely quoted values. */
export function buildOpencodeSessionQuery(cwd: string): string {
  const escaped = cwd.replace(/'/g, "''");
  return `SELECT ${SESSION_COLUMNS.join(', ')} FROM session WHERE directory = '${escaped}'`;
}

/**
 * Build a read-only message+part query for approval-time observation. It joins
 * `message` to `session` on `message.session_id` and left-joins `part` on
 * `part.message_id` with the completed write/edit filters, keeping only rows
 * that carry such a part. Every usage, model, and edit field is projected
 * through SQLite `json_extract`, so raw `message.data`, `part.data`, prompts,
 * output, old/new strings, and write content never enter osq. It never names
 * the old `part.sessionID` column.
 */
export function buildOpencodeObservationQuery(): string {
  const columns = [
    'message.session_id AS session_id',
    'session.directory AS directory',
    'session.version AS version',
    'message.id AS message_id',
    'message.time_created AS message_time',
    "json_extract(message.data, '$.modelID') AS model",
    "json_extract(message.data, '$.tokens.input') AS tokens_input",
    "json_extract(message.data, '$.tokens.output') AS tokens_output",
    "json_extract(message.data, '$.tokens.reasoning') AS tokens_reasoning",
    "json_extract(message.data, '$.tokens.cache.read') AS tokens_cache_read",
    "json_extract(message.data, '$.tokens.cache.write') AS tokens_cache_write",
    "json_extract(message.data, '$.cost') AS cost",
    "json_extract(part.data, '$.state.input.filePath') AS edit_path",
    'part.time_created AS edit_time',
  ];
  const partFilters = [
    "json_extract(part.data, '$.type') = 'tool'",
    "json_extract(part.data, '$.tool') IN ('write', 'edit')",
    "json_extract(part.data, '$.state.status') = 'completed'",
  ];
  return `SELECT ${columns.join(', ')} FROM message JOIN session ON session.id = message.session_id LEFT JOIN part ON part.message_id = message.id AND ${partFilters.join(' AND ')} WHERE json_extract(message.data, '$.role') = 'assistant' AND part.message_id IS NOT NULL`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function finiteNonNegative(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

export function parseTimeMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e11 ? value : value * 1000;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric > 1e11 ? numeric : numeric * 1000;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/** Coerce `db --format json` output into object rows, tolerating both shapes. */
export function parseRows(stdout: string): Record<string, unknown>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }

  if (Array.isArray(parsed)) {
    return parsed
      .map((row) => asRecord(row))
      .filter((row): row is Record<string, unknown> => row !== undefined);
  }

  const container = asRecord(parsed);
  if (!container) return [];
  const rows = Array.isArray(container.rows) ? container.rows : [];
  const columns = Array.isArray(container.columns) ? container.columns.map(String) : [];

  const result: Record<string, unknown>[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (record) {
      result.push(record);
      continue;
    }
    if (Array.isArray(row) && columns.length === row.length) {
      const mapped: Record<string, unknown> = {};
      columns.forEach((column, index) => {
        mapped[column] = row[index];
      });
      result.push(mapped);
    }
  }
  return result;
}

function sameDirectory(value: unknown, cwd: string): boolean {
  if (typeof value !== 'string') return false;
  try {
    return path.resolve(value) === path.resolve(cwd);
  } catch {
    return false;
  }
}

export function mapUsage(row: Record<string, unknown>): InteractiveUsage {
  const cacheRead = finiteNonNegative(row.tokens_cache_read);
  const cacheWrite = finiteNonNegative(row.tokens_cache_write);
  // Cache is the sum of the harness's stored read and write counters; it is
  // never derived from totals.
  const cachedTokens =
    cacheRead === null && cacheWrite === null ? null : (cacheRead ?? 0) + (cacheWrite ?? 0);
  return {
    inputTokens: finiteNonNegative(row.tokens_input),
    outputTokens: finiteNonNegative(row.tokens_output),
    cachedTokens,
    reasoningTokens: finiteNonNegative(row.tokens_reasoning),
    cost: finiteNonNegative(row.cost),
  };
}

/**
 * Reads observed usage through `bin`. Any spawn failure, non-zero exit,
 * unparseable output, or non-unique match degrades to the all-null value.
 */
export async function readOpencodeInteractiveUsage(
  options: ReadInteractiveUsageOptions,
  bin: string,
): Promise<InteractiveUsage> {
  const startedMs = Date.parse(options.startedAt);
  const endedMs = Date.parse(options.endedAt);
  if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs)) {
    return NULL_INTERACTIVE_USAGE;
  }

  let stdout: string;
  try {
    const result = await spawnWithTimeout({
      command: bin,
      args: ['db', '--format', 'json', buildOpencodeSessionQuery(options.cwd)],
      cwd: options.cwd,
      timeoutSeconds: 10,
    });
    if (result.exitCode !== 0) {
      return NULL_INTERACTIVE_USAGE;
    }
    stdout = result.stdout;
  } catch {
    return NULL_INTERACTIVE_USAGE;
  }

  const matches = parseRows(stdout).filter((row) => {
    if (!sameDirectory(row.directory, options.cwd)) return false;
    const created = parseTimeMs(row.time_created);
    return created !== null && created >= startedMs && created <= endedMs;
  });

  if (matches.length !== 1) {
    return NULL_INTERACTIVE_USAGE;
  }
  return mapUsage(matches[0]);
}
