import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from './config.js';
import { getArchiveDir, getChangesDir } from './layout.js';
import { parseFrontmatter } from './parser.js';
import { compareNumericPrefix, deriveSpecState } from './state.js';

export interface SpecMetrics {
  readonly total: number;
  readonly active: number;
  readonly archived: number;
}

export interface TaskMetrics {
  readonly total: number;
  readonly done: number;
  readonly dead: number;
  readonly running: number;
  readonly pending: number;
}

export interface DurationMetrics {
  readonly totalMs: number;
  readonly totalSeconds: number;
  readonly avgMs: number;
  readonly avgSeconds: number;
  readonly formattedTotal: string;
  readonly formattedAvg: string;
}

export interface TokenMetrics {
  readonly input: number;
  readonly cached_input: number;
  readonly output: number;
  readonly reasoning: number;
  readonly total: number;
  readonly cacheSharePercent: number;
}

export interface FileChangeMetrics {
  readonly totalChanges: number;
  readonly uniqueCount: number;
  readonly uniqueFiles: readonly string[];
}

export interface CostMetrics {
  readonly total: number;
  readonly perSpec: Record<string, number>;
  readonly formattedTotal: string;
}

export interface MetricsReport {
  readonly completionRate: number;
  readonly cost?: CostMetrics;
  readonly durations: DurationMetrics;
  readonly failureBreakdown: Record<string, number>;
  readonly fileChanges: FileChangeMetrics;
  readonly specs: SpecMetrics;
  readonly tasks: TaskMetrics;
  readonly tokens: TokenMetrics;
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return '0s';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export function formatCost(total: number): string {
  const fixed = total >= 0.01 ? total.toFixed(2) : total.toFixed(4);
  return `$${fixed}`;
}

const FILE_CHANGE_TOOLS = new Set(['edit', 'write']);

/**
 * Trims surrounding whitespace and strips a leading `./` so paths written by
 * different harnesses collapse to a single canonical form before deduplication.
 */
function normalizeFilePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/^(?:\.\/)+/, '');
  return cleaned || null;
}

/**
 * Extracts a file path from a tool or file_changed event payload. The summary
 * field carries the target path for file tools such as edit and write.
 */
function extractFilePath(data: Record<string, unknown>): string | null {
  for (const candidate of [data.summary, data.path, data.filePath, data.file, data.filename]) {
    const filePath = normalizeFilePath(candidate);
    if (filePath !== null) return filePath;
  }
  return null;
}

interface ArchivedTerminalEvent {
  status: 'done' | 'dead';
  reason?: string;
}

async function readArchivedTerminalEvents(
  specFolderPath: string,
): Promise<Map<string, ArchivedTerminalEvent>> {
  const terminalEvents = new Map<string, ArchivedTerminalEvent>();
  const eventsDir = path.join(specFolderPath, '.run', 'events');

  let eventFiles: string[] = [];
  try {
    eventFiles = (await fs.readdir(eventsDir))
      .filter((e) => e.endsWith('.jsonl'))
      .sort(compareNumericPrefix);
  } catch {
    return terminalEvents;
  }

  for (const eventFile of eventFiles) {
    const fallbackTask = eventFile.replace(/\.jsonl$/, '');
    const content = await fs.readFile(path.join(eventsDir, eventFile), 'utf8').catch(() => '');
    if (!content) continue;

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed);
        if (event.type !== 'done' && event.type !== 'dead') continue;
        const task =
          typeof event.data?.task === 'string' && event.data.task ? event.data.task : fallbackTask;
        const reason =
          typeof event.data?.reason === 'string' && event.data.reason.trim()
            ? event.data.reason
            : undefined;
        terminalEvents.set(task, { status: event.type, reason });
      } catch {}
    }
  }

  return terminalEvents;
}

