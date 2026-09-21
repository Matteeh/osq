import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveSymbol } from '../core/logger.js';
import { asRecord } from '../harness/stream.js';

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
}

/**
 * Reconstruct the target-wide execution attempt and prior failure reason from
 * the append-only event stream. The latest `retry` event wins, so a watcher
 * restart loses neither the attempt nor the reason. Without any retry event the
 * target starts at attempt 1.
 */
export async function readRetryContext(
  specFolderPath: string,
  taskNumber: string,
): Promise<RetryContext> {
  const eventPath = path.join(specFolderPath, '.run', 'events', `${taskNumber}.jsonl`);
  const content = await fs.readFile(eventPath, 'utf8').catch(() => '');
  let attempt = 1;
  let reason: string | undefined;
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const event = asRecord(parsed);
    if (event?.type !== 'retry') continue;
    const data = asRecord(event.data);
    if (typeof data?.attempt === 'number' && Number.isInteger(data.attempt)) {
      attempt = data.attempt;
    }
    if (typeof data?.reason === 'string' && data.reason) {
      reason = data.reason;
    }
  }
  return reason ? { attempt, reason } : { attempt };
}
