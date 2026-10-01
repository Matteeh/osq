/** Shared single-read scope for report event streams and planning logs. */

import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseEventLines } from './report-events.js';
import type { StreamIndex } from './stream-index.js';

/** One file's parsers, each with the parsed result its callers share. */
type ParserCache = Map<(content: string) => unknown, Promise<unknown>>;

/** One read scope: the shared parser cache plus an optional archived-stream index. */
interface StreamReadScope {
  readonly parsers: Map<string, ParserCache>;
  readonly index?: StreamIndex;
}

/** The ambient scope, absent outside a `withStreamReads` call. */
const storage = new AsyncLocalStorage<StreamReadScope>();

/** Event types whose `output` log the report never reads and must not keep. */
const LOG_EVENT_TYPES: ReadonlySet<string> = new Set([
  'verify_ran',
  'regressed',
  'recertification',
]);

/** Read one file and run one parser over its text, mapping failure to null. */
async function readAndParse<T>(filePath: string, parse: (content: string) => T): Promise<T | null> {
  const content = await fs.readFile(filePath, 'utf8').catch(() => null);
  if (content === null) return null;
  return parse(content);
}

/**
 * Runs `work` inside one read scope. A nested call reuses the outer scope, so
 * every reader in the same asynchronous context shares one file read.
 */
export function withStreamReads<T>(work: () => Promise<T>, index?: StreamIndex): Promise<T> {
  if (storage.getStore()) return work();
  const scope: StreamReadScope = index ? { parsers: new Map(), index } : { parsers: new Map() };
  return storage.run(scope, work);
}

/**
 * Reads and parses one file. Inside a scope, one absolute path and one parser
 * read the file once and give every caller the same parsed result. Outside a
 * scope, every call goes to disk. A file that cannot be read gives null.
 */
export async function readParsedFile<T>(
  filePath: string,
  parse: (content: string) => T,
): Promise<T | null> {
  const resolved = path.resolve(filePath);
  const scope = storage.getStore();
  if (!scope) return readAndParse(resolved, parse);

  let parsers = scope.parsers.get(resolved);
  if (!parsers) {
    parsers = new Map();
    scope.parsers.set(resolved, parsers);
  }
  const cached = parsers.get(parse);
  if (cached) return cached as Promise<T | null>;

  const pending = readAndParse(resolved, parse);
  parsers.set(parse, pending);
  return pending;
}

/** Strips a log-carrying event's `output` and freezes the event and its data. */
function freezeEvent(event: Record<string, unknown>): Readonly<Record<string, unknown>> {
  const data = event.data;
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    if (LOG_EVENT_TYPES.has(String(event.type))) {
      const stripped: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record)) {
        if (key !== 'output') stripped[key] = value;
      }
      event.data = Object.freeze(stripped);
    } else {
      Object.freeze(record);
    }
  }
  return Object.freeze(event);
}

/** Parses one event stream, dropping logs and freezing what callers receive. */
function parseEventStream(content: string): readonly Readonly<Record<string, unknown>>[] {
  return parseEventLines(content).map(freezeEvent);
}

/** Re-freezes one event stream decoded from the index; null when malformed. */
function decodeEventStream(json: string): readonly Readonly<Record<string, unknown>>[] | null {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((event) => freezeEvent(event as Record<string, unknown>));
  } catch {
    return null;
  }
}

/**
 * Reads one event stream through the shared scope, without its verify logs.
 * Inside a scope with an index, a covered file consults the index by size and
 * modification time first; a miss reads and parses the file and stores it.
 */
export async function readEventStream(
  filePath: string,
): Promise<readonly Readonly<Record<string, unknown>>[] | null> {
  const resolved = path.resolve(filePath);
  const index = storage.getStore()?.index;
  if (!index || !index.covers(resolved)) {
    return readParsedFile(resolved, parseEventStream);
  }

  const stat = await fs.stat(resolved).catch(() => null);
  if (stat === null) return null;

  const stored = index.lookup(resolved, stat.size, stat.mtimeMs);
  if (stored !== null) {
    const indexed = decodeEventStream(stored);
    if (indexed !== null) return indexed;
  }

  const events = await readParsedFile(resolved, parseEventStream);
  if (events !== null) {
    index.store(resolved, stat.size, stat.mtimeMs, JSON.stringify(events));
  }
  return events;
}
