import fs from 'node:fs/promises';
import path from 'node:path';
import { getEventsPath } from '../status/layout.js';

/** One trailer line in an osq commit message. */
export interface CommitTrailer {
  readonly key: string;
  readonly value: string;
}

/** The parts `formatCommitMessage` assembles, in order. */
export interface CommitMessageInput {
  readonly subject: string;
  readonly title: string;
  readonly outcomeLine: string;
  readonly trailers: readonly CommitTrailer[];
}

/** The harness, model, and osq version recorded by one `started` event. */
interface StartedTrailers {
  readonly harness: string;
  readonly model: string;
  readonly osqVersion: string;
}

/** A `started` event's data when it carries all three string fields, else null. */
function startedTrailers(data: unknown): StartedTrailers | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const { harness, model, osqVersion } = data as Record<string, unknown>;
  if (typeof harness !== 'string' || typeof model !== 'string' || typeof osqVersion !== 'string') {
    return null;
  }
  return { harness, model, osqVersion };
}

/** The last valid `started` event in one task's stream, malformed lines ignored. */
function lastStartedTrailers(content: string): StartedTrailers | null {
  let last: StartedTrailers | null = null;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    let event: unknown;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (event === null || typeof event !== 'object' || Array.isArray(event)) continue;
    const record = event as Record<string, unknown>;
    if (record.type !== 'started') continue;
    const trailers = startedTrailers(record.data);
    if (trailers !== null) last = trailers;
  }
  return last;
}

/**
 * The `Osq-Change` and `Osq-Task` trailers always, plus `Osq-Model` and
 * `Osq-Version` when the task's last valid `started` event carries them.
 */
export async function readCommitTrailers(
  changeFolder: string,
  taskNumber: string,
): Promise<CommitTrailer[]> {
  const trailers: CommitTrailer[] = [
    { key: 'Osq-Change', value: path.basename(changeFolder) },
    { key: 'Osq-Task', value: taskNumber },
  ];
  const content = await fs
    .readFile(getEventsPath(changeFolder, taskNumber), 'utf8')
    .catch(() => null);
  if (content === null) return trailers;
  const started = lastStartedTrailers(content);
  if (started === null) return trailers;
  trailers.push({ key: 'Osq-Model', value: `${started.harness} ${started.model}` });
  trailers.push({ key: 'Osq-Version', value: started.osqVersion });
  return trailers;
}

/**
 * Assemble one osq commit message: the subject, a blank line, the title and
 * outcome line on their own lines, a blank line, then every trailer, ending
 * with one newline. Pure.
 */
export function formatCommitMessage(input: CommitMessageInput): string {
  return [
    input.subject,
    '',
    input.title,
    input.outcomeLine,
    '',
    ...input.trailers.map((trailer) => `${trailer.key}: ${trailer.value}`),
    '',
  ].join('\n');
}
