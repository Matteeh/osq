import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import { readManifestApprovedAt } from '../run/manifest-approval.js';
import { parseFrontmatter, parseTaskMd } from '../spec/parser.js';
import { changeTrees, listChanges } from '../status/change-locations.js';
import { type QueueReport, readQueueReport } from '../status/queue-report.js';
import { type TaskStatus, compareNumericPrefix, deriveSpecState } from '../status/state.js';
import {
  type ApprovalFlagOutcomes,
  collectApprovalFlagOutcomes,
  formatApprovalFlagOutcomes,
} from './approval-flags.js';
import { readBriefToApprovalSeconds } from './brief-to-approval.js';
import {
  type PlanningChangeEconomics,
  type PlanningComparison,
  buildPlanningComparison,
  computePlanningByChange,
} from './planning-economics.js';
import { readPlanningSessions } from './planning.js';
import {
  type DisclosureEntry,
  collectDisclosures,
  formatDisclosures,
} from './record-disclosures.js';
import {
  type PlanningCostBySource,
  collectCostBySource,
  formatPlanningCostBySource,
} from './record-estimates.js';
import { type ReworkEntry, collectRework, formatRework } from './record-rework.js';
import {
  type VerificationCounts,
  collectVerificationCounts,
  formatVerificationCounts,
} from './record-verification.js';
import {
  type DependencyEntry,
  collectDependencies,
  formatDependencies,
} from './report-dependencies.js';
import {
  asData,
  eventTimestampMs,
  observeAttempts,
  observeTaskStream,
  parseEventLines,
  parseTokenEvent,
} from './report-events.js';
import {
  type CapabilityMutationScore,
  collectMutationScores,
  formatMutation,
} from './report-mutation.js';
import { type PreSpawnStartCounts, observePreSpawnEvents } from './report-pre-spawn.js';
import {
  type RetryGroupHistory,
  type RetryHistory,
  addRetryHistory,
  emptyRetryHistory,
  observeRetries,
} from './report-retries.js';
import {
  type CapabilityTraceabilityGaps,
  collectTraceabilityGaps,
  formatTraceability,
} from './report-traceability.js';
import { taskScopeSize } from './scope-size.js';

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
  readonly unmarked: number;
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

/** One ordered size bucket with first-attempt outcome aggregates. */
export interface SizeBucketRow {
  readonly bucket: string;
  readonly tasks: number;
  readonly firstAttemptPassRate: number;
  readonly meanAttempts: number;
  readonly medianDurationSeconds: number | null;
}

/** The first-attempt pass with the greatest observed scope size. */
export interface LargestFirstAttemptPass {
  readonly change: string;
  readonly task: string;
  readonly title: string;
  readonly scopeFiles: number;
  readonly acceptanceLines: number;
}

/** Size-against-outcome buckets for one scope-file resolver generation. */
export interface ScopeFileSeries {
  readonly resolver: 'legacy' | 'resolver-2';
  readonly startsAtChange: string | null;
  readonly byScopeFiles: readonly SizeBucketRow[];
  readonly largestFirstAttemptPass: LargestFirstAttemptPass | null;
}

/**
 * Acceptance-line buckets plus the ordered legacy and resolver-2 scope-file
 * series. Scope-file counts never compare across resolver generations; the
 * acceptance-line unit did not change, so it stays one combined series.
 */
export interface SizeMetrics {
  readonly scopeFileSeries: readonly ScopeFileSeries[];
  readonly byAcceptanceLines: readonly SizeBucketRow[];
}

/**
 * Scope-regression detection and recertification counters derived only from
 * typed events in numbered task streams. Legacy scope detections without a
 * finite exit code remain visible in `detected` without guessed pass/fail.
 */
export interface ScopeRegressionHistory {
  readonly detected: number;
  readonly verificationPassedAtDetection: number;
  readonly verificationFailedAtDetection: number;
  readonly recertifiedByHuman: number;
  readonly recertifiedAutomatically: number;
  readonly requeuedForAgent: number;
}

/** Execution history derived exclusively from append-only task event files. */
export interface HistoryMetrics {
  readonly attempts: AttemptMetrics;
  readonly deadByReason: Record<string, number>;
  readonly unexplainedReruns: UnexplainedReruns;
  readonly verifyRuns: VerifyRunMetrics;
  readonly preSpawnVerify: PreSpawnVerifyHistory;
  readonly cost: CostHistory;
  readonly retries: RetryHistory;
  readonly rejections: RejectionHistory;
  readonly sizes: SizeMetrics;
  readonly scopeRegressions: ScopeRegressionHistory;
  /** Later active/archived changes naming each fixed change, by change id. */
  readonly rework: readonly ReworkEntry[];
  /** Changes whose task result files hold a real executor disclosure. */
  readonly disclosures: readonly DisclosureEntry[];
  /**
   * Distinct packages added per active or archived change, in change order.
   * Absent when no task stream holds a `dependencies_added` event.
   */
  readonly dependencies?: readonly DependencyEntry[];
  /**
   * After-landing verification counts by latest outcome. Absent when no
   * archived change requires verification.
   */
  readonly verification?: VerificationCounts;
}

/**
 * Pre-spawn verify runs and mismatches, counted apart from verification gates.
 * `mismatchedTasks` lists the change-and-task references of tasks with at least
 * one mismatch, in the same form as `verifyRuns.byTask` keys.
 */
export interface PreSpawnVerifyHistory {
  readonly runs: number;
  readonly mismatches: number;
  readonly mismatchedTasks: readonly string[];
  /** Runs whose pre-spawn event recorded a non-empty `missingPaths`. */
  readonly missingPathRuns: number;
  /** Runs and zero-exit passes for each declared `expected` start state. */
  readonly byStart: PreSpawnStartCounts;
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
  readonly approvalFlags: ApprovalFlagOutcomes;
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
  /**
   * Traceability gaps per opted-in capability, in name order. Absent when no
   * capability is opted in, so the report is unchanged for other projects.
   */
  readonly traceability?: readonly CapabilityTraceabilityGaps[];
  /**
   * Mutation scores per opted-in capability, in name order. Absent when no
   * measured event names an opted-in capability, so the report is unchanged.
   */
  readonly mutation?: readonly CapabilityMutationScore[];
}

