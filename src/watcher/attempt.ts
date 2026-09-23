import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveSymbol } from '../core/foundation/logger.js';
import { parseFrontmatter } from '../core/spec/parser.js';
import { asRecord } from '../harness/stream.js';
import { stripAnsi } from './fingerprint.js';

const ELLIPSIS = '…';

function truncateToWidth(text: string, width: number): string {
  if (width <= 0) return '';
  if (text.length <= width) return text;
  if (width === 1) return ELLIPSIS;
  return `${text.slice(0, width - 1)}${ELLIPSIS}`;
}

/** Curated task-started line: prefix plus the title truncated to terminal width. */
export function formatTaskStartedLine(
  taskNumber: string,
  title: string,
  pid: number | undefined,
  timeoutSeconds: number,
  symbols: boolean,
  terminalWidth: number = (process.stderr as unknown as { columns?: number }).columns ?? 80,
): string {
  const symbol = resolveSymbol('▶', '[task]', symbols);
  const prefix = `${symbol} task ${taskNumber} started (pid: ${pid ?? 'unknown'}, timeout: ${timeoutSeconds}s): `;
  return `${prefix}${truncateToWidth(title, Math.max(0, terminalWidth - prefix.length))}`;
}

export interface RetryContext {
  readonly attempt: number;
  readonly reason?: string;
  /** Failure output retained by the latest retry or requeued recertification. */
  readonly output?: string;
}

/**
 * Body after the frontmatter of the dead marker a retry retained, with ANSI
 * codes stripped. The retained attempt ordinal is one less than the following
 * execution attempt. A missing marker, as after retrying a regression, yields no
 * output.
 */
async function readRetainedMarkerBody(
  specFolderPath: string,
  taskNumber: string,
  attempt: number,
): Promise<string | undefined> {
  const markerPath = path.join(specFolderPath, '.run', 'dead', `${taskNumber}.${attempt - 1}.md`);
  const content = await fs.readFile(markerPath, 'utf8').catch(() => undefined);
  if (content === undefined) return undefined;
  return stripAnsi(parseFrontmatter(content).body);
}

/**
 * Reconstruct the target-wide execution attempt, prior failure reason, and
 * failure output from the append-only event stream. The latest `retry`
 * transition or requeued `recertification` wins, so a watcher restart loses
 * neither the attempt nor the failure context. A retry's output is the body of
 * the dead marker it retained; a requeued recertification keeps its captured
 * verification output. A passed recertification is not a transition and never
 * advances attempts. Without either event the target starts at attempt 1.
 */
export async function readRetryContext(
  specFolderPath: string,
  taskNumber: string,
): Promise<RetryContext> {
  const eventPath = path.join(specFolderPath, '.run', 'events', `${taskNumber}.jsonl`);
  const content = await fs.readFile(eventPath, 'utf8').catch(() => '');
  let attempt = 1;
  let reason: string | undefined;
  let output: string | undefined;
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const event = asRecord(parsed);
    if (event?.type === 'retry') {
      const data = asRecord(event.data);
      if (typeof data?.attempt === 'number' && Number.isInteger(data.attempt)) {
        attempt = data.attempt;
      }
      if (typeof data?.reason === 'string' && data.reason) {
        reason = data.reason;
      }
      output = await readRetainedMarkerBody(specFolderPath, taskNumber, attempt);
      continue;
    }
    if (event?.type !== 'recertification') continue;
    const data = asRecord(event.data);
    if (data?.outcome !== 'requeued') continue;
    if (typeof data.attempt === 'number' && Number.isInteger(data.attempt)) {
      attempt = data.attempt;
    }
    if (typeof data.reason === 'string' && data.reason) {
      reason = data.reason;
    }
    if (typeof data.output === 'string') {
      output = data.output;
    }
  }
  return {
    attempt,
    ...(reason ? { reason } : {}),
    ...(output ? { output } : {}),
  };
}
