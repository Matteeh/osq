/**
 * Shared harness stream helpers. Harness adapters translate an unbounded stdout
 * stream of JSON lines into `events.jsonl`; the record coercion, string picking,
 * timestamp resolution, and line buffering are identical across adapters and
 * live here so each adapter only owns its event translation.
 */

/** Coerce an unknown JSON value into a plain object, or `undefined` for arrays and primitives. */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Return the first candidate that is a non-empty string, skipping every other type. */
export function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

/**
 * Resolve an event timestamp to ISO form. Harnesses report either a top-level
 * `timestamp` or, for Antigravity step updates, a nested `step_update.timestamp`.
 * Invalid or missing timestamps fall back to the current time so an event is
 * never written without one.
 */
export function resolveEventTimestamp(eventObj: Record<string, unknown>): string {
  const stepUpdate = asRecord(eventObj.step_update);
  const candidate = eventObj.timestamp ?? stepUpdate?.timestamp;
  if (typeof candidate === 'number' || typeof candidate === 'string') {
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  return new Date().toISOString();
}

/**
 * Buffers arbitrarily chunked stdout and delivers complete, non-blank lines to
 * an async handler one at a time in arrival order. A handler rejection is
 * swallowed so a single malformed line can never abort the rest of the stream;
 * `flush` drains whatever partial line remains and resolves after every queued
 * handler has settled.
 */
export class EventStreamParser {
  private buffer = '';
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly onLine: (line: string) => Promise<void>) {}

  feed(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      this.enqueue(line);
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.trim()) {
      this.enqueue(this.buffer);
    }
    this.buffer = '';
    await this.pending;
  }

  private enqueue(line: string): void {
    if (!line.trim()) {
      return;
    }
    this.pending = this.pending.then(() => this.onLine(line).catch(() => {}));
  }
}