/** Aggregate planning usage derived only from `.run/plan.jsonl` lifecycle pairs. */
export interface PlanningMetrics {
  readonly sessions: number;
  /**
   * Distinct active and archived changes carrying at least one valid
   * `plan_started` record of either source. Exit-only and malformed lines do
   * not cover a change, and repeated sessions for one change count once.
   */
  readonly changesWithPlanningRecords: number;
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
    /** Recorded and estimated cost split by provenance. */
    readonly bySource: PlanningCostBySource;
  };
  readonly coverage: {
    readonly reportedSessions: number;
    readonly totalSessions: number;
  };
  /** Per change planning economics for every change with a valid start. */
  readonly byChange: Record<string, PlanningChangeEconomics>;
  /** Planning against executor tokens and cost, in totals. */
  readonly comparison: PlanningComparison;
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

/**
 * Formats a cost only when something was actually reported. A non-zero sum
 * proves a reported value even when it was not attributed to a counted attempt;
 * a counted reporter with a zero sum proves a reported zero. Otherwise the
 * honest label is `not reported` rather than a dollar amount summed from nothing.
 */
function formatReportedCost(total: number, reportedCount: number): string {
  return total !== 0 || reportedCount > 0 ? formatCost(total) : 'not reported';
}

/**
 * Whether the queue's planning spend has at least one reported value. Complete
 * coverage with sessions proves every session reported, including recorded
 * zeros; a non-zero sum proves one did and is handled by the formatter. An
 * incomplete zero sum cannot tell an unrecorded cost from a reported zero, so
 * it is treated as unreported rather than invented.
 */
function queuePlanningCostReported(queue: QueueReport): boolean {
  return queue.planning.sessions > 0 && queue.planning.costCoverageComplete;
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
  /** True when the change sits under the archive root, so nothing can run in it. */
  readonly archived: boolean;
  readonly status: TaskStatus;
}

const SIZE_BUCKETS = ['1-2', '3-4', '5-8', 'over-8'] as const;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Ordered bucket label for a non-negative size observation. */
function bucketForSize(value: number): string {
  if (value <= 2) return '1-2';
  if (value <= 4) return '3-4';
  if (value <= 8) return '5-8';
  return 'over-8';
}

/**
 * One measured task: the unit shared by bucket aggregation, largest selection,
 * and the recent archive record. Title and acceptance lines come from task
 * metadata; size, attempts, outcome, and duration come only from task events.
 */
interface MeasuredTask {
  readonly change: string;
  readonly task: string;
  readonly title: string;
  /** Raw first start measure resolver field: legacy, version 2, or malformed. */
  readonly scopeResolver: unknown;
  readonly scopeFiles: number;
  readonly acceptanceLines: number;
  readonly attempts: number;
  readonly firstAttemptPass: boolean;
  readonly durationSeconds: number | null;
}

/** Resolver generation for scope-file evidence; malformed versions fit neither. */
function scopeFileGeneration(task: MeasuredTask): 'legacy' | 'resolver-2' | null {
  if (task.scopeResolver === undefined) return 'legacy';
  if (task.scopeResolver === 2) return 'resolver-2';
  return null;
}

/** Title and acceptance-line count from a task file; missing files yield empties. */
async function readTaskMetadata(
  folderPath: string,
  taskNumber: string,
): Promise<{ title: string; acceptanceLines: number }> {
  const content = await fs
    .readFile(path.join(folderPath, 'tasks', `${taskNumber}.md`), 'utf8')
    .catch(() => null);
  if (content === null) return { title: '', acceptanceLines: 0 };
  const task = parseTaskMd(content);
  return { title: task.title, acceptanceLines: task.acceptance.length };
}

/**
 * Projects one task's event stream. A task contributes only with a valid first
 * `measures` start carrying a finite `scopeFiles`. Attempts count `started`
 * events; the first attempt passes only when a typed `done` arrives before the
 * next `started`, `dead`, or `regressed` outcome. Duration sums valid measures
 * start-to-end pairs and is null when no pair completes.
 */
function deriveMeasuredTask(
  change: string,
  task: string,
  events: readonly Record<string, unknown>[],
): Omit<MeasuredTask, 'title' | 'acceptanceLines'> | null {
  let startScopeFiles: number | null = null;
  let scopeResolver: unknown;
  let pendingStartMs: number | null = null;
  let coveredMs = 0;
  let hasDuration = false;

  for (const event of events) {
    if (event.type !== 'measures') continue;
    const data = asData(event);
    if (data?.phase === 'start') {
      const rawScopeFiles = data.scopeFiles;
      if (
        startScopeFiles === null &&
        typeof rawScopeFiles === 'number' &&
        Number.isFinite(rawScopeFiles) &&
        rawScopeFiles >= 0
      ) {
        startScopeFiles = rawScopeFiles;
        scopeResolver = data.scopeResolver;
      }
      pendingStartMs = eventTimestampMs(event);
    } else if (data?.phase === 'end') {
      const endMs = eventTimestampMs(event);
      if (pendingStartMs !== null && endMs !== null && endMs >= pendingStartMs) {
        coveredMs += endMs - pendingStartMs;
        hasDuration = true;
      }
      pendingStartMs = null;
    }
  }

  if (startScopeFiles === null) return null;

  const { attempts, firstAttemptPass } = observeAttempts(events);

  return {
    change,
    task,
    scopeResolver,
    scopeFiles: taskScopeSize(events, startScopeFiles),
    attempts,
    firstAttemptPass,
    durationSeconds: hasDuration ? coveredMs / 1000 : null,
  };
}