export async function getMetricsReport(
  projectRoot: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<MetricsReport> {
  let specsDir = getChangesDir(config.paths.openspecRoot, projectRoot);
  let archiveDir = getArchiveDir(config.paths.openspecRoot, projectRoot);

  const specsDirStat = await fs.stat(specsDir).catch(() => null);
  const archiveDirStat = await fs.stat(archiveDir).catch(() => null);

  if (!specsDirStat && !archiveDirStat) {
    const legacySpecs = path.join(projectRoot, 'specs');
    const legacyArchive = path.join(projectRoot, 'specs', 'archive');
    const legacySpecsStat = await fs.stat(legacySpecs).catch(() => null);
    const legacyArchiveStat = await fs.stat(legacyArchive).catch(() => null);
    if (legacySpecsStat || legacyArchiveStat) {
      specsDir = legacySpecs;
      archiveDir = legacyArchive;
    }
  }

  // 1. Identify active specs
  let activeEntries: string[] = [];
  try {
    activeEntries = await fs.readdir(specsDir);
  } catch {
    activeEntries = [];
  }

  const archiveRel = path.relative(specsDir, archiveDir);
  const archiveFolder =
    !archiveRel.startsWith('..') && !path.isAbsolute(archiveRel)
      ? archiveRel.split(path.sep)[0]
      : 'archive';

  const candidateActive = activeEntries.filter(
    (e) => !e.startsWith('_') && !e.startsWith('.') && e !== archiveFolder,
  );

  const activeFolders: string[] = [];
  for (const folder of candidateActive) {
    const fullPath = path.join(specsDir, folder);
    const stat = await fs.stat(fullPath).catch(() => null);
    if (stat?.isDirectory()) {
      activeFolders.push(fullPath);
    }
  }

  // 2. Identify archived specs
  let archiveEntries: string[] = [];
  try {
    archiveEntries = await fs.readdir(archiveDir);
  } catch {
    archiveEntries = [];
  }

  const candidateArchived = archiveEntries.filter((e) => !e.startsWith('_') && !e.startsWith('.'));

  const archivedFolders: string[] = [];
  for (const folder of candidateArchived) {
    const fullPath = path.join(archiveDir, folder);
    const stat = await fs.stat(fullPath).catch(() => null);
    if (stat?.isDirectory()) {
      archivedFolders.push(fullPath);
    }
  }

  const allSpecFolders = [...activeFolders, ...archivedFolders];

  let totalTasks = 0;
  let doneTasks = 0;
  let deadTasks = 0;
  let runningTasks = 0;
  let pendingTasks = 0;
  const failureBreakdown: Record<string, number> = {};

  let totalDurationMs = 0;
  let tasksWithDurationCount = 0;
  let totalInput = 0;
  let totalCachedInput = 0;
  let totalOutput = 0;
  let totalReasoning = 0;
  let totalTokens = 0;
  let totalFileChanges = 0;
  const uniqueFiles = new Set<string>();
  let totalCost = 0;
  const perSpecCost: Record<string, number> = {};

  const archivedSet = new Set(archivedFolders);

  for (const folderPath of allSpecFolders) {
    const runDir = path.join(folderPath, '.run');
    const tasksDir = path.join(folderPath, 'tasks');

    let taskFiles: string[] = [];
    try {
      taskFiles = (await fs.readdir(tasksDir))
        .filter((e) => e.endsWith('.md'))
        .sort(compareNumericPrefix);
    } catch {
      taskFiles = [];
    }

    totalTasks += taskFiles.length;

    if (archivedSet.has(folderPath)) {
      // Archived specs are complete. Their task states come from terminal
      // done/dead events when present, then marker files, and finally fall
      // back to done because an archived spec never reports pending work.
      const terminalEvents = await readArchivedTerminalEvents(folderPath);

      for (const taskFile of taskFiles) {
        const taskNumber = taskFile.replace(/\.md$/, '');
        const terminal = terminalEvents.get(taskNumber);

        if (terminal) {
          if (terminal.status === 'done') {
            doneTasks++;
          } else {
            deadTasks++;
          }
          continue;
        }

        const donePath = path.join(runDir, 'done', taskNumber);
        const isDone = await fs
          .stat(donePath)
          .then(() => true)
          .catch(() => false);
        if (isDone) {
          doneTasks++;
          continue;
        }

        const deadPath = path.join(runDir, 'dead', `${taskNumber}.md`);
        const deadContent = await fs.readFile(deadPath, 'utf8').catch(() => null);
        if (deadContent !== null) {
          deadTasks++;
          continue;
        }

        doneTasks++;
      }
    } else {
      const specState = await deriveSpecState(projectRoot, folderPath);
      for (const task of specState.tasks) {
        switch (task.status) {
          case 'done':
            doneTasks++;
            break;
          case 'dead':
            deadTasks++;
            break;
          case 'running':
            runningTasks++;
            break;
          case 'pending':
            pendingTasks++;
            break;
        }
      }
    }

    // Process events in .run/events/
    const eventsDir = path.join(runDir, 'events');
    let eventFiles: string[] = [];
    try {
      eventFiles = (await fs.readdir(eventsDir)).filter((e) => e.endsWith('.jsonl'));
    } catch {
      eventFiles = [];
    }

    let specHasDeadEvents = false;

    for (const eventFile of eventFiles) {
      const eventFilePath = path.join(eventsDir, eventFile);
      const fileContent = await fs.readFile(eventFilePath, 'utf8').catch(() => '');
      if (!fileContent) continue;

      const lines = fileContent.split('\n');
      let startedTime: number | null = null;
      let exitedTime: number | null = null;
      let minTime: number | null = null;
      let maxTime: number | null = null;
      let hasEvents = false;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed);
          hasEvents = true;
          const ts = event.timestamp ? new Date(event.timestamp).getTime() : Number.NaN;
          if (!Number.isNaN(ts)) {
            if (minTime === null || ts < minTime) minTime = ts;
            if (maxTime === null || ts > maxTime) maxTime = ts;
            if (event.type === 'started' && startedTime === null) {
              startedTime = ts;
            }
            if (event.type === 'exited') {
              exitedTime = ts;
            }
          }

          if (event.type === 'tokens' && event.data) {
            const data = event.data;
            const input =
              Number(data.input ?? data.input_tokens ?? data.promptTokens ?? data.prompt ?? 0) || 0;
            const output =
              Number(
                data.output ??
                  data.output_tokens ??
                  data.candidateTokens ??
                  data.candidate ??
                  data.completionTokens ??
                  0,
              ) || 0;
            const reasoning =
              Number(data.reasoningTokens ?? data.reasoning ?? data.thinking_tokens ?? 0) || 0;

            const cacheValue =
              typeof data.cache === 'number'
                ? data.cache
                : typeof data.cache === 'object' &&
                    data.cache !== null &&
                    !Array.isArray(data.cache)
                  ? (data.cache as Record<string, unknown>).read
                  : undefined;
            const reportedCachedInput =
              Number(
                data.cached_input ?? data.cachedTokens ?? data.cache_read_tokens ?? cacheValue ?? 0,
              ) || 0;
            const hasReportedCache =
              data.cachedTokens !== undefined ||
              data.cached_input !== undefined ||
              data.cache_read_tokens !== undefined ||
              cacheValue !== undefined;

            const rawTotal = data.total ?? data.totalTokens;
            const hasReportedTotal = rawTotal !== undefined && rawTotal !== null;
            const reportedTotal = Number(rawTotal) || 0;

            // A harness-reported cache counter is authoritative. The remainder
            // formula (total minus input, output, and reasoning) is a fallback
            // used strictly when the event carries no cache field at all.
            const cachedInput = hasReportedCache
              ? reportedCachedInput
              : hasReportedTotal
                ? Math.max(0, reportedTotal - input - output - reasoning)
                : 0;
            const total = hasReportedTotal
              ? reportedTotal
              : input + cachedInput + output + reasoning;

            totalInput += input;
            totalCachedInput += cachedInput;
            totalOutput += output;
            totalReasoning += reasoning;
            totalTokens += total;
          }

          if (
            event.data &&
            typeof event.data.cost === 'number' &&
            Number.isFinite(event.data.cost)
          ) {
            const reportedCost = event.data.cost;
            totalCost += reportedCost;
            const specKey = path.basename(folderPath);
            perSpecCost[specKey] = (perSpecCost[specKey] ?? 0) + reportedCost;
          }

          if (event.type === 'dead') {
            specHasDeadEvents = true;
            const reason =
              typeof event.data?.reason === 'string' && event.data.reason.trim()
                ? event.data.reason.trim()
                : 'unknown';
            failureBreakdown[reason] = (failureBreakdown[reason] || 0) + 1;
          }

          if (event.type === 'tool' && event.data) {
            const tool = event.data.tool;
            if (typeof tool === 'string' && FILE_CHANGE_TOOLS.has(tool.toLowerCase())) {
              totalFileChanges++;
              const filePath = extractFilePath(event.data);
              if (filePath !== null) uniqueFiles.add(filePath);
            }
          }

          if (event.type === 'file_changed' && event.data) {
            totalFileChanges++;
            const filePath = extractFilePath(event.data);
            if (filePath !== null) uniqueFiles.add(filePath);
            if (Array.isArray(event.data.files)) {
              for (const f of event.data.files) {
                const normalized = normalizeFilePath(f);
                if (normalized !== null) uniqueFiles.add(normalized);
              }
            }
          }
        } catch {}
      }

      if (hasEvents) {
        let taskDuration = 0;
        if (startedTime !== null && exitedTime !== null && exitedTime >= startedTime) {
          taskDuration = exitedTime - startedTime;
        } else if (minTime !== null && maxTime !== null && maxTime > minTime) {
          taskDuration = maxTime - minTime;
        }

        if (taskDuration > 0) {
          totalDurationMs += taskDuration;
          tasksWithDurationCount++;
        }
      }
    }

    // Legacy specs without any dead event in the append-only stream fall back
    // to the current dead markers so historical reasons are still reported.
    if (!specHasDeadEvents) {
      const deadDir = path.join(runDir, 'dead');
      let deadFiles: string[] = [];
      try {
        deadFiles = await fs.readdir(deadDir);
      } catch {
        deadFiles = [];
      }

      for (const deadFile of deadFiles) {
        if (!deadFile.endsWith('.md')) continue;
        const deadContent = await fs.readFile(path.join(deadDir, deadFile), 'utf8').catch(() => '');
        if (!deadContent) continue;
        const { data } = parseFrontmatter(deadContent);
        const reason =
          typeof data.reason === 'string' && data.reason.trim() ? data.reason.trim() : 'unknown';
        failureBreakdown[reason] = (failureBreakdown[reason] || 0) + 1;
      }
    }
  }

  const activeSpecs = activeFolders.length;
  const archivedSpecs = archivedFolders.length;
  const totalSpecs = activeSpecs + archivedSpecs;

  const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 10000) / 100 : 0;

  const avgDurationMs =
    tasksWithDurationCount > 0 ? Math.round(totalDurationMs / tasksWithDurationCount) : 0;
  const totalSeconds = Math.round(totalDurationMs / 1000);
  const avgSeconds = Math.round(avgDurationMs / 1000);

  const formattedTotal = formatDuration(totalDurationMs);
  const formattedAvg = formatDuration(avgDurationMs);

  const cost: CostMetrics | undefined =
    totalCost > 0
      ? {
          total: totalCost,
          perSpec: Object.fromEntries(
            Object.entries(perSpecCost)
              .filter(([, value]) => value > 0)
              .sort(([a], [b]) => a.localeCompare(b)),
          ),
          formattedTotal: formatCost(totalCost),
        }
      : undefined;

  return {
    specs: {
      total: totalSpecs,
      active: activeSpecs,
      archived: archivedSpecs,
    },
    tasks: {
      total: totalTasks,
      done: doneTasks,
      dead: deadTasks,
      running: runningTasks,
      pending: pendingTasks,
    },
    completionRate,
    failureBreakdown,
    durations: {
      totalMs: totalDurationMs,
      totalSeconds,
      avgMs: avgDurationMs,
      avgSeconds,
      formattedTotal,
      formattedAvg,
    },
    tokens: {
      input: totalInput,
      cached_input: totalCachedInput,
      output: totalOutput,
      reasoning: totalReasoning,
      total: totalTokens,
      cacheSharePercent:
        totalInput + totalCachedInput > 0
          ? Math.round((totalCachedInput / (totalInput + totalCachedInput)) * 1000) / 10
          : 0,
    },
    ...(cost ? { cost } : {}),
    fileChanges: {
      totalChanges: totalFileChanges,
      uniqueFiles: Array.from(uniqueFiles).sort(),
      uniqueCount: uniqueFiles.size,
    },
  };
}

