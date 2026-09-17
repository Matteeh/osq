import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from './config.js';
import { parseFrontmatter } from './parser.js';

export interface SpecMetrics {
  total: number;
  active: number;
  archived: number;
}

export interface TaskMetrics {
  total: number;
  done: number;
  dead: number;
  running: number;
  pending: number;
}

export interface DurationMetrics {
  totalMs: number;
  totalSeconds: number;
  avgMs: number;
  avgSeconds: number;
  formattedTotal: string;
  formattedAvg: string;
}

export interface TokenMetrics {
  promptTokens: number;
  candidateTokens: number;
  totalTokens: number;
  prompt: number;
  candidate: number;
  total: number;
}

export interface FileChangeMetrics {
  totalEvents: number;
  totalChanges: number;
  uniqueFiles: string[];
  uniqueCount: number;
}

export interface MetricsReport {
  specs: SpecMetrics;
  tasks: TaskMetrics;
  totalSpecs: number;
  activeSpecs: number;
  archivedSpecs: number;
  totalTasks: number;
  doneTasks: number;
  deadTasks: number;
  runningTasks: number;
  pendingTasks: number;
  completionRate: number;
  completionPercentage: number;
  completionRatio: number;
  deadBreakdown: Record<string, number>;
  failureBreakdown: Record<string, number>;
  durations: DurationMetrics;
  tokens: TokenMetrics;
  fileChanges: FileChangeMetrics;
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return '0s';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export async function getMetricsReport(
  projectRoot: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<MetricsReport> {
  const specsDir = path.join(projectRoot, config.paths.specs);
  const archiveDir = path.join(projectRoot, config.paths.archive);

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
  const deadBreakdown: Record<string, number> = {};

  let totalDurationMs = 0;
  let tasksWithDurationCount = 0;
  let totalPromptTokens = 0;
  let totalCandidateTokens = 0;
  let totalTokens = 0;
  let totalFileChanges = 0;
  const uniqueFiles = new Set<string>();

  for (const folderPath of allSpecFolders) {
    const runDir = path.join(folderPath, '.run');
    const tasksDir = path.join(folderPath, 'tasks');

    let taskFiles: string[] = [];
    try {
      taskFiles = (await fs.readdir(tasksDir)).filter((e) => e.endsWith('.md'));
    } catch {
      taskFiles = [];
    }

    totalTasks += taskFiles.length;

    for (const taskFile of taskFiles) {
      const taskNumber = taskFile.replace(/\.md$/, '');
      const donePath = path.join(runDir, 'done', taskNumber);
      const isDone = await fs
        .stat(donePath)
        .then(() => true)
        .catch(() => false);

      if (isDone) {
        doneTasks++;
      } else {
        const deadPath = path.join(runDir, 'dead', `${taskNumber}.md`);
        const deadContent = await fs.readFile(deadPath, 'utf8').catch(() => null);
        if (deadContent !== null) {
          deadTasks++;
          const { data } = parseFrontmatter(deadContent);
          const reason =
            typeof data.reason === 'string' && data.reason.trim() ? data.reason.trim() : 'unknown';
          deadBreakdown[reason] = (deadBreakdown[reason] || 0) + 1;
        } else {
          const runningPath = path.join(runDir, 'running', `${taskNumber}.pid`);
          const isRunning = await fs
            .stat(runningPath)
            .then(() => true)
            .catch(() => false);
          if (isRunning) {
            runningTasks++;
          } else {
            pendingTasks++;
          }
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
            const prompt = Number(event.data.promptTokens ?? event.data.prompt ?? 0) || 0;
            const candidate =
              Number(
                event.data.candidateTokens ??
                  event.data.candidate ??
                  event.data.completionTokens ??
                  0,
              ) || 0;
            const total =
              Number(event.data.totalTokens ?? event.data.total ?? prompt + candidate) || 0;

            totalPromptTokens += prompt;
            totalCandidateTokens += candidate;
            totalTokens += total;
          }

          if (event.type === 'file_changed' && event.data) {
            totalFileChanges++;
            if (typeof event.data.file === 'string') {
              uniqueFiles.add(event.data.file);
            } else if (typeof event.data.path === 'string') {
              uniqueFiles.add(event.data.path);
            } else if (typeof event.data.filePath === 'string') {
              uniqueFiles.add(event.data.filePath);
            } else if (typeof event.data.filename === 'string') {
              uniqueFiles.add(event.data.filename);
            } else if (Array.isArray(event.data.files)) {
              for (const f of event.data.files) {
                if (typeof f === 'string') uniqueFiles.add(f);
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
  }

  const activeSpecs = activeFolders.length;
  const archivedSpecs = archivedFolders.length;
  const totalSpecs = activeSpecs + archivedSpecs;

  const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 10000) / 100 : 0;
  const completionPercentage = completionRate;
  const completionRatio = totalTasks > 0 ? doneTasks / totalTasks : 0;

  const avgDurationMs =
    tasksWithDurationCount > 0 ? Math.round(totalDurationMs / tasksWithDurationCount) : 0;
  const totalSeconds = Math.round(totalDurationMs / 1000);
  const avgSeconds = Math.round(avgDurationMs / 1000);

  const formattedTotal = formatDuration(totalDurationMs);
  const formattedAvg = formatDuration(avgDurationMs);

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
    totalSpecs,
    activeSpecs,
    archivedSpecs,
    totalTasks,
    doneTasks,
    deadTasks,
    runningTasks,
    pendingTasks,
    completionRate,
    completionPercentage,
    completionRatio,
    deadBreakdown,
    failureBreakdown: deadBreakdown,
    durations: {
      totalMs: totalDurationMs,
      totalSeconds,
      avgMs: avgDurationMs,
      avgSeconds,
      formattedTotal,
      formattedAvg,
    },
    tokens: {
      promptTokens: totalPromptTokens,
      candidateTokens: totalCandidateTokens,
      totalTokens,
      prompt: totalPromptTokens,
      candidate: totalCandidateTokens,
      total: totalTokens,
    },
    fileChanges: {
      totalEvents: totalFileChanges,
      totalChanges: totalFileChanges,
      uniqueFiles: Array.from(uniqueFiles).sort(),
      uniqueCount: uniqueFiles.size,
    },
  };
}

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
  const failureEntries = Object.entries(report.deadBreakdown);
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
  lines.push(`  Prompt tokens: ${report.tokens.promptTokens}`);
  lines.push(`  Candidate tokens: ${report.tokens.candidateTokens}`);
  lines.push(`  Total tokens: ${report.tokens.totalTokens}`);

  lines.push('');
  lines.push('File Changes:');
  lines.push(`  Total change events: ${report.fileChanges.totalChanges}`);
  lines.push(`  Unique files modified: ${report.fileChanges.uniqueCount}`);

  return lines.join('\n');
}
