import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from './config.js';
import { getArchiveDir, getChangesDir, getRejectedDir } from './layout.js';
import { parseFrontmatter } from './parser.js';
import { readPlanningSessions } from './planning.js';
import { type QueueReport, readQueueReport } from './queue-report.js';
import { type TaskStatus, compareNumericPrefix, deriveSpecState } from './state.js';

export interface SpecMetrics {
  readonly total: number;
  readonly active: number;
  readonly archived: number;
}

/**
 * Current task state derived exclusively from marker files. Verified and
 * manual are always present, including when zero, so consumers never have to
 * infer their absence.
 */
export interface NowMetrics {
  readonly total: number;
  readonly done: number;
  readonly verified: number;
  readonly manual: number;
  readonly dead: number;
  readonly regressed: number;
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

export interface AttemptMetrics {
  readonly total: number;
  readonly byTask: Record<string, number>;
  readonly multipleAttempts: readonly string[];
}

export interface UnexplainedReruns {
  readonly total: number;
  readonly byTask: Record<string, number>;
}

export interface VerifyRunMetrics {
  readonly total: number;
  readonly missingExitCode: number;
  readonly byTask: Record<string, readonly (number | null)[]>;
}

/**
 * Historical cost derived only from finite cost values on task events. The
 * total is never estimated; coverage states how many attempts reported cost
 * out of every recorded attempt.
 */
export interface CostHistory {
  readonly total: number;
  readonly perSpec: Record<string, number>;
  readonly formattedTotal: string;
  readonly provenance: 'harness-reported';
  readonly coverage: {
    readonly reportedAttempts: number;
    readonly totalAttempts: number;
  };
}

/** Execution history derived exclusively from append-only task event files. */
export interface HistoryMetrics {
  readonly attempts: AttemptMetrics;
  readonly deadByReason: Record<string, number>;
  readonly unexplainedReruns: UnexplainedReruns;
  readonly verifyRuns: VerifyRunMetrics;
  readonly cost: CostHistory;
  readonly rejections: RejectionHistory;
}

/**
 * Rejected-change history. A folder contributes at most once, and only when its
 * change-level event stream contains a valid `rejected` event; planner grouping
 * comes solely from `brief.md` frontmatter.
 */
export interface RejectionHistory {
  readonly total: number;
  readonly byPlannerModel: Record<string, number>;
}

export interface CoverageByChange {
  readonly withEvents: readonly string[];
  readonly withoutEvents: readonly string[];
}

/** Event-file coverage for every discovered task. */
export interface CoverageMetrics {
  readonly withEvents: number;
  readonly withoutEvents: number;
  readonly byChange: Record<string, CoverageByChange>;
}

export interface MetricsReport {
  readonly completionRate: number;
  readonly coverage: CoverageMetrics;
  readonly cycle: CycleMetrics;
  readonly durations: DurationMetrics;
  readonly fileChanges: FileChangeMetrics;
  readonly history: HistoryMetrics;
  readonly now: NowMetrics;
  readonly planning: PlanningMetrics;
  readonly queue: QueueReport;
  readonly specs: SpecMetrics;
  readonly tokens: TokenMetrics;
}

/** Aggregate planning usage derived only from `.run/plan.jsonl` lifecycle pairs. */
export interface PlanningMetrics {
  readonly sessions: number;
  readonly wallSeconds: number;
  readonly wallSecondsByChange: Record<string, number>;
  readonly tokens: {
    readonly input: number;
    readonly output: number;
    readonly cached: number;
    readonly reasoning: number;
  };
  readonly cost: {
    readonly total: number;
    readonly formattedTotal: string;
    readonly provenance: 'harness-reported';
  };
  readonly coverage: {
    readonly reportedSessions: number;
    readonly totalSessions: number;
  };
}

/** One aggregate over archived changes for a single lifecycle phase. */
export interface CyclePhaseMetrics {
  readonly totalSeconds: number;
  readonly averageSeconds: number;
  readonly coveredChanges: number;
  readonly totalChanges: number;
}

/** Nullable lifecycle durations for one archived change. */
export interface CycleChangeMetrics {
  readonly change: string;
  readonly briefToApprovalSeconds: number | null;
  readonly approvalToFirstTaskSeconds: number | null;
  readonly firstTaskToArchiveSeconds: number | null;
  readonly totalSeconds: number | null;
}

/** Archived change cycle time, with aggregate phase lines and per-change rows. */
export interface CycleMetrics {
  readonly phases: {
    readonly briefToApproval: CyclePhaseMetrics;
    readonly approvalToFirstTask: CyclePhaseMetrics;
    readonly firstTaskToArchive: CyclePhaseMetrics;
    readonly total: CyclePhaseMetrics;
  };
  readonly byChange: readonly CycleChangeMetrics[];
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

/** A done marker declares manual completion when its frontmatter has `manual: true`. */
async function doneMarkerIsManual(markerPath: string): Promise<boolean> {
  const content = await fs.readFile(markerPath, 'utf8').catch(() => null);
  if (content === null) return false;
  return parseFrontmatter(content).data.manual === true;
}

async function fileExists(filePath: string): Promise<boolean> {
  return fs
    .stat(filePath)
    .then(() => true)
    .catch(() => false);
}

/** Every task discovered across active and archived changes, with a stable identity. */
interface DiscoveredTask {
  readonly changeId: string;
  readonly taskNumber: string;
  readonly id: string;
  readonly folderPath: string;
  readonly eventFilePath: string;
  readonly status: TaskStatus;
}

/** Parse one append-only jsonl stream, skipping blank and malformed lines defensively. */
function parseEventLines(content: string): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        events.push(parsed as Record<string, unknown>);
      }
    } catch {}
  }
  return events;
}