/** Every measured task across the given change folders, in stable folder order. */
async function projectMeasuredTasks(folders: readonly string[]): Promise<MeasuredTask[]> {
  const measured: MeasuredTask[] = [];
  for (const folderPath of folders) {
    const change = path.basename(folderPath);
    const tasksDir = path.join(folderPath, 'tasks');
    let taskFiles: string[] = [];
    try {
      taskFiles = (await fs.readdir(tasksDir))
        .filter((entry) => entry.endsWith('.md'))
        .sort(compareNumericPrefix);
    } catch {
      continue;
    }

    for (const taskFile of taskFiles) {
      const taskNumber = taskFile.replace(/\.md$/, '');
      const eventContent = await fs
        .readFile(path.join(folderPath, '.run', 'events', `${taskNumber}.jsonl`), 'utf8')
        .catch(() => null);
      if (eventContent === null) continue;
      const derived = deriveMeasuredTask(change, taskNumber, parseEventLines(eventContent));
      if (!derived) continue;
      const metadata = await readTaskMetadata(folderPath, taskNumber);
      measured.push({
        ...derived,
        title: metadata.title,
        acceptanceLines: metadata.acceptanceLines,
      });
    }
  }
  return measured;
}

/** Ordinary sorted median rounded to two decimals, or null for no values. */
function medianSeconds(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  return round2(median);
}

/** Ordered bucket rows for one size key; empty buckets report zero and null. */
function aggregateSizeBuckets(
  tasks: readonly MeasuredTask[],
  key: 'scopeFiles' | 'acceptanceLines',
): SizeBucketRow[] {
  return SIZE_BUCKETS.map((bucket) => {
    const rows = tasks.filter((task) => bucketForSize(task[key]) === bucket);
    const count = rows.length;
    const passed = rows.filter((task) => task.firstAttemptPass).length;
    const durations = rows
      .map((task) => task.durationSeconds)
      .filter((value): value is number => value !== null);
    return {
      bucket,
      tasks: count,
      firstAttemptPassRate: count > 0 ? round2(passed / count) : 0,
      meanAttempts:
        count > 0 ? round2(rows.reduce((sum, task) => sum + task.attempts, 0) / count) : 0,
      medianDurationSeconds: medianSeconds(durations),
    };
  });
}

/** The first-attempt pass with the greatest scope files, then acceptance lines. */
function selectLargestFirstAttemptPass(
  tasks: readonly MeasuredTask[],
): LargestFirstAttemptPass | null {
  const passing = tasks.filter((task) => task.firstAttemptPass);
  if (passing.length === 0) return null;
  const [top] = [...passing].sort((a, b) => {
    if (b.scopeFiles !== a.scopeFiles) return b.scopeFiles - a.scopeFiles;
    if (b.acceptanceLines !== a.acceptanceLines) return b.acceptanceLines - a.acceptanceLines;
    const byChange = compareNumericPrefix(a.change, b.change);
    return byChange !== 0 ? byChange : compareNumericPrefix(a.task, b.task);
  });
  return {
    change: top.change,
    task: top.task,
    title: top.title,
    scopeFiles: top.scopeFiles,
    acceptanceLines: top.acceptanceLines,
  };
}

/** The smallest change id by stable numeric ordering, or null for no tasks. */
function earliestChange(tasks: readonly MeasuredTask[]): string | null {
  let earliest: string | null = null;
  for (const task of tasks) {
    if (earliest === null || compareNumericPrefix(task.change, earliest) < 0) {
      earliest = task.change;
    }
  }
  return earliest;
}

/** Build one resolver generation's scope-file bucket and largest-pass evidence. */
function buildScopeFileSeries(
  tasks: readonly MeasuredTask[],
  resolver: 'legacy' | 'resolver-2',
): ScopeFileSeries {
  return {
    resolver,
    startsAtChange: resolver === 'resolver-2' ? earliestChange(tasks) : null,
    byScopeFiles: aggregateSizeBuckets(tasks, 'scopeFiles'),
    largestFirstAttemptPass: selectLargestFirstAttemptPass(tasks),
  };
}

/** Ordered legacy then resolver-2 scope-file series, excluding malformed versions. */
function deriveScopeFileSeries(tasks: readonly MeasuredTask[]): ScopeFileSeries[] {
  const legacy = tasks.filter((task) => scopeFileGeneration(task) === 'legacy');
  const resolver2 = tasks.filter((task) => scopeFileGeneration(task) === 'resolver-2');
  return [buildScopeFileSeries(legacy, 'legacy'), buildScopeFileSeries(resolver2, 'resolver-2')];
}

/** The scope-file series whose largest pass drives the near-limit hint. */
function selectHintSeries(series: readonly ScopeFileSeries[]): ScopeFileSeries | undefined {
  const resolver2 = series.find((entry) => entry.resolver === 'resolver-2');
  if (resolver2?.byScopeFiles.some((row) => row.tasks > 0)) return resolver2;
  return series.find((entry) => entry.resolver === 'legacy');
}

/** One retry-group line in the `Automatic retries:` block. */
function formatRetryGroupLine(name: string, group: RetryGroupHistory): string {
  return `  ${name}: ${group.count} retries, ${group.reachedDone} reached done, cost ${formatReportedCost(group.cost, group.costReportedAttempts)} (${group.costReportedAttempts} of ${group.count} attempts reported cost)`;
}

/** The retry block printed after the verification lines. */
function formatRetryHistoryLines(retries: RetryHistory): string[] {
  return [
    '  Automatic retries:',
    formatRetryGroupLine('automatic', retries.automatic),
    formatRetryGroupLine('manual', retries.manual),
    `  Stuck: ${retries.stuck}`,
  ];
}

/** Rows printed for one size-against-outcome table. */
function formatSizeBucketLines(rows: readonly SizeBucketRow[]): string[] {
  const lines = ['    bucket     tasks  first-attempt pass rate  mean attempts  median duration'];
  for (const row of rows) {
    const median =
      row.medianDurationSeconds === null
        ? 'unavailable'
        : formatDuration(row.medianDurationSeconds * 1000);
    lines.push(
      `    ${row.bucket.padEnd(10)} ${String(row.tasks).padEnd(6)} ${String(row.firstAttemptPassRate).padEnd(23)} ${String(row.meanAttempts).padEnd(14)} ${median}`,
    );
  }
  return lines;
}

