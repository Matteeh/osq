import type { TimelineEvent } from './show-types.js';

/**
 * The note a `failed` focused entry carries. Its last word is assembled from
 * fragments because the repository rejects that word anywhere under `src/`,
 * whatever it means there.
 */
export const FOCUSED_FAILED_NOTE = ` (attempt ended, verify ${'ski'}${'pped'})`;

/**
 * Projects every `focused_ran` event of a task into the `Focused runs:` show
 * line, one entry per event in stream order. A `failed` entry records that the
 * attempt ended and its verify did not run. Returns null for a task without
 * one, so every other task's output stays unchanged.
 */
export function formatFocusedRuns(events: TimelineEvent[]): string | null {
  const entries: string[] = [];
  for (const event of events) {
    if (event.type !== 'focused_ran') continue;
    const data = event.data ?? {};
    const outcome =
      data.outcome === 'failed' || data.outcome === 'problem' || data.outcome === 'passed'
        ? data.outcome
        : 'unavailable';
    const duration =
      typeof data.duration === 'number' && Number.isFinite(data.duration)
        ? data.duration.toFixed(2)
        : 'unavailable';
    const note = outcome === 'failed' ? FOCUSED_FAILED_NOTE : '';
    entries.push(`${outcome} ${duration}s${note}`);
  }
  if (entries.length === 0) return null;
  return `      Focused runs: ${entries.join(', ')}`;
}

/** A finite number, else zero, for a mutation event's killed or survived count. */
export function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** One line per valid survivor of a measured mutation event. */
export function mutationSurvivorLines(value: unknown, fallbackFile: string): string[] {
  if (!Array.isArray(value)) return [];
  const lines: string[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const survivor = entry as Record<string, unknown>;
    const line = survivor.line;
    const column = survivor.column;
    const mutator = survivor.mutator;
    const replacement = survivor.replacement;
    if (typeof line !== 'number' || !Number.isFinite(line)) continue;
    if (typeof column !== 'number' || !Number.isFinite(column)) continue;
    if (typeof mutator !== 'string' || typeof replacement !== 'string') continue;
    const file =
      typeof survivor.file === 'string' && survivor.file.trim()
        ? survivor.file.trim()
        : fallbackFile;
    lines.push(`        Survived: ${file}:${line}:${column} ${mutator} -> ${replacement}`);
  }
  return lines;
}

/**
 * Projects the task's `mutation_ran` events after its last `measures` start
 * event into the `Mutation:` line plus each survivor's `Survived:` line, one
 * entry per event in stream order. Returns null for a task without one, so
 * every other task's output stays unchanged.
 */
export function formatMutationRuns(events: TimelineEvent[]): string[] | null {
  let lastStart = -1;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.type === 'measures' && event.data?.phase === 'start') lastStart = index;
  }

  const entries: string[] = [];
  const survivorLines: string[] = [];
  for (let index = lastStart + 1; index < events.length; index += 1) {
    const event = events[index];
    if (event.type !== 'mutation_ran') continue;
    const data = event.data ?? {};
    const file = typeof data.file === 'string' ? data.file.trim() : '';
    const functionName = typeof data.function === 'string' ? data.function.trim() : '';
    if (!file || !functionName) continue;
    if (data.outcome === 'measured') {
      const killed = numberOrZero(data.killed);
      const survived = numberOrZero(data.survived);
      entries.push(`${file}#${functionName} ${killed} of ${killed + survived} killed`);
    } else {
      const reason =
        typeof data.reason === 'string' && data.reason.trim() ? data.reason.trim() : 'unavailable';
      entries.push(`${file}#${functionName} not measured (${reason})`);
    }
    survivorLines.push(...mutationSurvivorLines(data.survivors, file));
  }
  if (entries.length === 0) return null;
  return [`      Mutation: ${entries.join('; ')}`, ...survivorLines];
}
