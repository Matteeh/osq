import fs from 'node:fs/promises';
import path from 'node:path';
import { asRecord } from '../harness/stream.js';

/** The provider retry a task attempt is still waiting on, if any. */
export interface OpenProviderRetry {
  /** ISO timestamp of the attempt's first open `harness_retry` start. */
  readonly startedAt: string;
  /** Error carried by the latest open start, when it carried one. */
  readonly error?: string;
}

/** Reasons a spawned agent can terminate under this module's classification. */
export type AgentFailureReason = 'crashed' | 'timeout' | 'provider_unavailable';

/**
 * Read a task's events, skipping malformed lines. A missing file reads as no
 * events, so an unreadable stream never blocks a lifecycle decision.
 */
async function readEvents(specFolderPath: string, taskNumber: string): Promise<unknown[]> {
  const raw = await fs
    .readFile(path.join(specFolderPath, '.run', 'events', `${taskNumber}.jsonl`), 'utf8')
    .catch(() => '');
  const events: unknown[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // Malformed lines never hide a later valid event.
    }
  }
  return events;
}

function isRetryStart(event: Record<string, unknown>): boolean {
  return event.type === 'harness_retry' && asRecord(event.data)?.phase === 'start';
}

function isSuccessfulRetryEnd(event: Record<string, unknown>): boolean {
  const data = asRecord(event.data);
  return event.type === 'harness_retry' && data?.phase === 'end' && data.success === true;
}

/**
 * Find the open provider retry in a task's current attempt: events after its
 * last `started`. A `harness_retry` start stays open while no later end carries
 * `success: true`. The first open start drives the stall clock, and the latest
 * open start's error is what a dead marker quotes.
 */
export function findOpenProviderRetry(events: readonly unknown[]): OpenProviderRetry | undefined {
  let attemptStart = -1;
  for (let index = 0; index < events.length; index += 1) {
    if (asRecord(events[index])?.type === 'started') attemptStart = index;
  }
  let lastSuccessEnd = attemptStart;
  for (let index = attemptStart + 1; index < events.length; index += 1) {
    const record = asRecord(events[index]);
    if (record && isSuccessfulRetryEnd(record)) lastSuccessEnd = index;
  }
  let firstOpen: Record<string, unknown> | undefined;
  let latestOpen: Record<string, unknown> | undefined;
  for (let index = lastSuccessEnd + 1; index < events.length; index += 1) {
    const record = asRecord(events[index]);
    if (!record || !isRetryStart(record)) continue;
    firstOpen ??= record;
    latestOpen = record;
  }
  if (!firstOpen || !latestOpen) return undefined;
  const startedAt = firstOpen.timestamp;
  if (typeof startedAt !== 'string' || startedAt.length === 0) return undefined;
  const error = asRecord(latestOpen.data)?.error;
  return {
    startedAt,
    ...(typeof error === 'string' && error.length > 0 ? { error } : {}),
  };
}

/** Read a task's current attempt and return its open provider retry, if any. */
export async function readOpenProviderRetry(
  specFolderPath: string,
  taskNumber: string,
): Promise<OpenProviderRetry | undefined> {
  return findOpenProviderRetry(await readEvents(specFolderPath, taskNumber));
}

interface AgentFailureMarkerInput {
  readonly reason: AgentFailureReason;
  readonly exitCode: number;
  readonly signal?: string | null;
  /** Error rendered in the marker body; the provider's error for an outage. */
  readonly error?: string;
}

/** Dead marker content for a crashed, timed-out, or provider-outage agent. */
export function formatAgentFailureMarker(failure: AgentFailureMarkerInput): string {
  const lines = ['---', `reason: ${failure.reason}`, `exit_code: ${failure.exitCode}`];
  if (failure.signal) lines.push(`signal: ${failure.signal}`);
  lines.push('---');
  if (failure.reason === 'provider_unavailable') {
    lines.push(`The model provider did not answer: ${failure.error || 'no error reported'}\n`);
  } else {
    const verb = failure.reason === 'timeout' ? 'timed out' : 'crashed';
    lines.push(`Agent ${verb} with code ${failure.exitCode}: ${failure.error || ''}\n`);
  }
  return lines.join('\n');
}

/** Classify a failed agent and render the marker its death is recorded with. */
export async function describeAgentFailure(
  specFolderPath: string,
  taskNumber: string,
  result: {
    readonly timedOut?: boolean;
    readonly exitCode: number;
    readonly signal?: string | null;
    readonly error?: string;
  },
): Promise<{ readonly reason: AgentFailureReason; readonly marker: string }> {
  const retry = await readOpenProviderRetry(specFolderPath, taskNumber);
  const reason: AgentFailureReason = retry
    ? 'provider_unavailable'
    : result.timedOut
      ? 'timeout'
      : 'crashed';
  const error = retry ? retry.error : result.error;
  const marker = formatAgentFailureMarker({
    reason,
    exitCode: result.exitCode,
    signal: result.signal,
    error,
  });
  return { reason, marker };
}

export interface ProviderStallWatchOptions {
  readonly specFolderPath: string;
  readonly taskNumber: string;
  /** Seconds an open retry may last before the agent is stopped; 0 disables. */
  readonly stallSeconds: number;
  readonly heartbeatSeconds: number;
  /** Resolves the running agent's pid, which may be unknown at first. */
  readonly pid: () => number | undefined;
}

/**
 * Watch a running task's stream for a stalled provider retry and SIGTERM the
 * agent once it has lasted `stallSeconds`. Uses a `setTimeout` chain so the
 * watcher keeps its single heartbeat interval. Returns a stop function; every
 * timer is unref'd. `stallSeconds` of 0 disables the watch.
 */
export function startProviderStallWatch(options: ProviderStallWatchOptions): () => void {
  if (options.stallSeconds <= 0) return () => {};
  const stallMs = options.stallSeconds * 1000;
  const heartbeat = options.heartbeatSeconds;
  const intervalSeconds =
    heartbeat > 0 ? Math.min(heartbeat, options.stallSeconds) : options.stallSeconds;
  const tickMs = intervalSeconds * 1000;
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  const stop = (): void => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = undefined;
  };

  const check = async (): Promise<void> => {
    if (stopped) return;
    const retry = await readOpenProviderRetry(options.specFolderPath, options.taskNumber);
    const pid = options.pid();
    if (retry && pid !== undefined) {
      const startedAt = Date.parse(retry.startedAt);
      if (Number.isFinite(startedAt) && Date.now() - startedAt >= stallMs) {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          // The agent may have exited between the check and the signal.
        }
        stop();
        return;
      }
    }
    if (stopped) return;
    timer = setTimeout(() => void check(), tickMs);
    timer.unref();
  };

  timer = setTimeout(() => void check(), tickMs);
  timer.unref();
  return stop;
}