/**
 * Trusted manifest `approvedAt` in milliseconds: the value counts only when the
 * change folder holds `.run/approved`. Null when missing, untrusted, or invalid.
 */
async function readApprovedAtMs(folderPath: string): Promise<number | null> {
  const approvedAt = await readManifestApprovedAt(folderPath);
  if (approvedAt === null) return null;
  const ms = Date.parse(approvedAt);
  return Number.isFinite(ms) ? ms : null;
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
  const [tree] = await changeTrees(projectRoot, config);
  let specsDir = tree.changesDir;
  let archiveDir = tree.archiveDir;
  let rejectedDir = tree.rejectedDir;

  const specsDirStat = await fs.stat(specsDir).catch(() => null);
  const archiveDirStat = await fs.stat(archiveDir).catch(() => null);
  let legacy = false;

  if (!specsDirStat && !archiveDirStat) {
    const legacySpecs = path.join(projectRoot, 'specs');
    const legacyArchive = path.join(projectRoot, 'specs', 'archive');
    const legacySpecsStat = await fs.stat(legacySpecs).catch(() => null);
    const legacyArchiveStat = await fs.stat(legacyArchive).catch(() => null);
    if (legacySpecsStat || legacyArchiveStat) {
      legacy = true;
      specsDir = legacySpecs;
      archiveDir = legacyArchive;
      rejectedDir = path.join(legacySpecs, 'rejected');
    }
  }

  const activeFolders: string[] = [];
  const archivedFolders: string[] = [];
  let rejectedFolders: string[] = [];

  if (legacy) {
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
      (e) =>
        !e.startsWith('_') && !e.startsWith('.') && e !== archiveFolder && e !== rejectedFolder,
    );
    for (const folder of candidateActive) {
      const fullPath = path.join(specsDir, folder);
      const stat = await fs.stat(fullPath).catch(() => null);
      if (stat?.isDirectory()) activeFolders.push(fullPath);
    }

    // 2. Identify archived specs
    let archiveEntries: string[] = [];
    try {
      archiveEntries = await fs.readdir(archiveDir);
    } catch {
      archiveEntries = [];
    }
    for (const folder of archiveEntries) {
      if (folder.startsWith('_') || folder.startsWith('.')) continue;
      const fullPath = path.join(archiveDir, folder);
      const stat = await fs.stat(fullPath).catch(() => null);
      if (stat?.isDirectory()) archivedFolders.push(fullPath);
    }
    rejectedFolders = await listRejectedFolders(rejectedDir);
  } else {
    for (const change of await listChanges(projectRoot, config)) {
      if (change.location === 'active') activeFolders.push(change.folderPath);
      else if (change.location === 'archived') archivedFolders.push(change.folderPath);
      else rejectedFolders.push(change.folderPath);
    }
  }

  const allSpecFolders = [...activeFolders, ...archivedFolders];

  // Rejected history is discovered separately from the active and archive
  // scans, so preserved tasks, planning logs, and events never leak into any
  // other aggregate. A folder counts once, only with a valid `rejected` event.
  let rejectionTotal = 0;
  const rejectionsByPlanner: Record<string, number> = {};
  for (const folderPath of rejectedFolders) {
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
  const archivedFolderSet = new Set(archivedFolders);
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
        archived: archivedFolderSet.has(folderPath),
        status: statusByTask.get(taskNumber) ?? 'pending',
      });
    }
  }

  // 4. Current state: markers only. A task in an archived change that carries no
  // terminal or running marker can never run again, so it is unmarked rather
  // than pending.
  let doneTasks = 0;
  let verifiedTasks = 0;
  let manualTasks = 0;
  let deadTasks = 0;
  let regressedTasks = 0;
  let runningTasks = 0;
  let pendingTasks = 0;
  let unmarkedTasks = 0;

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
        if (task.archived) unmarkedTasks++;
        else pendingTasks++;
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
  let preSpawnRuns = 0;
  let preSpawnMismatches = 0;
  const preSpawnMismatchedTasks: string[] = [];
  let preSpawnMissingPathRuns = 0;
  const preSpawnByStart = {
    red: { runs: 0, passed: 0 },
    green: { runs: 0, passed: 0 },
    any: { runs: 0, passed: 0 },
  };
  let totalCost = 0;
  const perSpecCost: Record<string, number> = {};
  let reportedCostAttempts = 0;
  let retries = emptyRetryHistory();
  let scopeDetected = 0;
  let scopeVerificationPassed = 0;
  let scopeVerificationFailed = 0;
  let scopeRecertifiedByHuman = 0;
  let scopeRecertifiedAutomatically = 0;
  let scopeRequeuedForAgent = 0;

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

    const events = parseEventLines(content);
    const observation = observeTaskStream(events);
    const preSpawnEvents = observePreSpawnEvents(events);
    preSpawnMissingPathRuns += preSpawnEvents.missingPathRuns;
    for (const start of ['red', 'green', 'any'] as const) {
      preSpawnByStart[start].runs += preSpawnEvents.byStart[start].runs;
      preSpawnByStart[start].passed += preSpawnEvents.byStart[start].passed;
    }
    retries = addRetryHistory(retries, observeRetries(events));
    const taskAttempts = observation.attempts;
    attemptsTotal += taskAttempts;
    unexplainedTotal += observation.unexplained;
    for (const [reason, count] of Object.entries(observation.deadByReason)) {
      deadByReason[reason] = (deadByReason[reason] ?? 0) + count;
    }
    verifyTotal += observation.verifyCodes.length;
    verifyMissingExitCode += observation.verifyCodes.filter((code) => code === null).length;
    preSpawnRuns += observation.preSpawnRuns;
    preSpawnMismatches += observation.preSpawnMismatches;
    if (observation.preSpawnMismatches > 0) preSpawnMismatchedTasks.push(task.id);
    for (const value of observation.costValues) {
      totalCost += value;
      perSpecCost[task.changeId] = (perSpecCost[task.changeId] ?? 0) + value;
    }
    reportedCostAttempts += observation.costReportedAttempts;
    scopeDetected += observation.scopeDetected;
    scopeVerificationPassed += observation.scopeVerificationPassed;
    scopeVerificationFailed += observation.scopeVerificationFailed;
    scopeRecertifiedByHuman += observation.scopeRecertifiedByHuman;
    scopeRecertifiedAutomatically += observation.scopeRecertifiedAutomatically;
    scopeRequeuedForAgent += observation.scopeRequeuedForAgent;

    attemptsByTask[task.id] = taskAttempts;
    if (taskAttempts > 1) multipleAttempts.push(task.id);
    if (observation.unexplained > 0) unexplainedByTask[task.id] = observation.unexplained;
    if (observation.verifyCodes.length > 0) verifyByTask[task.id] = [...observation.verifyCodes];
  }

  for (const changeCoverage of Object.values(coverageByChange)) {
    changeCoverage.withEvents.sort(compareNumericPrefix);
    changeCoverage.withoutEvents.sort(compareNumericPrefix);
  }
  multipleAttempts.sort();
  preSpawnMismatchedTasks.sort();

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
          const delta = parseTokenEvent(data);
          totalInput += delta.input;
          totalCachedInput += delta.cachedInput;
          totalOutput += delta.output;
          totalReasoning += delta.reasoning;
          totalTokens += delta.total;
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
  let changesWithPlanningRecords = 0;
  let planningWallSeconds = 0;
  const planningWallByChange: Record<string, number> = {};
  let planningInput: number | null = null;
  let planningOutput: number | null = null;
  let planningCached: number | null = null;
  let planningReasoning: number | null = null;
  let planningCost = 0;
  let planningReportedSessions = 0;
  let planningCostReportedSessions = 0;

  for (const folderPath of allSpecFolders) {
    const changeId = path.basename(folderPath);
    let changeHasPlanningRecord = false;
    for (const session of await readPlanningSessions(folderPath)) {
      if (!session.started) continue;
      planningSessions++;
      changeHasPlanningRecord = true;
      planningWallByChange[changeId] ??= 0;

      const exited = session.exited;
      if (!exited) continue;
      planningWallSeconds += exited.data.wallSeconds;
      planningWallByChange[changeId] += exited.data.wallSeconds;

      const usage = exited.data.usage;
      let reported = false;
      if (usage.inputTokens !== null) {
        planningInput = (planningInput ?? 0) + usage.inputTokens;
        reported = true;
      }
      if (usage.outputTokens !== null) {
        planningOutput = (planningOutput ?? 0) + usage.outputTokens;
        reported = true;
      }
      if (usage.cachedTokens !== null) {
        planningCached = (planningCached ?? 0) + usage.cachedTokens;
        reported = true;
      }
      if (usage.reasoningTokens !== null) {
        planningReasoning = (planningReasoning ?? 0) + usage.reasoningTokens;
        reported = true;
      }
      if (usage.cost !== null) {
        planningCost += usage.cost;
        reported = true;
        planningCostReportedSessions++;
      }
      if (reported) planningReportedSessions++;
    }
    if (changeHasPlanningRecord) changesWithPlanningRecords++;
  }

  const planningWallSecondsByChange = Object.fromEntries(
    Object.entries(planningWallByChange).sort(([a], [b]) => a.localeCompare(b)),
  );

  const planningByChange = await computePlanningByChange(allSpecFolders);
  const planningComparison = buildPlanningComparison(
    {
      input: planningInput,
      output: planningOutput,
      cached: planningCached,
      reasoning: planningReasoning,
      cost: planningCostReportedSessions > 0 ? planningCost : null,
    },
    {
      input: totalInput,
      output: totalOutput,
      cached: totalCachedInput,
      reasoning: totalReasoning,
      cost: reportedCostAttempts > 0 || totalCost !== 0 ? totalCost : null,
    },
  );

  // 8. Archived change cycle time. Only archived folders get a row; every phase
  // is null unless both endpoints exist, parse, and are ordered correctly.
  const cycleRows: CycleChangeMetrics[] = [];
  for (const folderPath of archivedFolders) {
    const change = path.basename(folderPath);
    const approvedMs = await readApprovedAtMs(folderPath);
    const firstStartMs = await readFirstTaskStartMs(folderPath);
    const archivedMs = await readArchivedAtMs(folderPath);

    const briefToApprovalSeconds = await readBriefToApprovalSeconds(folderPath);
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

  const rework = await collectRework(allSpecFolders);
  const approvalFlags = await collectApprovalFlagOutcomes(allSpecFolders, rework);
  const disclosures = await collectDisclosures(allSpecFolders);
  const dependencies = await collectDependencies(allSpecFolders);
  const verification = await collectVerificationCounts(archivedFolders);
  const planningCostBySource = await collectCostBySource(allSpecFolders, config.planning?.prices);
  const traceability = await collectTraceabilityGaps(projectRoot, config);
  const mutation = await collectMutationScores(allSpecFolders, config);

  const measuredTasks = await projectMeasuredTasks(allSpecFolders);
  const sizes: SizeMetrics = {
    scopeFileSeries: deriveScopeFileSeries(measuredTasks),
    byAcceptanceLines: aggregateSizeBuckets(measuredTasks, 'acceptanceLines'),
  };

  const perSpec: Record<string, number> = {};
  for (const [spec, value] of Object.entries(perSpecCost)) {
    if (value > 0) perSpec[spec] = value;
  }
  const sortedPerSpec = Object.fromEntries(
    Object.entries(perSpec).sort(([a], [b]) => a.localeCompare(b)),
  );

  return {
    approvalFlags,
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
      unmarked: unmarkedTasks,
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
      preSpawnVerify: {
        runs: preSpawnRuns,
        mismatches: preSpawnMismatches,
        mismatchedTasks: preSpawnMismatchedTasks,
        missingPathRuns: preSpawnMissingPathRuns,
        byStart: preSpawnByStart,
      },
      cost: {
        total: totalCost,
        perSpec: sortedPerSpec,
        formattedTotal: formatReportedCost(totalCost, reportedCostAttempts),
        provenance: 'harness-reported',
        coverage: {
          reportedAttempts: reportedCostAttempts,
          totalAttempts: attemptsTotal,
        },
      },
      retries,
      rejections: {
        total: rejectionTotal,
        byPlannerModel: rejectionsByPlannerModel,
      },
      sizes,
      scopeRegressions: {
        detected: scopeDetected,
        verificationPassedAtDetection: scopeVerificationPassed,
        verificationFailedAtDetection: scopeVerificationFailed,
        recertifiedByHuman: scopeRecertifiedByHuman,
        recertifiedAutomatically: scopeRecertifiedAutomatically,
        requeuedForAgent: scopeRequeuedForAgent,
      },
      rework,
      disclosures,
      ...(dependencies.length > 0 ? { dependencies } : {}),
      ...(verification ? { verification } : {}),
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
      changesWithPlanningRecords,
      wallSeconds: planningWallSeconds,
      wallSecondsByChange: planningWallSecondsByChange,
      tokens: {
        input: planningInput ?? 0,
        output: planningOutput ?? 0,
        cached: planningCached ?? 0,
        reasoning: planningReasoning ?? 0,
      },
      cost: {
        total: planningCost,
        formattedTotal: formatReportedCost(planningCost, planningCostReportedSessions),
        provenance: 'harness-reported',
        bySource: planningCostBySource,
      },
      coverage: {
        reportedSessions: planningReportedSessions,
        totalSessions: planningSessions,
      },
      byChange: planningByChange,
      comparison: planningComparison,
    },
    queue,
    ...(traceability ? { traceability } : {}),
    ...(mutation ? { mutation } : {}),
  };
}

