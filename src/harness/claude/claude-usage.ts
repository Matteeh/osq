import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  ObservedPlanningSession,
  PlanningSessionEdit,
} from '../../core/report/planning-observed.js';
import type { PlanningTurn } from '../../core/report/planning-slice.js';
import { NULL_INTERACTIVE_USAGE } from '../types.js';
import { parseClaudeTurns } from './claude-turns.js';

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

function editsFromTurns(turns: readonly PlanningTurn[]): PlanningSessionEdit[] {
  const edits: PlanningSessionEdit[] = [];
  for (const turn of turns) {
    for (const raw of turn.edits) edits.push({ path: raw, timestamp: turn.timestamp });
  }
  return edits;
}

function lastModel(turns: readonly PlanningTurn[]): string | null {
  let model: string | null = null;
  for (const turn of turns) model = turn.model ?? model;
  return model;
}

/**
 * Parse one Claude session JSONL body. Each assistant message becomes one turn
 * carrying its own usage; `usage`, `startedAt`, and `endedAt` are legacy fields
 * that the observer no longer derives from the transcript.
 */
export function parseClaudeSession(content: string): ObservedPlanningSession | null {
  const parsed = parseClaudeTurns(content);
  if (!parsed.sessionId) return null;
  const edits = editsFromTurns(parsed.turns);
  if (edits.length === 0) return null;
  return {
    harness: 'claude',
    nativeSessionId: parsed.sessionId,
    sessionDir: parsed.cwd,
    model: lastModel(parsed.turns),
    harnessVersion: parsed.harnessVersion,
    sessionCost: parsed.sessionCost,
    usage: NULL_INTERACTIVE_USAGE,
    turns: parsed.turns,
    edits,
  };
}

function turnMergeKey(turn: PlanningTurn): string {
  const id = (turn as { messageId?: string | null }).messageId;
  if (id) return id;
  return [
    turn.timestamp,
    turn.model ?? '',
    String(turn.inputTokens),
    String(turn.outputTokens),
    String(turn.cacheReadTokens),
    String(turn.cacheWriteTokens),
    String(turn.reasoningTokens),
    String(turn.cost),
    [...turn.edits].join('\u0001'),
  ].join('\u0000');
}

interface MergedTurn {
  source: PlanningTurn;
  earliest: string;
  model: string | null;
  readonly edits: string[];
}

function rebuildTurn(merged: MergedTurn): PlanningTurn {
  const rebuilt: PlanningTurn = {
    timestamp: merged.earliest,
    model: merged.model,
    inputTokens: merged.source.inputTokens,
    outputTokens: merged.source.outputTokens,
    cacheReadTokens: merged.source.cacheReadTokens,
    cacheWriteTokens: merged.source.cacheWriteTokens,
    reasoningTokens: merged.source.reasoningTokens,
    cost: merged.source.cost,
    edits: merged.edits,
  };
  Object.defineProperty(rebuilt, 'messageId', {
    value: (merged.source as { messageId?: string | null }).messageId ?? null,
    enumerable: false,
  });
  return rebuilt;
}

function mergeTurns(a: readonly PlanningTurn[], b: readonly PlanningTurn[]): PlanningTurn[] {
  const byKey = new Map<string, MergedTurn>();
  for (const turn of [...a, ...b]) {
    const key = turnMergeKey(turn);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        source: turn,
        earliest: turn.timestamp,
        model: turn.model,
        edits: [...turn.edits],
      });
      continue;
    }
    if (turn.timestamp < existing.earliest) existing.earliest = turn.timestamp;
    existing.model = existing.model ?? turn.model;
    for (const raw of turn.edits) {
      if (!existing.edits.includes(raw)) existing.edits.push(raw);
    }
  }
  return [...byKey.values()]
    .map(rebuildTurn)
    .sort((x, y) => x.timestamp.localeCompare(y.timestamp));
}

function mergeObservations(
  a: ObservedPlanningSession,
  b: ObservedPlanningSession,
): ObservedPlanningSession {
  const turns = mergeTurns(a.turns ?? [], b.turns ?? []);
  return {
    harness: 'claude',
    nativeSessionId: a.nativeSessionId,
    sessionDir: a.sessionDir ?? b.sessionDir,
    model: a.model ?? b.model,
    harnessVersion: a.harnessVersion ?? b.harnessVersion,
    sessionCost: a.sessionCost ?? b.sessionCost,
    usage: NULL_INTERACTIVE_USAGE,
    turns,
    edits: editsFromTurns(turns),
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
