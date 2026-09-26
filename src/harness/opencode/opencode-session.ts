import { spawnWithTimeout } from '../process.js';
import { asRecord } from '../stream.js';
import { appendHarnessEvent } from '../types.js';

/**
 * Whole-run token and cost totals for one opencode task. The adapter records
 * what the JSON stream reported and, after the process exits, reads the
 * session export to recover the final step the stream leaves out.
 */
export interface OpencodeUsageTotals {
  promptTokens: number;
  candidateTokens: number;
  totalTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  cost: number;
}

/** Mutable per-run state carried through the parser closure. */
export interface OpencodeRunTracker {
  sessionID?: string;
  totals: OpencodeUsageTotals;
}

function emptyTotals(): OpencodeUsageTotals {
  return {
    promptTokens: 0,
    candidateTokens: 0,
    totalTokens: 0,
    cachedTokens: 0,
    reasoningTokens: 0,
    cost: 0,
  };
}

export function createOpencodeRunTracker(): OpencodeRunTracker {
  return { totals: emptyTotals() };
}

/** Record the top-level `sessionID` every opencode stream event carries. */
export function trackOpencodeSessionID(tracker: OpencodeRunTracker, event: unknown): void {
  const eventObj = asRecord(event);
  const sessionID = eventObj?.sessionID;
  if (typeof sessionID === 'string' && sessionID.length > 0) {
    tracker.sessionID = sessionID;
  }
}

/** Accumulate one streamed `step_finish` usage record into the run totals. */
export function addOpencodeUsage(tracker: OpencodeRunTracker, usage: OpencodeUsageTotals): void {
  const totals = tracker.totals;
  totals.promptTokens += usage.promptTokens;
  totals.candidateTokens += usage.candidateTokens;
  totals.totalTokens += usage.totalTokens;
  totals.cachedTokens += usage.cachedTokens;
  totals.reasoningTokens += usage.reasoningTokens;
  totals.cost += usage.cost;
}

function count(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

/**
 * Parse `opencode session export` JSON. Returns the session's whole-run totals,
 * or `null` when the payload is not an object carrying an `info` record.
 */
export function parseOpencodeSessionExport(raw: string): OpencodeUsageTotals | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const info = asRecord(asRecord(parsed)?.info);
  if (!info) {
    return null;
  }
  const tokens = asRecord(info.tokens);
  const cache = asRecord(tokens?.cache);
  const promptTokens = count(tokens?.input);
  const candidateTokens = count(tokens?.output);
  return {
    promptTokens,
    candidateTokens,
    totalTokens: promptTokens + candidateTokens,
    cachedTokens: count(cache?.read) + count(cache?.write),
    reasoningTokens: count(tokens?.reasoning),
    cost: count(info.cost),
  };
}

/**
 * Run `opencode session export --standalone <sessionID>` and parse it. Any
 * spawn failure, non-zero exit, timeout, or unparseable payload yields `null`
 * so the caller appends nothing.
 */
export async function readOpencodeSessionUsage(
  bin: string,
  projectRoot: string,
  sessionID: string,
  timeoutSeconds: number,
): Promise<OpencodeUsageTotals | null> {
  let result: Awaited<ReturnType<typeof spawnWithTimeout>>;
  try {
    result = await spawnWithTimeout({
      command: bin,
      args: ['session', 'export', '--standalone', sessionID],
      cwd: projectRoot,
      timeoutSeconds,
    });
  } catch {
    return null;
  }
  if (result.exitCode !== 0 || result.timedOut) {
    return null;
  }
  return parseOpencodeSessionExport(result.stdout);
}

/** Field-wise remainder, clamped at zero so the session total is never undershot. */
export function computeOpencodeRemainder(
  streamed: OpencodeUsageTotals,
  session: OpencodeUsageTotals,
): OpencodeUsageTotals {
  const remainder = (recorded: number, total: number): number => Math.max(0, total - recorded);
  const promptTokens = remainder(streamed.promptTokens, session.promptTokens);
  const candidateTokens = remainder(streamed.candidateTokens, session.candidateTokens);
  return {
    promptTokens,
    candidateTokens,
    totalTokens: promptTokens + candidateTokens,
    cachedTokens: remainder(streamed.cachedTokens, session.cachedTokens),
    reasoningTokens: remainder(streamed.reasoningTokens, session.reasoningTokens),
    cost: remainder(streamed.cost, session.cost),
  };
}

function hasUsage(totals: OpencodeUsageTotals): boolean {
  return Object.values(totals).some((value) => value > 0);
}

/**
 * Append one `tokens` event carrying only what the session export reported
 * beyond the streamed totals. Appends nothing when the remainder is empty.
 */
export async function appendOpencodeSessionRemainder(
  specFolderPath: string,
  taskNumber: string,
  streamed: OpencodeUsageTotals,
  session: OpencodeUsageTotals,
): Promise<void> {
  const remainder = computeOpencodeRemainder(streamed, session);
  if (!hasUsage(remainder)) {
    return;
  }
  await appendHarnessEvent(specFolderPath, taskNumber, {
    type: 'tokens',
    timestamp: new Date().toISOString(),
    data: remainder,
  });
}
