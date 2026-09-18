import fs from 'node:fs/promises';
import path from 'node:path';
import { relativizeToolSummary } from '../core/summary.js';
import { asRecord } from '../harness/stream.js';

// Re-exported from core so existing watcher/status consumers keep importing it
// from the heartbeat module.
export { relativizeToolSummary };

export interface TaskHeartbeatStats {
  elapsedSeconds: number;
  eventCount: number;
  totalTokens: number;
  toolCount: number;
  cost?: number;
  lastToolSummary?: string;
}

/**
 * In-memory counters accumulated as the append-only event stream grows. The
 * byte offset lets a poll parse only newly appended complete lines instead of
 * re-reading the whole file on every heartbeat tick.
 */
interface HeartbeatAccumulator {
  byteOffset: number;
  eventCount: number;
  totalTokens: number;
  toolCount: number;
  cost: number;
  hasCost: boolean;
  lastToolSummary?: string;
}

const heartbeatAccumulators = new Map<string, HeartbeatAccumulator>();

function createHeartbeatAccumulator(): HeartbeatAccumulator {
  return { byteOffset: 0, eventCount: 0, totalTokens: 0, toolCount: 0, cost: 0, hasCost: false };
}

/**
 * Snapshot of task progress. Counters are maintained in memory and advanced
 * with only the bytes appended since the previous poll; tool summaries are
 * stored relativized to `projectRoot` for display.
 */
export async function computeTaskHeartbeatStats(
  specFolderPath: string,
  taskNumber: string,
  startTime: number,
  projectRoot?: string,
): Promise<TaskHeartbeatStats> {
  const elapsedSeconds = Number(((Date.now() - startTime) / 1000).toFixed(1));
  const eventFilePath = path.join(specFolderPath, '.run', 'events', `${taskNumber}.jsonl`);

  let content = '';
  try {
    content = await fs.readFile(eventFilePath, 'utf8');
  } catch {
    heartbeatAccumulators.delete(eventFilePath);
    return { elapsedSeconds, eventCount: 0, totalTokens: 0, toolCount: 0 };
  }

  let accumulator = heartbeatAccumulators.get(eventFilePath);
  if (!accumulator || accumulator.byteOffset > content.length) {
    accumulator = createHeartbeatAccumulator();
  }

  const fresh = content.slice(accumulator.byteOffset);
  const lastNewline = fresh.lastIndexOf('\n');
  if (lastNewline !== -1) {
    const complete = fresh.slice(0, lastNewline);
    accumulator.byteOffset += lastNewline + 1;

    for (const line of complete.split('\n')) {
      if (!line.trim()) {
        continue;
      }
      accumulator.eventCount += 1;

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        // Ignore malformed lines rather than losing the whole heartbeat.
        continue;
      }
      const event = asRecord(parsed);
      if (!event) {
        continue;
      }

      const data = asRecord(event.data);
      if (event.type === 'tokens') {
        accumulator.totalTokens += Number(data?.totalTokens ?? 0) || 0;
        const cost = Number(data?.cost);
        if (Number.isFinite(cost)) {
          accumulator.cost += cost;
          accumulator.hasCost = true;
        }
      } else if (event.type === 'tool') {
        accumulator.toolCount += 1;
        const summary = data?.summary;
        if (typeof summary === 'string') {
          accumulator.lastToolSummary = relativizeToolSummary(summary, projectRoot);
        }
      }
    }
  }

  heartbeatAccumulators.set(eventFilePath, accumulator);

  const stats: TaskHeartbeatStats = {
    elapsedSeconds,
    eventCount: accumulator.eventCount,
    totalTokens: accumulator.totalTokens,
    toolCount: accumulator.toolCount,
  };
  if (accumulator.hasCost) {
    stats.cost = accumulator.cost;
  }
  if (accumulator.lastToolSummary !== undefined) {
    stats.lastToolSummary = accumulator.lastToolSummary;
  }
  return stats;
}

/** Drop the in-memory counters for a finished task so the map does not grow. */
export function clearTaskHeartbeatStats(specFolderPath: string, taskNumber: string): void {
  const eventFilePath = path.join(specFolderPath, '.run', 'events', `${taskNumber}.jsonl`);
  heartbeatAccumulators.delete(eventFilePath);
}

/**
 * Compact token count for the live status row and the heartbeat line: below
 * 1000 as an integer, below 1M as `X.Xk`, at or above 1M as `X.XM`. A value
 * that rounds up to `1000.0k` rolls over to `1.0M` so the suffix never grows.
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) {
    return tokens.toString();
  }
  if (tokens < 1_000_000) {
    const k = (tokens / 1000).toFixed(1);
    if (k === '1000.0') {
      return '1.0M';
    }
    return `${k}k`;
  }
  return `${(tokens / 1_000_000).toFixed(1)}M`;
}

/**
 * Single-line running status row. The logger owns the animated spinner and
 * terminal-width truncation, so this assembles the full row and leaves fitting
 * to the sink.
 */
export function formatTaskStatusRow(taskNumber: string, stats: TaskHeartbeatStats): string {
  const segments = [
    `task ${taskNumber}`,
    `${stats.elapsedSeconds}s`,
    `${stats.toolCount} tools`,
    `${formatTokens(stats.totalTokens)} tokens`,
  ];
  if (typeof stats.cost === 'number' && Number.isFinite(stats.cost)) {
    segments.push(`$${stats.cost.toFixed(4)}`);
  }

  const base = segments.join(' · ');
  if (!stats.lastToolSummary) {
    return base;
  }
  return `${base} · ${stats.lastToolSummary}`;
}

/** Periodic heartbeat line shared by the 1s TTY row and the non-TTY log. */
export function formatTaskHeartbeatLine(taskNumber: string, stats: TaskHeartbeatStats): string {
  return `task ${taskNumber} heartbeat (elapsed: ${stats.elapsedSeconds}s, events: ${stats.eventCount}, tokens: ${formatTokens(stats.totalTokens)})`;
}
