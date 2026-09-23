import fs from 'node:fs/promises';
import path from 'node:path';
import { readPlanningSessions } from '../report/planning.js';
import {
  asData,
  eventTimestampMs,
  observeAttempts,
  observeTaskStream,
  parseEventLines,
} from '../report/report-events.js';
import {
  type TokenDraft,
  mergeTokenDraft,
  observeTokenGroups,
  sortedTokenGroups,
} from './web-data-tokens.js';
import type { WebCoverage, WebMetricObservation } from './web-data-types.js';

/** Execution observations for one change plus its total recorded attempts. */
export interface ChangeExecutionObservation {
  readonly attempts: number;
  readonly observation: WebMetricObservation;
}

/** Covered duration in seconds from valid measures start-to-end pairs. */
function measureDurationSeconds(events: readonly Record<string, unknown>[]): number | null {
  let pendingStartMs: number | null = null;
  let coveredMs = 0;
  let hasDuration = false;
  for (const event of events) {
    if (event.type !== 'measures') continue;
    const data = asData(event);
    if (data?.phase === 'start') {
      pendingStartMs = eventTimestampMs(event);
    } else if (data?.phase === 'end') {
      const endMs = eventTimestampMs(event);
      if (pendingStartMs !== null && endMs !== null && endMs >= pendingStartMs) {
        coveredMs += endMs - pendingStartMs;
        hasDuration = true;
      }
      pendingStartMs = null;
    }
  }
  return hasDuration ? coveredMs / 1000 : null;
}

/** Numbered task event streams only; `change.jsonl` is never a task stream. */
export async function listTaskEventFiles(folderPath: string): Promise<string[]> {
  const entries = await fs.readdir(path.join(folderPath, '.run', 'events')).catch(() => []);
  return entries
    .filter((entry) => /^\d+\.jsonl$/.test(entry))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
}

async function readEvents(folderPath: string, file: string): Promise<Record<string, unknown>[]> {
  const content = await fs
    .readFile(path.join(folderPath, '.run', 'events', file), 'utf8')
    .catch(() => '');
  return parseEventLines(content);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Per-task execution observations for one numbered event stream. */
export interface TaskEventObservation {
  readonly attempts: number;
  readonly cost: number | null;
  readonly costCoverage: WebCoverage;
  readonly duration: number | null;
}

/** Reads one numbered task stream into its task-level execution observations. */
export async function observeTaskFile(
  folderPath: string,
  taskNumber: string,
): Promise<TaskEventObservation> {
  const events = await readEvents(folderPath, `${taskNumber}.jsonl`);
  const stream = observeTaskStream(events);
  return {
    attempts: stream.attempts,
    cost: stream.costReportedAttempts === 0 ? null : sum(stream.costValues),
    costCoverage: { reported: stream.costReportedAttempts, total: stream.attempts },
    duration: measureDurationSeconds(events),
  };
}

/**
 * Aggregates per-change execution evidence from numbered task streams only.
 * `cost` stays null when no attempt reported a cost; no value is estimated.
 */
export async function observeExecution(folderPath: string): Promise<ChangeExecutionObservation> {
  const files = await listTaskEventFiles(folderPath);
  const groups = new Map<string, TokenDraft>();
  const costValues: number[] = [];
  const durations: number[] = [];
  let attempts = 0;
  let reported = 0;
  let passTotal = 0;
  let passPassed = 0;

  for (const file of files) {
    const events = await readEvents(folderPath, file);
    const stream = observeTaskStream(events);
    attempts += stream.attempts;
    reported += stream.costReportedAttempts;
    costValues.push(...stream.costValues);

    const duration = measureDurationSeconds(events);
    if (duration !== null) durations.push(duration);

    const attempt = observeAttempts(events);
    if (attempt.attempts > 0) {
      passTotal++;
      if (attempt.firstAttemptPass) passPassed++;
    }
    for (const [key, draft] of observeTokenGroups(events)) groups.set(key, draft);
  }

  const costCoverage: WebCoverage = { reported, total: attempts };
  return {
    attempts,
    observation: {
      cost: reported === 0 ? null : sum(costValues),
      costCoverage,
      tokens: sortedTokenGroups(groups),
      durations,
      firstAttemptPass: { reported: passPassed, total: passTotal },
    },
  };
}

/**
 * Aggregates per-change planning evidence from valid `.run/plan.jsonl`
 * lifecycle pairs. Cost coverage counts only sessions whose `usage.cost` was
 * recorded; tokens alone yield a null cost and `reported: 0` rather than a
 * summed zero.
 */
export async function observePlanning(folderPath: string): Promise<WebMetricObservation> {
  const sessions = (await readPlanningSessions(folderPath)).filter((session) => session.started);
  if (sessions.length === 0) {
    return {
      cost: null,
      costCoverage: { reported: 0, total: 0 },
      tokens: [],
      durations: [],
      firstAttemptPass: { reported: 0, total: 0 },
    };
  }

  const groups = new Map<string, TokenDraft>();
  const durations: number[] = [];
  const costValues: number[] = [];
  let reported = 0;

  for (const session of sessions) {
    const started = session.started;
    if (!started) continue;
    const exited = session.exited;
    if (!exited) continue;
    const usage = exited.data.usage;
    const harness = started.data.harness || '';
    const model = started.data.model;
    if (usage.inputTokens !== null) {
      mergeTokenDraft(groups, harness, model, {
        input: usage.inputTokens,
        cachedInput: 0,
        output: 0,
        reasoning: 0,
        total: usage.inputTokens,
      });
    }
    if (usage.outputTokens !== null) {
      mergeTokenDraft(groups, harness, model, {
        input: 0,
        cachedInput: 0,
        output: usage.outputTokens,
        reasoning: 0,
        total: usage.outputTokens,
      });
    }
    if (usage.cachedTokens !== null) {
      mergeTokenDraft(groups, harness, model, {
        input: 0,
        cachedInput: usage.cachedTokens,
        output: 0,
        reasoning: 0,
        total: 0,
      });
    }
    if (usage.reasoningTokens !== null) {
      mergeTokenDraft(groups, harness, model, {
        input: 0,
        cachedInput: 0,
        output: 0,
        reasoning: usage.reasoningTokens,
        total: 0,
      });
    }
    if (usage.cost !== null) {
      costValues.push(usage.cost);
      reported++;
    }
    if (Number.isFinite(exited.data.wallSeconds)) durations.push(exited.data.wallSeconds);
  }

  return {
    cost: reported === 0 ? null : sum(costValues),
    costCoverage: { reported, total: sessions.length },
    tokens: sortedTokenGroups(groups),
    durations,
    firstAttemptPass: { reported: 0, total: 0 },
  };
}