function asData(event: Record<string, unknown>): Record<string, unknown> | null {
  const data = event.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return null;
}

/** Parses a `brief.md` frontmatter `date` value into epoch milliseconds. */
function parseBriefDateMs(data: Record<string, unknown>): number | null {
  const value = data.date;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : null;
}

/** Brief frontmatter date in milliseconds, or null when missing or invalid. */
async function readBriefDateMs(folderPath: string): Promise<number | null> {
  const content = await fs.readFile(path.join(folderPath, 'brief.md'), 'utf8').catch(() => null);
  if (content === null) return null;
  return parseBriefDateMs(parseFrontmatter(content).data);
}

/** Manifest `approvedAt` in milliseconds, or null when missing or invalid. */
async function readApprovedAtMs(folderPath: string): Promise<number | null> {
  const content = await fs
    .readFile(path.join(folderPath, '.run', 'manifest.json'), 'utf8')
    .catch(() => null);
  if (content === null) return null;
  try {
    const parsed = JSON.parse(content) as { approvedAt?: unknown };
    if (typeof parsed.approvedAt !== 'string') return null;
    const ms = Date.parse(parsed.approvedAt);
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

/**
 * Earliest `started` event timestamp across numeric `<n>.jsonl` task streams.
 * The change-level `change.jsonl` is never a task stream.
 */
async function readFirstTaskStartMs(folderPath: string): Promise<number | null> {
  const eventsDir = path.join(folderPath, '.run', 'events');
  let entries: string[] = [];
  try {
    entries = (await fs.readdir(eventsDir)).filter((entry) => /^\d+\.jsonl$/.test(entry));
  } catch {
    return null;
  }

  let earliest: number | null = null;
  for (const entry of entries) {
    const content = await fs.readFile(path.join(eventsDir, entry), 'utf8').catch(() => '');
    for (const event of parseEventLines(content)) {
      if (event.type !== 'started' || typeof event.timestamp !== 'string') continue;
      const ms = Date.parse(event.timestamp);
      if (!Number.isFinite(ms)) continue;
      if (earliest === null || ms < earliest) earliest = ms;
    }
  }
  return earliest;
}

/** Authoritative archive time from a `change.jsonl` `archived` event, if any. */
async function readArchivedAtMs(folderPath: string): Promise<number | null> {
  const content = await fs
    .readFile(path.join(folderPath, '.run', 'events', 'change.jsonl'), 'utf8')
    .catch(() => null);
  if (content === null) return null;
  for (const event of parseEventLines(content)) {
    if (event.type !== 'archived' || typeof event.timestamp !== 'string') continue;
    const ms = Date.parse(event.timestamp);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

/** Non-negative rounded seconds between two endpoints, or null when invalid. */
function phaseSeconds(startMs: number | null, endMs: number | null): number | null {
  if (startMs === null || endMs === null) return null;
  const delta = endMs - startMs;
  if (delta < 0) return null;
  return Math.round(delta / 1000);
}

/** True when a change-level stream contains at least one valid `rejected` event. */
async function hasRejectedEvent(folderPath: string): Promise<boolean> {
  const content = await fs
    .readFile(path.join(folderPath, '.run', 'events', 'change.jsonl'), 'utf8')
    .catch(() => null);
  if (content === null) return false;
  return parseEventLines(content).some((event) => event.type === 'rejected');
}

/** Non-empty `planner` value from `brief.md` frontmatter, else `unknown`. */
async function readPlannerModel(folderPath: string): Promise<string> {
  const content = await fs.readFile(path.join(folderPath, 'brief.md'), 'utf8').catch(() => null);
  if (content === null) return 'unknown';
  const value = parseFrontmatter(content).data.planner;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return 'unknown';
}

/** Rejected change folders, sorted deterministically by numeric prefix. */
async function listRejectedFolders(rejectedDir: string): Promise<string[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(rejectedDir);
  } catch {
    return [];
  }
  const folders: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith('.') || entry.startsWith('_')) continue;
    const fullPath = path.join(rejectedDir, entry);
    const stat = await fs.stat(fullPath).catch(() => null);
    if (stat?.isDirectory()) folders.push(fullPath);
  }
  return folders.sort((a, b) => compareNumericPrefix(path.basename(a), path.basename(b)));
}

type CyclePhaseKey =
  | 'briefToApprovalSeconds'
  | 'approvalToFirstTaskSeconds'
  | 'firstTaskToArchiveSeconds'
  | 'totalSeconds';

/** Total, average, and coverage over the rows that report a finite phase. */
function aggregatePhase(
  rows: readonly CycleChangeMetrics[],
  key: CyclePhaseKey,
): CyclePhaseMetrics {
  let totalSeconds = 0;
  let coveredChanges = 0;
  for (const row of rows) {
    const value = row[key];
    if (value !== null) {
      totalSeconds += value;
      coveredChanges++;
    }
  }
  return {
    totalSeconds,
    averageSeconds: coveredChanges > 0 ? Math.round(totalSeconds / coveredChanges) : 0,
    coveredChanges,
    totalChanges: rows.length,
  };
}

export async function getMetricsReport(
  projectRoot: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<MetricsReport> {
  let specsDir = getChangesDir(config.paths.openspecRoot, projectRoot);
  let archiveDir = getArchiveDir(config.paths.openspecRoot, projectRoot);
  let rejectedDir = getRejectedDir(config.paths.openspecRoot, projectRoot);

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
      rejectedDir = path.join(legacySpecs, 'rejected');
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
  const rejectedRel = path.relative(specsDir, rejectedDir);
  const rejectedFolder =
    !rejectedRel.startsWith('..') && !path.isAbsolute(rejectedRel)
      ? rejectedRel.split(path.sep)[0]
      : 'rejected';

  const candidateActive = activeEntries.filter(
    (e) => !e.startsWith('_') && !e.startsWith('.') && e !== archiveFolder && e !== rejectedFolder,
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

  // Rejected history is discovered separately from the active and archive
  // scans, so preserved tasks, planning logs, and events never leak into any
  // other aggregate. A folder counts once, only with a valid `rejected` event.
  let rejectionTotal = 0;
  const rejectionsByPlanner: Record<string, number> = {};
  for (const folderPath of await listRejectedFolders(rejectedDir)) {
    if (!(await hasRejectedEvent(folderPath))) continue;
    rejectionTotal++;
    const model = await readPlannerModel(folderPath);
    rejectionsByPlanner[model] = (rejectionsByPlanner[model] ?? 0) + 1;
  }
  const rejectionsByPlannerModel = Object.fromEntries(
    Object.entries(rejectionsByPlanner).sort(([a], [b]) => a.localeCompare(b)),
  );

  // 3. Shared task discovery. Both the marker and event views iterate this same
  // set, so current state and history can never disagree about which tasks exist.
  const discoveredTasks: DiscoveredTask[] = [];
  for (const folderPath of allSpecFolders) {
    const changeId = path.basename(folderPath);
    const tasksDir = path.join(folderPath, 'tasks');

    let taskFiles: string[] = [];
    try {
      taskFiles = (await fs.readdir(tasksDir))
        .filter((e) => e.endsWith('.md'))
        .sort(compareNumericPrefix);
    } catch {
      taskFiles = [];
    }

    const statusByTask = new Map<string, TaskStatus>();
    try {
      const specState = await deriveSpecState(projectRoot, folderPath);
      for (const task of specState.tasks) {
        statusByTask.set(task.taskNumber, task.status);
      }
    } catch {}

    for (const taskFile of taskFiles) {
      const taskNumber = taskFile.replace(/\.md$/, '');
      discoveredTasks.push({
        changeId,
        taskNumber,
        id: `${changeId}/${taskNumber}`,
        folderPath,
        eventFilePath: path.join(folderPath, '.run', 'events', `${taskNumber}.jsonl`),
        status: statusByTask.get(taskNumber) ?? 'pending',
      });
    }
  }

  // 4. Current state: markers only.
  let doneTasks = 0;
  let verifiedTasks = 0;
  let manualTasks = 0;
  let deadTasks = 0;
  let regressedTasks = 0;
  let runningTasks = 0;
  let pendingTasks = 0;

  const manualCache = new Map<string, boolean>();
  for (const task of discoveredTasks) {
    switch (task.status) {
      case 'done': {
        doneTasks++;
        const markerPath = path.join(task.folderPath, '.run', 'done', task.taskNumber);
        let manual = manualCache.get(markerPath);
        if (manual === undefined) {
          manual = await doneMarkerIsManual(markerPath);
          manualCache.set(markerPath, manual);
        }
        if (manual) manualTasks++;
        else verifiedTasks++;
        break;
      }
      case 'dead':
        deadTasks++;
        break;
      case 'regressed':
        regressedTasks++;
        break;
      case 'running':
        runningTasks++;
        break;
      case 'pending':
        pendingTasks++;
        break;
    }
  }

  const totalTasks = discoveredTasks.length;

  // 5. History and coverage: task event files only.
  let attemptsTotal = 0;
  const attemptsByTask: Record<string, number> = {};
  const multipleAttempts: string[] = [];
  let unexplainedTotal = 0;
  const unexplainedByTask: Record<string, number> = {};
  const deadByReason: Record<string, number> = {};
  let verifyTotal = 0;
  let verifyMissingExitCode = 0;
  const verifyByTask: Record<string, (number | null)[]> = {};
  let totalCost = 0;
  const perSpecCost: Record<string, number> = {};
  let reportedCostAttempts = 0;

  let withEventsCount = 0;
  let withoutEventsCount = 0;
  const coverageByChange: Record<string, { withEvents: string[]; withoutEvents: string[] }> = {};

  for (const task of discoveredTasks) {
    if (!coverageByChange[task.changeId]) {
      coverageByChange[task.changeId] = { withEvents: [], withoutEvents: [] };
    }
    const changeCoverage = coverageByChange[task.changeId];

    const hasEventFile = await fileExists(task.eventFilePath);
    if (hasEventFile) {
      withEventsCount++;
      changeCoverage.withEvents.push(task.taskNumber);
    } else {
      withoutEventsCount++;
      changeCoverage.withoutEvents.push(task.taskNumber);
    }

    const content = hasEventFile
      ? await fs.readFile(task.eventFilePath, 'utf8').catch(() => '')
      : '';

    let taskAttempts = 0;
    let hasPriorStarted = false;
    let gapExplained = true;
    let attemptReportedCost = false;
    let taskUnexplained = 0;
    const verifyCodes: (number | null)[] = [];

    for (const event of parseEventLines(content)) {
      const data = asData(event);
      const type = event.type;

      if (type === 'started') {
        taskAttempts++;
        attemptsTotal++;
        if (hasPriorStarted && !gapExplained) {
          taskUnexplained++;
          unexplainedTotal++;
        }
        hasPriorStarted = true;
        gapExplained = false;
        attemptReportedCost = false;
      } else if (type === 'dead') {
        gapExplained = true;
        const rawReason = data?.reason;
        const reason =
          typeof rawReason === 'string' && rawReason.trim() ? rawReason.trim() : 'unknown';
        deadByReason[reason] = (deadByReason[reason] ?? 0) + 1;
      } else if (type === 'regressed') {
        gapExplained = true;
      } else if (type === 'verify_ran') {
        verifyTotal++;
        const rawExit = data?.exitCode;
        const exitCode = typeof rawExit === 'number' && Number.isFinite(rawExit) ? rawExit : null;
        if (exitCode === null) verifyMissingExitCode++;
        verifyCodes.push(exitCode);
      }

      const rawCost = data?.cost;
      if (typeof rawCost === 'number' && Number.isFinite(rawCost)) {
        totalCost += rawCost;
        perSpecCost[task.changeId] = (perSpecCost[task.changeId] ?? 0) + rawCost;
        if (hasPriorStarted && !attemptReportedCost) {
          attemptReportedCost = true;
          reportedCostAttempts++;
        }
      }
    }

    attemptsByTask[task.id] = taskAttempts;
    if (taskAttempts > 1) multipleAttempts.push(task.id);
    if (taskUnexplained > 0) unexplainedByTask[task.id] = taskUnexplained;
    if (verifyCodes.length > 0) verifyByTask[task.id] = verifyCodes;
  }

  for (const changeCoverage of Object.values(coverageByChange)) {
    changeCoverage.withEvents.sort(compareNumericPrefix);
    changeCoverage.withoutEvents.sort(compareNumericPrefix);
  }
  multipleAttempts.sort();

  // 6. Unrelated aggregate metrics still read every event stream, including
  // legacy `change.jsonl`, exactly as before. The change-level stream is
  // excluded from execution durations: since 035 it can carry archive events
  // whose span is not a task duration.
  let totalDurationMs = 0;
  let tasksWithDurationCount = 0;
  let totalInput = 0;
  let totalCachedInput = 0;
  let totalOutput = 0;
  let totalReasoning = 0;
  let totalTokens = 0;
  let totalFileChanges = 0;
  const uniqueFiles = new Set<string>();

  for (const folderPath of allSpecFolders) {
    const eventsDir = path.join(folderPath, '.run', 'events');
    let eventFiles: string[] = [];
    try {
      eventFiles = (await fs.readdir(eventsDir)).filter((e) => e.endsWith('.jsonl'));
    } catch {
      eventFiles = [];
    }

    for (const eventFile of eventFiles) {
      const isChangeStream = eventFile === 'change.jsonl';
      const eventFilePath = path.join(eventsDir, eventFile);
      const fileContent = await fs.readFile(eventFilePath, 'utf8').catch(() => '');
      if (!fileContent) continue;

      let startedTime: number | null = null;
      let exitedTime: number | null = null;
      let minTime: number | null = null;
      let maxTime: number | null = null;

      for (const event of parseEventLines(fileContent)) {
        const data = asData(event);
        const ts = event.timestamp ? new Date(String(event.timestamp)).getTime() : Number.NaN;
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

        if (event.type === 'tokens' && data) {
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
              : typeof data.cache === 'object' && data.cache !== null && !Array.isArray(data.cache)
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
          const total = hasReportedTotal ? reportedTotal : input + cachedInput + output + reasoning;

          totalInput += input;
          totalCachedInput += cachedInput;
          totalOutput += output;
          totalReasoning += reasoning;
          totalTokens += total;
        }

        if (event.type === 'tool' && data) {
          const tool = data.tool;
          if (typeof tool === 'string' && FILE_CHANGE_TOOLS.has(tool.toLowerCase())) {
            totalFileChanges++;
            const filePath = extractFilePath(data);
            if (filePath !== null) uniqueFiles.add(filePath);
          }
        }

        if (event.type === 'file_changed' && data) {
          totalFileChanges++;
          const filePath = extractFilePath(data);
          if (filePath !== null) uniqueFiles.add(filePath);
          if (Array.isArray(data.files)) {
            for (const f of data.files) {
              const normalized = normalizeFilePath(f);
              if (normalized !== null) uniqueFiles.add(normalized);
            }
          }
        }
      }

      if (!isChangeStream && (startedTime !== null || minTime !== null)) {
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

  // 7. Planning telemetry: correlated `.run/plan.jsonl` pairs across every
  // active and archived change. Only a valid start counts as a session.
  let planningSessions = 0;
  let planningWallSeconds = 0;
  const planningWallByChange: Record<string, number> = {};
  let planningInput = 0;
  let planningOutput = 0;
  let planningCached = 0;
  let planningReasoning = 0;
  let planningCost = 0;
  let planningReportedSessions = 0;

  for (const folderPath of allSpecFolders) {
    const changeId = path.basename(folderPath);
    for (const session of await readPlanningSessions(folderPath)) {
      if (!session.started) continue;
      planningSessions++;
      planningWallByChange[changeId] ??= 0;

      const exited = session.exited;
      if (!exited) continue;
      planningWallSeconds += exited.data.wallSeconds;
      planningWallByChange[changeId] += exited.data.wallSeconds;

      const usage = exited.data.usage;
      let reported = false;
      if (usage.inputTokens !== null) {
        planningInput += usage.inputTokens;
        reported = true;
      }
      if (usage.outputTokens !== null) {
        planningOutput += usage.outputTokens;
        reported = true;
      }
      if (usage.cachedTokens !== null) {
        planningCached += usage.cachedTokens;
        reported = true;
      }
      if (usage.reasoningTokens !== null) {
        planningReasoning += usage.reasoningTokens;
        reported = true;
      }
      if (usage.cost !== null) {
        planningCost += usage.cost;
        reported = true;
      }
      if (reported) planningReportedSessions++;
    }
  }

  const planningWallSecondsByChange = Object.fromEntries(
    Object.entries(planningWallByChange).sort(([a], [b]) => a.localeCompare(b)),
  );

  // 8. Archived change cycle time. Only archived folders get a row; every phase
  // is null unless both endpoints exist, parse, and are ordered correctly.
  const cycleRows: CycleChangeMetrics[] = [];
  for (const folderPath of archivedFolders) {
    const change = path.basename(folderPath);
    const briefMs = await readBriefDateMs(folderPath);
    const approvedMs = await readApprovedAtMs(folderPath);
    const firstStartMs = await readFirstTaskStartMs(folderPath);
    const archivedMs = await readArchivedAtMs(folderPath);

    const briefToApprovalSeconds = phaseSeconds(briefMs, approvedMs);
    const approvalToFirstTaskSeconds = phaseSeconds(approvedMs, firstStartMs);
    const firstTaskToArchiveSeconds = phaseSeconds(firstStartMs, archivedMs);
    const totalSeconds =
      briefToApprovalSeconds !== null &&
      approvalToFirstTaskSeconds !== null &&
      firstTaskToArchiveSeconds !== null
        ? briefToApprovalSeconds + approvalToFirstTaskSeconds + firstTaskToArchiveSeconds
        : null;

    cycleRows.push({
      change,
      briefToApprovalSeconds,
      approvalToFirstTaskSeconds,
      firstTaskToArchiveSeconds,
      totalSeconds,
    });
  }
  cycleRows.sort((a, b) => a.change.localeCompare(b.change));

  const cyclePhases = {
    briefToApproval: aggregatePhase(cycleRows, 'briefToApprovalSeconds'),
    approvalToFirstTask: aggregatePhase(cycleRows, 'approvalToFirstTaskSeconds'),
    firstTaskToArchive: aggregatePhase(cycleRows, 'firstTaskToArchiveSeconds'),
    total: aggregatePhase(cycleRows, 'totalSeconds'),
  };

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

  const queue = await readQueueReport(projectRoot, config);

  const perSpec: Record<string, number> = {};
  for (const [spec, value] of Object.entries(perSpecCost)) {
    if (value > 0) perSpec[spec] = value;
  }
  const sortedPerSpec = Object.fromEntries(
    Object.entries(perSpec).sort(([a], [b]) => a.localeCompare(b)),
  );

  return {
    specs: {
      total: totalSpecs,
      active: activeSpecs,
      archived: archivedSpecs,
    },
    now: {
      total: totalTasks,
      done: doneTasks,
      verified: verifiedTasks,
      manual: manualTasks,
      dead: deadTasks,
      regressed: regressedTasks,
      running: runningTasks,
      pending: pendingTasks,
    },
    completionRate,
    history: {
      attempts: {
        total: attemptsTotal,
        byTask: attemptsByTask,
        multipleAttempts,
      },
      deadByReason,
      unexplainedReruns: {
        total: unexplainedTotal,
        byTask: unexplainedByTask,
      },
      verifyRuns: {
        total: verifyTotal,
        missingExitCode: verifyMissingExitCode,
        byTask: verifyByTask,
      },
      cost: {
        total: totalCost,
        perSpec: sortedPerSpec,
        formattedTotal: formatCost(totalCost),
        provenance: 'harness-reported',
        coverage: {
          reportedAttempts: reportedCostAttempts,
          totalAttempts: attemptsTotal,
        },
      },
      rejections: {
        total: rejectionTotal,
        byPlannerModel: rejectionsByPlannerModel,
      },
    },
    coverage: {
      withEvents: withEventsCount,
      withoutEvents: withoutEventsCount,
      byChange: coverageByChange,
    },
    cycle: {
      phases: cyclePhases,
      byChange: cycleRows,
    },
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
    fileChanges: {
      totalChanges: totalFileChanges,
      uniqueFiles: Array.from(uniqueFiles).sort(),
      uniqueCount: uniqueFiles.size,
    },
    planning: {
      sessions: planningSessions,
      wallSeconds: planningWallSeconds,
      wallSecondsByChange: planningWallSecondsByChange,
      tokens: {
        input: planningInput,
        output: planningOutput,
        cached: planningCached,
        reasoning: planningReasoning,
      },
      cost: {
        total: planningCost,
        formattedTotal: formatCost(planningCost),
        provenance: 'harness-reported',
      },
      coverage: {
        reportedSessions: planningReportedSessions,
        totalSessions: planningSessions,
      },
    },
    queue,
  };
}

/**
 * Alias for {@link getMetricsReport} matching the report-generation name used
 * by the metrics-and-reporting spec.
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
  lines.push('Now:');
  lines.push(`  Total tasks: ${report.now.total}`);
  lines.push(`  Done: ${report.now.done}`);
  lines.push(`  Verified done: ${report.now.verified}`);
  lines.push(`  Manual done: ${report.now.manual}`);
  lines.push(`  Dead: ${report.now.dead}`);
  lines.push(`  Regressed: ${report.now.regressed}`);
  lines.push(`  Running: ${report.now.running}`);
  lines.push(`  Pending: ${report.now.pending}`);
  lines.push(`  Completion rate: ${report.completionRate}%`);

  lines.push('');
  lines.push('History:');
  lines.push(`  Total attempts: ${report.history.attempts.total}`);
  lines.push(`  Tasks with multiple attempts: ${report.history.attempts.multipleAttempts.length}`);
  lines.push(`  Unexplained re-runs: ${report.history.unexplainedReruns.total}`);
  lines.push(`  Verification runs: ${report.history.verifyRuns.total}`);
  lines.push(`  Verification runs missing exit code: ${report.history.verifyRuns.missingExitCode}`);
  lines.push(
    `  Harness-reported cost: ${report.history.cost.formattedTotal} (${report.history.cost.coverage.reportedAttempts} of ${report.history.cost.coverage.totalAttempts} attempts reported cost)`,
  );
  lines.push('  Dead by reason:');
  const deadEntries = Object.entries(report.history.deadByReason).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  if (deadEntries.length === 0) {
    lines.push('    (none)');
  } else {
    for (const [reason, count] of deadEntries) {
      lines.push(`    ${reason}: ${count}`);
    }
  }

  lines.push(`  Rejections: ${report.history.rejections.total}`);
  lines.push('  Rejections by planner model:');
  const rejectionEntries = Object.entries(report.history.rejections.byPlannerModel).sort(
    ([a], [b]) => a.localeCompare(b),
  );
  if (rejectionEntries.length === 0) {
    lines.push('    (none)');
  } else {
    for (const [model, count] of rejectionEntries) {
      lines.push(`    ${model}: ${count}`);
    }
  }

  lines.push('');
  lines.push('Coverage:');
  lines.push(`  Tasks with event files: ${report.coverage.withEvents}`);
  lines.push(`  Tasks without event files: ${report.coverage.withoutEvents}`);

  lines.push('');
  lines.push('Planning:');
  lines.push(`  Sessions: ${report.planning.sessions}`);
  lines.push(`  Total wall time: ${formatDuration(report.planning.wallSeconds * 1000)}`);
  lines.push('  Wall time by change:');
  const wallEntries = Object.entries(report.planning.wallSecondsByChange).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  if (wallEntries.length === 0) {
    lines.push('    (none)');
  } else {
    for (const [change, seconds] of wallEntries) {
      lines.push(`    ${change}: ${formatDuration(seconds * 1000)}`);
    }
  }
  lines.push(`  Input tokens: ${report.planning.tokens.input}`);
  lines.push(`  Output tokens: ${report.planning.tokens.output}`);
  lines.push(`  Cached tokens: ${report.planning.tokens.cached}`);
  lines.push(`  Reasoning tokens: ${report.planning.tokens.reasoning}`);
  lines.push(`  Harness-reported cost: ${report.planning.cost.formattedTotal}`);
  lines.push(
    `  ${report.planning.coverage.reportedSessions} of ${report.planning.coverage.totalSessions} sessions reported usage`,
  );

  lines.push('');
  lines.push('Cycle:');
  const cyclePhaseLines: readonly [string, CyclePhaseMetrics][] = [
    ['Brief to approval', report.cycle.phases.briefToApproval],
    ['Approval to first task', report.cycle.phases.approvalToFirstTask],
    ['First task to archive', report.cycle.phases.firstTaskToArchive],
    ['Total', report.cycle.phases.total],
  ];
  for (const [label, phase] of cyclePhaseLines) {
    lines.push(
      `  ${label}: total ${formatDuration(phase.totalSeconds * 1000)}, average ${formatDuration(phase.averageSeconds * 1000)} (${phase.coveredChanges} of ${phase.totalChanges} archived changes)`,
    );
  }

  lines.push('');
  lines.push('Queue:');
  const queue = report.queue;
  if (!queue?.configured) {
    lines.push('  (not configured)');
  } else {
    lines.push(`  Landed: ${queue.landed} of ${queue.total} items`);
    lines.push(
      `  Planning sessions: ${queue.planning.sessions}, recorded cost: ${formatCost(queue.planning.cost)}`,
    );
    lines.push(
      `  Cost coverage: ${queue.planning.costCoverageComplete ? 'complete' : 'incomplete'}`,
    );
    lines.push('  Covered item wall times:');
    const timedItems = queue.items.filter((item) => item.plannedToLandedSeconds !== null);
    if (timedItems.length === 0) {
      lines.push('    (none)');
    } else {
      for (const item of timedItems) {
        lines.push(
          `    ${item.slug}: ${formatDuration((item.plannedToLandedSeconds as number) * 1000)}`,
        );
      }
    }
    lines.push('  Active failures:');
    if (queue.failures.length === 0) {
      lines.push('    (none)');
    } else {
      for (const failure of queue.failures) {
        lines.push(`    ${failure.change} ${failure.target} (reason: ${failure.reason})`);
      }
    }
    lines.push('  Retained rejections:');
    if (queue.rejections.length === 0) {
      lines.push('    (none)');
    } else {
      for (const rejection of queue.rejections) {
        lines.push(
          `    ${rejection.slug} ${rejection.change} (reason: ${rejection.reason}, at: ${rejection.timestamp ?? 'unavailable'})`,
        );
      }
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

  lines.push('');
  lines.push('File Changes:');
  lines.push(`  Total change events: ${report.fileChanges.totalChanges}`);
  lines.push(`  Unique files modified: ${report.fileChanges.uniqueCount}`);

  return lines.join('\n');
}