/**
 * Alias for {@link getMetricsReport} matching the report-generation name used
 * by the metrics-and-reporting spec. Aggregates failure reasons (including
 * `undeclared_test_change`) into the failure breakdown.
 */
export const generateReport = getMetricsReport;

export function formatMetricsReport(report: MetricsReport): string {
  const lines: string[] = [];

  lines.push('osq Delivery Metrics Report');
  lines.push('');
  lines.push('Specs Summary:');
  lines.push(
    `  Total specs: ${report.specs.total} (${report.specs.active} active, ${report.specs.archived} archived)`,
  );

  lines.push('');
  lines.push('Tasks & Completion:');
  lines.push(`  Total tasks: ${report.tasks.total}`);
  lines.push(`  Done: ${report.tasks.done}`);
  lines.push(`  Dead: ${report.tasks.dead}`);
  lines.push(`  Running: ${report.tasks.running}`);
  lines.push(`  Pending: ${report.tasks.pending}`);
  lines.push(`  Completion rate: ${report.completionRate}%`);

  lines.push('');
  lines.push('Failure Breakdown:');
  const failureEntries = Object.entries(report.failureBreakdown).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  if (failureEntries.length === 0) {
    lines.push('  (no failures)');
  } else {
    for (const [reason, count] of failureEntries) {
      lines.push(`  ${reason}: ${count}`);
    }
  }

  lines.push('');
  lines.push('Execution Durations:');
  lines.push(`  Total duration: ${report.durations.formattedTotal}`);
  lines.push(`  Average duration: ${report.durations.formattedAvg}`);

  lines.push('');
  lines.push('Token Usage:');
  lines.push(`  Input: ${report.tokens.input}`);
  lines.push(
    `  Cached input: ${report.tokens.cached_input} (${report.tokens.cacheSharePercent}% cache share)`,
  );
  lines.push(`  Output: ${report.tokens.output}`);
  lines.push(`  Reasoning: ${report.tokens.reasoning}`);
  lines.push(`  Total tokens: ${report.tokens.total}`);

  if (report.cost && report.cost.total > 0) {
    lines.push('');
    lines.push('Cost:');
    lines.push(`  Reported cost: ${report.cost.formattedTotal}`);
  }

  lines.push('');
  lines.push('File Changes:');
  lines.push(`  Total change events: ${report.fileChanges.totalChanges}`);
  lines.push(`  Unique files modified: ${report.fileChanges.uniqueCount}`);

  return lines.join('\n');
}
