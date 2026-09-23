import fs from 'node:fs/promises';
import path from 'node:path';
import { compareNumericPrefix } from '../status/state.js';
import { readPlanningSessions } from './planning-records.js';
import { asData, parseEventLines } from './report-events.js';

/** Per-kind planning token totals of one change; null means nothing reported. */
export interface PlanningChangeTokens {
  readonly input: number | null;
  readonly output: number | null;
  readonly cacheRead: number | null;
  readonly cacheWrite: number | null;
  readonly reasoning: number | null;
}

/** Per-change planning economics derived from slices, usage, and measures. */
export interface PlanningChangeEconomics {
  readonly sessions: number;
  readonly tokens: PlanningChangeTokens;
  readonly activeMinutes: number | null;
  readonly cost: number | null;
  readonly specWords: number | null;
  readonly changedLines: number | null;
  readonly specWordsPerChangedLine: number | null;
  readonly minutesLastEditToApproval: number | null;
}

/** One side of the planning-versus-execution comparison. */
export interface PlanningComparisonSide {
  /** Null when nothing on this side reported that kind of token. */
  readonly input: number | null;
  readonly output: number | null;
  readonly cached: number | null;
  readonly reasoning: number | null;
  /** Null when nothing on this side reported a cost. */
  readonly cost: number | null;
}

/** Planning against executor tokens and cost, in totals. */
export interface PlanningComparison {
  readonly planning: PlanningComparisonSide;
  readonly execution: PlanningComparisonSide;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Sum a nullable observation, staying null until the first report arrives. */
function addNullable(current: number | null, value: number | null): number | null {
  if (value === null) return current;
  return current === null ? value : current + value;
}

/** Epoch milliseconds for a persisted ISO timestamp, or null when invalid. */
function parseTimeMs(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

interface MeasuresTotals {
  readonly specWords: number | null;
  readonly changedLines: number | null;
}

/** Task event files (`<n>.jsonl`) in stable numeric order. */
function numericTaskFiles(entries: readonly string[]): string[] {
  return entries.filter((entry) => /^\d+\.jsonl$/.test(entry)).sort(compareNumericPrefix);
}

/**
 * One change's spec words and changed lines from `measures` events. Spec words
 * are the first task start's `proposalWords` plus every task's first start
 * `taskWords`; changed lines sum each task's last end `changedLines`.
 */
async function readMeasuresTotals(folderPath: string): Promise<MeasuresTotals> {
  const eventsDir = path.join(folderPath, '.run', 'events');
  let entries: string[] = [];
  try {
    entries = numericTaskFiles(await fs.readdir(eventsDir));
  } catch {
    return { specWords: null, changedLines: null };
  }

  let sawStart = false;
  let firstProposalWords: number | null = null;
  let taskWordsTotal: number | null = null;
  let changedLines: number | null = null;

  for (const entry of entries) {
    const content = await fs.readFile(path.join(eventsDir, entry), 'utf8').catch(() => null);
    if (content === null) continue;
    let firstStart: Record<string, unknown> | null = null;
    let lastEndChanged: number | null = null;
    for (const event of parseEventLines(content)) {
      if (event.type !== 'measures') continue;
      const data = asData(event);
      if (!data) continue;
      if (data.phase === 'start' && firstStart === null) {
        firstStart = data;
        if (!sawStart) {
          sawStart = true;
          firstProposalWords = finiteNumber(data.proposalWords);
        }
      } else if (data.phase === 'end') {
        const value = finiteNumber(data.changedLines);
        lastEndChanged = value !== null && value >= 0 ? value : null;
      }
    }
    if (firstStart !== null) {
      const taskWords = finiteNumber(firstStart.taskWords);
      if (taskWords !== null) taskWordsTotal = (taskWordsTotal ?? 0) + taskWords;
    }
    if (lastEndChanged !== null) changedLines = (changedLines ?? 0) + lastEndChanged;
  }

  return {
    specWords: sawStart ? (firstProposalWords ?? 0) + (taskWordsTotal ?? 0) : null,
    changedLines,
  };
}

/**
 * Per-change planning economics for one folder, or null when it has no valid
 * planning start. Sliced sessions contribute their slice; legacy sessions
 * contribute usage input, output, and reasoning with a null cache split.
 */
async function changeEconomics(folderPath: string): Promise<PlanningChangeEconomics | null> {
  const sessions = await readPlanningSessions(folderPath);
  const validSessions = sessions.filter((session) => session.started !== null);
  if (validSessions.length === 0) return null;

  let tokens: PlanningChangeTokens = {
    input: null,
    output: null,
    cacheRead: null,
    cacheWrite: null,
    reasoning: null,
  };
  let activeMinutes: number | null = null;
  let cost: number | null = null;
  let latestApprovedMs: number | null = null;
  let latestLastEditMs: number | null = null;

  for (const session of validSessions) {
    const exited = session.exited;
    if (!exited) continue;
    const usage = exited.data.usage;
    const slice = exited.data.slice;
    if (slice) {
      tokens = {
        input: addNullable(tokens.input, slice.tokens.input),
        output: addNullable(tokens.output, slice.tokens.output),
        cacheRead: addNullable(tokens.cacheRead, slice.tokens.cacheRead),
        cacheWrite: addNullable(tokens.cacheWrite, slice.tokens.cacheWrite),
        reasoning: addNullable(tokens.reasoning, slice.tokens.reasoning),
      };
      activeMinutes = addNullable(activeMinutes, slice.activeMinutes);
      const approvedMs = parseTimeMs(slice.approvedAt);
      if (approvedMs !== null)
        latestApprovedMs = Math.max(latestApprovedMs ?? approvedMs, approvedMs);
      const lastEditMs = parseTimeMs(slice.lastEditAt);
      if (lastEditMs !== null)
        latestLastEditMs = Math.max(latestLastEditMs ?? lastEditMs, lastEditMs);
    } else {
      tokens = {
        ...tokens,
        input: addNullable(tokens.input, usage.inputTokens),
        output: addNullable(tokens.output, usage.outputTokens),
        reasoning: addNullable(tokens.reasoning, usage.reasoningTokens),
      };
    }
    cost = addNullable(cost, usage.cost);
  }

  const measures = await readMeasuresTotals(folderPath);
  const ratio =
    measures.specWords !== null && measures.changedLines !== null && measures.changedLines !== 0
      ? round2(measures.specWords / measures.changedLines)
      : null;

  return {
    sessions: validSessions.length,
    tokens,
    activeMinutes,
    cost,
    specWords: measures.specWords,
    changedLines: measures.changedLines,
    specWordsPerChangedLine: ratio,
    minutesLastEditToApproval:
      latestApprovedMs !== null && latestLastEditMs !== null
        ? round2((latestApprovedMs - latestLastEditMs) / 60000)
        : null,
  };
}

/** Planning economics for every change folder carrying a valid planning start. */
export async function computePlanningByChange(
  folders: readonly string[],
): Promise<Record<string, PlanningChangeEconomics>> {
  const byChange: Record<string, PlanningChangeEconomics> = {};
  for (const folderPath of folders) {
    const economics = await changeEconomics(folderPath);
    if (economics) byChange[path.basename(folderPath)] = economics;
  }
  return byChange;
}

/** Planning against execution totals, with null costs when nothing reported. */
export function buildPlanningComparison(
  planning: PlanningComparisonSide,
  execution: PlanningComparisonSide,
): PlanningComparison {
  return { planning, execution };
}
