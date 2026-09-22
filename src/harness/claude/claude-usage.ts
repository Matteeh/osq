import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  ObservedPlanningSession,
  PlanningSessionEdit,
} from '../../core/report/planning-observed.js';
import { type InteractiveUsage, NULL_INTERACTIVE_USAGE } from '../types.js';

const EDIT_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

/** Resolve the Claude session store: explicit osq override, config dir, or home. */
export function resolveClaudeProjectsDir(
  env: NodeJS.ProcessEnv = process.env,
  homeDir: string = os.homedir(),
): string {
  const explicit = env.OSQ_CLAUDE_PROJECTS_DIR?.trim();
  if (explicit) return explicit;
  const configDir = env.CLAUDE_CONFIG_DIR?.trim();
  if (configDir) return path.join(configDir, 'projects');
  return path.join(homeDir, '.claude', 'projects');
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function validIso(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function contentBlocks(record: Record<string, unknown>): Record<string, unknown>[] {
  const message = asRecord(record.message);
  if (!Array.isArray(message?.content)) return [];
  return message.content
    .map((block) => asRecord(block))
    .filter((block): block is Record<string, unknown> => block !== undefined);
}

function editPath(block: Record<string, unknown>): string | null {
  const name = block.name;
  if (typeof name !== 'string' || !EDIT_TOOLS.has(name)) return null;
  const input = asRecord(block.input);
  return name === 'NotebookEdit' ? text(input?.notebook_path) : text(input?.file_path);
}

function addNullable(total: number | null, value: number | null): number | null {
  return value === null ? total : (total ?? 0) + value;
}

interface ParsedCostState {
  startMs: number | null;
  endMs: number | null;
  usage: InteractiveUsage;
}

/** Sum the final per-model counters and cache read plus cache creation once. */
function parseCostState(record: Record<string, unknown> | null): ParsedCostState | null {
  if (!record) return null;
  const startMs = finiteNonNegative(record.startTime);
  const duration = finiteNonNegative(record.totalDuration);
  const endMs = startMs !== null && duration !== null ? startMs + duration : null;

  let input: number | null = null;
  let output: number | null = null;
  let reasoning: number | null = null;
  let cacheRead: number | null = null;
  let cacheCreation: number | null = null;
  const modelUsage = asRecord(record.modelUsage);
  if (modelUsage) {
    for (const value of Object.values(modelUsage)) {
      const usage = asRecord(value);
      if (!usage) continue;
      input = addNullable(input, finiteNonNegative(usage.input_tokens));
      output = addNullable(output, finiteNonNegative(usage.output_tokens));
      reasoning = addNullable(
        reasoning,
        finiteNonNegative(
          usage.thinking_tokens ?? usage.reasoning_output_tokens ?? usage.reasoning_tokens,
        ),
      );
      cacheRead = addNullable(cacheRead, finiteNonNegative(usage.cache_read_input_tokens));
      cacheCreation = addNullable(
        cacheCreation,
        finiteNonNegative(usage.cache_creation_input_tokens),
      );
    }
  }
  const cached =
    cacheRead === null && cacheCreation === null ? null : (cacheRead ?? 0) + (cacheCreation ?? 0);
  return {
    startMs,
    endMs,
    usage: {
      inputTokens: input,
      outputTokens: output,
      cachedTokens: cached,
      reasoningTokens: reasoning,
      cost: finiteNonNegative(record.totalCostUSD),
    },
  };
}

/** Parse one Claude session JSONL body into an observation candidate. */
export function parseClaudeSession(content: string): ObservedPlanningSession | null {
  const records: Record<string, unknown>[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = asRecord(JSON.parse(line));
      if (parsed) records.push(parsed);
    } catch {
      // Malformed lines are ignored.
    }
  }

  const errored = new Set<string>();
  for (const record of records) {
    for (const block of contentBlocks(record)) {
      if (block.type === 'tool_result' && block.is_error === true && text(block.tool_use_id)) {
        errored.add(block.tool_use_id as string);
      }
    }
  }

  let sessionId: string | null = null;
  let cwd: string | null = null;
  let model: string | null = null;
  let earliest: string | null = null;
  let latest: string | null = null;
  let costState: Record<string, unknown> | null = null;
  const edits: PlanningSessionEdit[] = [];

  for (const record of records) {
    sessionId = sessionId ?? text(record.sessionId);
    cwd = cwd ?? text(record.cwd);
    const timestamp = validIso(record.timestamp);
    if (timestamp) {
      if (earliest === null || timestamp < earliest) earliest = timestamp;
      if (latest === null || timestamp > latest) latest = timestamp;
    }
    if (record.type === 'cost-state') {
      costState = record;
      continue;
    }
    const isAssistant =
      record.type === 'assistant' || asRecord(record.message)?.role === 'assistant';
    if (!isAssistant || !timestamp) continue;
    for (const block of contentBlocks(record)) {
      if (block.type !== 'tool_use') continue;
      const id = text(block.id);
      if (id && errored.has(id)) continue;
      const target = editPath(block);
      if (!target) continue;
      edits.push({ path: target, timestamp });
      model = text(asRecord(record.message)?.model) ?? model;
    }
  }

  if (!sessionId || edits.length === 0) return null;
  const cost = parseCostState(costState);
  return {
    harness: 'claude',
    nativeSessionId: sessionId,
    sessionDir: cwd,
    model,
    startedAt: cost?.startMs != null ? new Date(cost.startMs).toISOString() : earliest,
    endedAt: cost?.endMs != null ? new Date(cost.endMs).toISOString() : latest,
    usage: cost?.usage ?? NULL_INTERACTIVE_USAGE,
    edits,
  };
}

function hasUsage(usage: InteractiveUsage): boolean {
  return Object.values(usage).some((value) => value !== null);
}

function mergeObservations(
  a: ObservedPlanningSession,
  b: ObservedPlanningSession,
): ObservedPlanningSession {
  const edits = [...a.edits];
  const seen = new Set(edits.map((edit) => `${edit.timestamp}\u0000${edit.path}`));
  for (const edit of b.edits) {
    const key = `${edit.timestamp}\u0000${edit.path}`;
    if (!seen.has(key)) {
      seen.add(key);
      edits.push(edit);
    }
  }
  const starts = [a.startedAt, b.startedAt].filter((value): value is string => value !== null);
  const ends = [a.endedAt, b.endedAt].filter((value): value is string => value !== null);
  return {
    harness: 'claude',
    nativeSessionId: a.nativeSessionId,
    sessionDir: a.sessionDir ?? b.sessionDir,
    model: a.model ?? b.model,
    startedAt: starts.length > 0 ? starts.sort()[0] : null,
    endedAt: ends.length > 0 ? ends.sort()[ends.length - 1] : null,
    usage: hasUsage(a.usage) ? a.usage : b.usage,
    edits,
  };
}

async function listJsonlFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonlFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(full);
    }
  }
  return files;
}

/** Recursively read and merge Claude sessions by native session id. */
export async function readClaudePlanningSessions(
  projectsDir: string = resolveClaudeProjectsDir(),
): Promise<readonly ObservedPlanningSession[]> {
  const files = await listJsonlFiles(projectsDir);
  const grouped = new Map<string, ObservedPlanningSession>();
  for (const file of files) {
    const content = await fs.readFile(file, 'utf8').catch(() => null);
    if (content === null) continue;
    const observation = parseClaudeSession(content);
    if (!observation) continue;
    const existing = grouped.get(observation.nativeSessionId);
    grouped.set(
      observation.nativeSessionId,
      existing ? mergeObservations(existing, observation) : observation,
    );
  }
  return [...grouped.values()];
}
