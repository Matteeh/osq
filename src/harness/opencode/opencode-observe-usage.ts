import type {
  ObservedPlanningSession,
  PlanningSessionEdit,
} from '../../core/report/planning-observed.js';
import { spawnWithTimeout } from '../process.js';
import {
  buildOpencodeObservationQuery,
  mapUsage,
  parseRows,
  parseTimeMs,
} from './opencode-usage.js';

/**
 * Approval-time OpenCode observation through the configured executable's
 * read-only `db --format json` interface. Only session columns and projected
 * part edit metadata are read; transcript and file content never enter osq.
 */

interface Draft {
  directory: string | null;
  model: string | null;
  startedAt: string | null;
  endedAt: string | null;
  usageRow: Record<string, unknown>;
  edits: PlanningSessionEdit[];
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
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
    const sessionId = text(row.session_id);
    if (!sessionId) continue;
    let draft = drafts.get(sessionId);
    if (!draft) {
      const created = parseTimeMs(row.time_created);
      const updated = parseTimeMs(row.time_updated);
      draft = {
        directory: text(row.directory),
        model: text(row.model),
        startedAt: created === null ? null : new Date(created).toISOString(),
        endedAt: updated === null ? null : new Date(updated).toISOString(),
        usageRow: row,
        edits: [],
      };
      drafts.set(sessionId, draft);
    }
    const editPath = text(row.edit_path);
    const editMs = parseTimeMs(row.edit_time);
    if (editPath && editMs !== null) {
      draft.edits.push({ path: editPath, timestamp: new Date(editMs).toISOString() });
    }
  }

  const results: ObservedPlanningSession[] = [];
  for (const [nativeSessionId, draft] of drafts) {
    if (draft.edits.length === 0) continue;
    results.push({
      harness: 'opencode',
      nativeSessionId,
      sessionDir: draft.directory,
      model: draft.model,
      startedAt: draft.startedAt,
      endedAt: draft.endedAt,
      usage: mapUsage(draft.usageRow),
      edits: draft.edits,
    });
  }
  return results;
}