/**
 * Alias for {@link getMetricsReport} matching the report-generation name used
 * by the metrics-and-reporting spec.
 */
export const generateReport = getMetricsReport;

/** One historical dead outcome rendered in the repository record. */
export interface RepositoryDeadOutcome {
  readonly change: string;
  readonly title: string;
  readonly reason: string;
}

/** Bounded repository record derived only from recent archived changes. */
export interface RepositoryRecord {
  readonly measuredTasks: number;
  readonly firstAttemptPasses: number;
  readonly medianDurationSeconds: number | null;
  readonly largestFirstAttemptPass: LargestFirstAttemptPass | null;
  /** Resolver generation behind the largest scope pass, or null when none. */
  readonly scopeFileResolver: 'legacy' | 'resolver-2' | null;
  readonly deadOutcomes: readonly RepositoryDeadOutcome[];
}

export const REPOSITORY_RECORD_MIN_MEASURED_TASKS = 5;
export const REPOSITORY_RECORD_MAX_ARCHIVED_CHANGES = 20;
export const REPOSITORY_RECORD_MAX_DEAD_OUTCOMES = 10;

function numericPrefix(name: string): number | null {
  const match = name.match(/^(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

/** Newest archived folders first by numeric prefix, capped at `limit`. */
function listRecentArchiveFolders(folders: readonly string[], limit: number): string[] {
  const sorted = [...folders].sort((a, b) => {
    const nameA = path.basename(a);
    const nameB = path.basename(b);
    const numA = numericPrefix(nameA);
    const numB = numericPrefix(nameB);
    if (numA !== null && numB !== null) {
      if (numA !== numB) return numB - numA;
      return nameA.localeCompare(nameB);
    }
    if (numA !== null) return -1;
    if (numB !== null) return 1;
    return nameA.localeCompare(nameB);
  });
  return sorted.slice(0, limit);
}

/** Every typed `dead` event in the window, in change/task/event order. */
async function collectDeadOutcomes(folders: readonly string[]): Promise<RepositoryDeadOutcome[]> {
  const outcomes: RepositoryDeadOutcome[] = [];
  for (const folderPath of folders) {
    const change = path.basename(folderPath);
    const tasksDir = path.join(folderPath, 'tasks');
    let taskFiles: string[] = [];
    try {
      taskFiles = (await fs.readdir(tasksDir))
        .filter((entry) => entry.endsWith('.md'))
        .sort(compareNumericPrefix);
    } catch {
      continue;
    }

    for (const taskFile of taskFiles) {
      const taskNumber = taskFile.replace(/\.md$/, '');
      const eventContent = await fs
        .readFile(path.join(folderPath, '.run', 'events', `${taskNumber}.jsonl`), 'utf8')
        .catch(() => null);
      if (eventContent === null) continue;
      const metadata = await readTaskMetadata(folderPath, taskNumber);
      for (const event of parseEventLines(eventContent)) {
        if (event.type !== 'dead') continue;
        const rawReason = asData(event)?.reason;
        const reason =
          typeof rawReason === 'string' && rawReason.trim() ? rawReason.trim() : 'unknown';
        outcomes.push({ change, title: metadata.title, reason });
      }
    }
  }
  return outcomes;
}

/**
 * Shared bounded repository record: at most the 20 newest canonical archived
 * changes by numeric id, with measured outcomes and up to ten dead rows.
 */
export async function getRepositoryRecord(
  projectRoot: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<RepositoryRecord> {
  const archived = await listChanges(projectRoot, config, ['archived']);
  const folders = listRecentArchiveFolders(
    archived.map((change) => change.folderPath),
    REPOSITORY_RECORD_MAX_ARCHIVED_CHANGES,
  );
  const measured = await projectMeasuredTasks(folders);
  const deadOutcomes = await collectDeadOutcomes(folders);
  const passed = measured.filter((task) => task.firstAttemptPass).length;
  const durations = measured
    .map((task) => task.durationSeconds)
    .filter((value): value is number => value !== null);

  // Scope-sized evidence uses exactly one resolver generation: resolver-2 when
  // the archive window has any, otherwise the labeled legacy fallback. Malformed
  // resolver versions never contribute a cross-generation comparison.
  const resolver2Tasks = measured.filter((task) => scopeFileGeneration(task) === 'resolver-2');
  const legacyTasks = measured.filter((task) => scopeFileGeneration(task) === 'legacy');
  const useResolver2 = resolver2Tasks.length > 0;
  const scopeTasks = useResolver2 ? resolver2Tasks : legacyTasks;
  const scopeFileResolver: 'legacy' | 'resolver-2' | null =
    scopeTasks.length > 0 ? (useResolver2 ? 'resolver-2' : 'legacy') : null;

  return {
    measuredTasks: measured.length,
    firstAttemptPasses: passed,
    medianDurationSeconds: medianSeconds(durations),
    largestFirstAttemptPass: selectLargestFirstAttemptPass(scopeTasks),
    scopeFileResolver,
    deadOutcomes: deadOutcomes.slice(0, REPOSITORY_RECORD_MAX_DEAD_OUTCOMES),
  };
}

/**
 * Body of the planning prompt's repository-record section. The caller owns the
 * heading. Fewer than five measured tasks print only the too-small sentence.
 */
export function formatRepositoryRecordBody(record: RepositoryRecord): string {
  if (record.measuredTasks < REPOSITORY_RECORD_MIN_MEASURED_TASKS) {
    return `This repository's measured record is too small (fewer than ${REPOSITORY_RECORD_MIN_MEASURED_TASKS} tasks).`;
  }

  const lines: string[] = [];
  lines.push(`First-attempt passes: ${record.firstAttemptPasses}/${record.measuredTasks}`);

  const largest = record.largestFirstAttemptPass;
  if (largest) {
    const scopeLabel =
      record.scopeFileResolver === 'legacy'
        ? ' [legacy scope]'
        : record.scopeFileResolver === 'resolver-2'
          ? ' [resolver 2 scope]'
          : '';
    lines.push(
      `Largest first-attempt pass: ${largest.change}/${largest.task} "${largest.title}" (scope files: ${largest.scopeFiles}, acceptance lines: ${largest.acceptanceLines})${scopeLabel}`,
    );
  } else {
    lines.push('Largest first-attempt pass: unavailable');
  }

  lines.push(
    `Median task duration: ${
      record.medianDurationSeconds === null
        ? 'unavailable'
        : formatDuration(record.medianDurationSeconds * 1000)
    }`,
  );

  lines.push('Dead outcomes:');
  if (record.deadOutcomes.length === 0) {
    lines.push('  (none)');
  } else {
    for (const outcome of record.deadOutcomes) {
      lines.push(`- ${outcome.change}, ${outcome.title}, ${outcome.reason}`);
    }
  }

  return lines.join('\n');
}

/** A nullable measured value: `unavailable` when nothing reported it. */
function formatOptionalValue(value: number | null): string {
  return value === null ? 'unavailable' : String(value);
}

/** A nullable comparison cost: `not reported` when nothing on its side did. */
function formatComparisonCost(cost: number | null): string {
  return formatReportedCost(cost ?? 0, cost === null ? 0 : 1);
}

/** A nullable comparison token total: `not reported` when nothing on its side did. */
function formatComparisonToken(value: number | null): string {
  return value === null ? 'not reported' : String(value);
}

/** One `Planning by change:` row for a single change's economics. */
function formatPlanningChangeLine(entry: PlanningChangeEconomics): string {
  const tokens = entry.tokens;
  return [
    `sessions ${entry.sessions}`,
    `active ${formatOptionalValue(entry.activeMinutes)} min`,
    `tokens in ${formatOptionalValue(tokens.input)} out ${formatOptionalValue(tokens.output)} cache-read ${formatOptionalValue(tokens.cacheRead)} cache-write ${formatOptionalValue(tokens.cacheWrite)} reasoning ${formatOptionalValue(tokens.reasoning)}`,
    `cost ${formatComparisonCost(entry.cost)}`,
    `spec words ${formatOptionalValue(entry.specWords)}`,
    `changed lines ${formatOptionalValue(entry.changedLines)} (${formatOptionalValue(entry.specWordsPerChangedLine)} words/line)`,
    `last edit to approval ${formatOptionalValue(entry.minutesLastEditToApproval)} min`,
  ].join(', ');
}

export function formatMetricsReport(
  report: MetricsReport,
  config: OsqConfig = DEFAULT_CONFIG,
): string {
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
  lines.push(`  Unmarked: ${report.now.unmarked}`);
  lines.push(`  Completion rate: ${report.completionRate}%`);

  lines.push('');
  lines.push('History:');
  lines.push(`  Total attempts: ${report.history.attempts.total}`);
  lines.push(`  Tasks with multiple attempts: ${report.history.attempts.multipleAttempts.length}`);
  lines.push(`  Unexplained re-runs: ${report.history.unexplainedReruns.total}`);
  lines.push(`  Verification runs: ${report.history.verifyRuns.total}`);
  lines.push(`  Verification runs missing exit code: ${report.history.verifyRuns.missingExitCode}`);
  lines.push(
    `  Pre-spawn verify mismatches: ${report.history.preSpawnVerify.mismatches} of ${report.history.preSpawnVerify.runs} runs`,
  );
  lines.push(
    `  Pre-spawn verify with missing paths: ${report.history.preSpawnVerify.missingPathRuns} of ${report.history.preSpawnVerify.runs} runs`,
  );
  const preSpawnByStart = report.history.preSpawnVerify.byStart;
  lines.push(
    `  Pre-spawn verify by declared start: red ${preSpawnByStart.red.passed} of ${preSpawnByStart.red.runs} passed, green ${preSpawnByStart.green.passed} of ${preSpawnByStart.green.runs} passed, any ${preSpawnByStart.any.passed} of ${preSpawnByStart.any.runs} passed`,
  );
  lines.push(...formatRetryHistoryLines(report.history.retries));
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

  lines.push('  Scope regressions:');
  lines.push(`    Detected: ${report.history.scopeRegressions.detected}`);
  lines.push(
    `    Verification passed at detection: ${report.history.scopeRegressions.verificationPassedAtDetection}`,
  );
  lines.push(
    `    Verification failed at detection: ${report.history.scopeRegressions.verificationFailedAtDetection}`,
  );
  lines.push(`    Recertified by human: ${report.history.scopeRegressions.recertifiedByHuman}`);
  lines.push(
    `    Recertified automatically: ${report.history.scopeRegressions.recertifiedAutomatically}`,
  );
  lines.push(`    Requeued for agent: ${report.history.scopeRegressions.requeuedForAgent}`);

  lines.push(...formatRework(report.history.rework ?? []));
  lines.push(...formatDisclosures(report.history.disclosures ?? []));
  if ((report.history.dependencies ?? []).length > 0) {
    lines.push(...formatDependencies(report.history.dependencies ?? []));
  }
  if (report.history.verification) {
    lines.push(formatVerificationCounts(report.history.verification));
  }

  const scopeSeries = report.history.sizes.scopeFileSeries;
  const legacySeries = scopeSeries.find((entry) => entry.resolver === 'legacy');
  const resolver2Series = scopeSeries.find((entry) => entry.resolver === 'resolver-2');

  lines.push('  Size by scope files (legacy):');
  lines.push(...formatSizeBucketLines(legacySeries?.byScopeFiles ?? []));
  lines.push('  Size by scope files (resolver-2):');
  lines.push(...formatSizeBucketLines(resolver2Series?.byScopeFiles ?? []));
  lines.push(`  Resolver 2 starts at: ${resolver2Series?.startsAtChange ?? 'unavailable'}`);
  lines.push('  Size by acceptance lines:');
  lines.push(...formatSizeBucketLines(report.history.sizes.byAcceptanceLines));

  const largestPass = selectHintSeries(scopeSeries)?.largestFirstAttemptPass ?? null;
  if (largestPass) {
    const matching: string[] = [];
    if (Math.abs(config.limits.maxScopeFiles - largestPass.scopeFiles) <= 1) {
      matching.push(
        `scope files ${largestPass.scopeFiles} is within 1 of configured maxScopeFiles ${config.limits.maxScopeFiles}`,
      );
    }
    if (Math.abs(config.limits.maxAcceptanceLines - largestPass.acceptanceLines) <= 1) {
      matching.push(
        `acceptance lines ${largestPass.acceptanceLines} is within 1 of configured maxAcceptanceLines ${config.limits.maxAcceptanceLines}`,
      );
    }
    if (matching.length > 0) {
      lines.push(
        `  Size hint: largest first-attempt pass ${largestPass.change}/${largestPass.task} — ${matching.join('; ')}`,
      );
    }
  }

  if (report.traceability) {
    lines.push('');
    lines.push(...formatTraceability(report.traceability));
  }

  if (report.mutation) {
    lines.push('');
    lines.push(...formatMutation(report.mutation));
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
  lines.push(...formatPlanningCostBySource(report.planning.cost.bySource));
  lines.push(
    `  ${report.planning.coverage.reportedSessions} of ${report.planning.coverage.totalSessions} sessions reported usage`,
  );
  lines.push(`  ${report.planning.changesWithPlanningRecords} changes have a planning record`);

  const planningChangeEntries = Object.entries(report.planning.byChange).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  // A repository with no planning at all prints only the totals above; the
  // per-change and comparison sections need at least one planning record.
  if (report.planning.sessions > 0 || planningChangeEntries.length > 0) {
    lines.push('');
    lines.push('Planning by change:');
    if (planningChangeEntries.length === 0) {
      lines.push('  (none)');
    } else {
      for (const [change, entry] of planningChangeEntries) {
        lines.push(`  ${change}: ${formatPlanningChangeLine(entry)}`);
      }
    }
    lines.push('Planning vs execution:');
    const planningSide = report.planning.comparison.planning;
    const executionSide = report.planning.comparison.execution;
    lines.push(
      `  Input tokens: planning ${formatComparisonToken(planningSide.input)}, execution ${formatComparisonToken(executionSide.input)}`,
    );
    lines.push(
      `  Output tokens: planning ${formatComparisonToken(planningSide.output)}, execution ${formatComparisonToken(executionSide.output)}`,
    );
    lines.push(
      `  Cached tokens: planning ${formatComparisonToken(planningSide.cached)}, execution ${formatComparisonToken(executionSide.cached)}`,
    );
    lines.push(
      `  Reasoning tokens: planning ${formatComparisonToken(planningSide.reasoning)}, execution ${formatComparisonToken(executionSide.reasoning)}`,
    );
    lines.push(
      `  Cost: planning ${formatComparisonCost(planningSide.cost)}, execution ${formatComparisonCost(executionSide.cost)}`,
    );
  }

  lines.push('');
  lines.push('Approval flags:');
  lines.push(...formatApprovalFlagOutcomes(report.approvalFlags));

  lines.push('');
  lines.push('Cycle:');
  const cyclePhaseLines: readonly [string, CyclePhaseMetrics][] = [
    ['Brief to approval', report.cycle.phases.briefToApproval],
    ['Approval to first task', report.cycle.phases.approvalToFirstTask],
    ['First task to archive', report.cycle.phases.firstTaskToArchive],
    ['Total', report.cycle.phases.total],
  ];
  for (const [label, phase] of cyclePhaseLines) {
    if (phase.coveredChanges === 0) {
      lines.push(`  ${label}: not reported (0 of ${phase.totalChanges} archived changes)`);
      continue;
    }
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
    const queueCost = formatReportedCost(
      queue.planning.cost,
      queuePlanningCostReported(queue) ? 1 : 0,
    );
    lines.push(`  Planning sessions: ${queue.planning.sessions}, recorded cost: ${queueCost}`);
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
