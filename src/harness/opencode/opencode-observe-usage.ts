import type { ObservedPlanningSession } from '../../core/report/planning-observed.js';
import type { PlanningTurn } from '../../core/report/planning-slice.js';
import { spawnWithTimeout } from '../process.js';
import {
  buildOpencodeObservationQuery,
  finiteNonNegative,
  parseRows,
  parseTimeMs,
} from './opencode-usage.js';

/**
 * Approval-time OpenCode observation through the configured executable's
 * read-only `db --format json` interface. Only session metadata, assistant
 * message usage projected through `json_extract`, and part edit metadata are
 * read; transcript and file content never enter osq.
 */

interface TurnDraft {
  readonly timestamp: string;
  readonly model: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly cacheReadTokens: number | null;
  readonly cacheWriteTokens: number | null;
  readonly reasoningTokens: number | null;
  readonly cost: number | null;
  readonly edits: string[];
}

interface Draft {
  directory: string | null;
  version: string | null;
  model: string | null;
  readonly turns: TurnDraft[];
  readonly byMessage: Map<string, TurnDraft>;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Accumulate one session's rows, one turn per distinct assistant message. */
function absorbRow(drafts: Map<string, Draft>, row: Record<string, unknown>): void {
  const sessionId = text(row.session_id);
  const messageId = text(row.message_id);
  if (!sessionId || !messageId) return;
  let draft = drafts.get(sessionId);
  if (!draft) {
    draft = {
      directory: text(row.directory),
      version: text(row.version),
      model: null,
      turns: [],
      byMessage: new Map(),
    };
    drafts.set(sessionId, draft);
  }
  let turn = draft.byMessage.get(messageId);
  if (!turn) {
    const messageMs = parseTimeMs(row.message_time);
    if (messageMs === null) return;
    const model = text(row.model);
    turn = {
      timestamp: new Date(messageMs).toISOString(),
      model,
      inputTokens: finiteNonNegative(row.tokens_input),
      outputTokens: finiteNonNegative(row.tokens_output),
      cacheReadTokens: finiteNonNegative(row.tokens_cache_read),
      cacheWriteTokens: finiteNonNegative(row.tokens_cache_write),
      reasoningTokens: finiteNonNegative(row.tokens_reasoning),
      cost: finiteNonNegative(row.cost),
      edits: [],
    };
    draft.byMessage.set(messageId, turn);
    draft.turns.push(turn);
    if (model) draft.model = model;
  }
  const editPath = text(row.edit_path);
  if (editPath && !turn.edits.includes(editPath)) turn.edits.push(editPath);
}

function toTurn(turn: TurnDraft): PlanningTurn {
  return {
    timestamp: turn.timestamp,
    model: turn.model,
    inputTokens: turn.inputTokens,
    outputTokens: turn.outputTokens,
    cacheReadTokens: turn.cacheReadTokens,
    cacheWriteTokens: turn.cacheWriteTokens,
    reasoningTokens: turn.reasoningTokens,
    cost: turn.cost,
    edits: turn.edits,
  };
}

/** Read local OpenCode sessions with completed write/edit parts. */
export async function readOpencodePlanningSessions(
  bin: string,
): Promise<readonly ObservedPlanningSession[]> {
  let stdout: string;
  try {
    const result = await spawnWithTimeout({
      command: bin,
      args: ['db', '--format', 'json', buildOpencodeObservationQuery()],
      cwd: process.cwd(),
      timeoutSeconds: 10,
    });
    if (result.exitCode !== 0) return [];
    stdout = result.stdout;
  } catch {
    return [];
  }

  const drafts = new Map<string, Draft>();
  for (const row of parseRows(stdout)) {
    absorbRow(drafts, row);
  }

  const results: ObservedPlanningSession[] = [];
  for (const [nativeSessionId, draft] of drafts) {
    const turns = draft.turns.map(toTurn);
    if (turns.length === 0) continue;
    results.push({
      harness: 'opencode',
      nativeSessionId,
      sessionDir: draft.directory,
      model: draft.model,
      harnessVersion: draft.version,
      sessionCost: null,
      turns,
    });
  }
  return results;
}
