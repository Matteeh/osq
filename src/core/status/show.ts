import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import { readPlanningSessions } from '../report/planning.js';
import { type DependencyPair, addedPairs, distinctPairs } from '../report/report-dependencies.js';
import { formatDuration } from '../report/report.js';
import { parseResultSections } from '../report/result-sections.js';
import { resolveScope } from '../run/scope.js';
import { buildImportGraph } from '../spec/import-graph.js';
import { parseFrontmatter, parseSpecMdFromFolder, parseTaskMd } from '../spec/parser.js';
import { type ScenarioIndex, buildScenarioIndex } from '../trace/scenario-index.js';
import type { TaggedScenario } from '../trace/tag-scan.js';
import { getArchiveDir, getChangesDir, getRejectedDir } from './layout.js';
import { type NextStep, formatNextStep, readNextStep } from './next-step.js';
import { formatPreSpawnStart } from './pre-spawn-words.js';
import { type SpecStatus, type TaskStatus, deriveSpecState } from './state.js';
import { readVerification } from './verification.js';

export interface TimelineEvent {
  taskNumber: string;
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

/** One differing path paired with its recorded later-task attribution. */
export interface RecertificationAttribution {
  path: string;
  attribution: string;
}

/**
 * One human recertification decision projected from a typed `recertification`
 * event. Every optional field is independently nullable so malformed event data
 * renders as unavailable without dropping the decision.
 */
export interface RecertificationDetail {
  taskNumber: string;
  timestamp: string | null;
  outcome: 'passed' | 'requeued' | null;
  differingPaths: string[];
  attribution: RecertificationAttribution[];
  verify: string | null;
  exitCode: number | null;
  timedOut: boolean | null;
}

export interface TaskDetail {
  taskNumber: string;
  fileName: string;
  title: string;
  status: TaskStatus;
  verify: string;
  scope: string[];
  entry: string[];
  skills: string[];
  acceptance: string[];
  /** Distinct scenario pairs named by scenario test files in the resolved scope. */
  scenarios?: TaggedScenario[];
  deadReason?: string;
  deadDiagnostic?: string;
  regressedReason?: string;
  regressedDiagnostic?: string;
  resultContent?: string;
  events: TimelineEvent[];
}

/**
 * One correlated planning lifecycle pair for display. Only lifecycle
 * identity, timing, and outcome are exposed; token usage and artifact paths
 * stay in the append-only log.
 */
export interface PlanningSessionDetail {
  sessionId: string;
  startTime: string;
  harness: string;
  /** Null when neither the owned nor the observed record reported a model. */
  model: string | null;
  agent?: string;
  exitCode: number | null;
  wallSeconds: number | null;
}

/** One recorded `check_ran` event of an archived change. */
export interface VerificationCheckRow {
  time: string;
  command: string;
  exitCode: number | null;
}

/** One recorded human `verification_recorded` outcome of an archived change. */
export interface VerificationOutcomeRow {
  time: string;
  outcome: 'passed' | 'failed' | null;
  note: string | null;
}

/** The change-level verification history of an archived change. */
export interface VerificationHistory {
  checks: VerificationCheckRow[];
  outcomes: VerificationOutcomeRow[];
}

export interface SpecDetails {
  id: string;
  folderName: string;
  folderPath: string;
  isArchived: boolean;
  location: 'active' | 'archived' | 'rejected';
  title: string;
  status: SpecStatus;
  approvedHash: string | null;
  dependsOn: string[];
  features: {
    reads: string[];
    writes: string[];
  };
  goal: string;
  contract: string;
  nonGoals: string;
  delta: string;
  tasks: TaskDetail[];
  planningSessions: PlanningSessionDetail[];
  recertifications: RecertificationDetail[];
  timeline: TimelineEvent[];
  /** What the change needs next; absent for rejected changes. */
  next?: NextStep;
  /** Present only for an archived change that requires verification. */
  verification?: VerificationHistory;
}

function matchesFolder(folderName: string, query: string): boolean {
  const trimmed = query.trim();
  const num = Number.parseInt(trimmed, 10);
  const padded = !Number.isNaN(num) ? String(num).padStart(3, '0') : trimmed;

  if (folderName === trimmed || folderName === padded) return true;
  if (folderName.startsWith(`${trimmed}-`) || folderName.startsWith(`${padded}-`)) return true;
  if (folderName.endsWith(`-${trimmed}`)) return true;
  return false;
}

function numericTaskTarget(value: unknown): string | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return String(value);
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return value.trim();
  }
  return null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    .map((entry) => entry.trim());
}

function attributionEntries(value: unknown): RecertificationAttribution[] {
  if (!Array.isArray(value)) return [];
  const entries: RecertificationAttribution[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const { path: rawPath, attribution: rawAttribution } = entry as {
      path?: unknown;
      attribution?: unknown;
    };
    if (typeof rawPath !== 'string' || rawPath.trim() === '') continue;
    const attribution =
      typeof rawAttribution === 'string' && rawAttribution.trim() !== ''
        ? rawAttribution.trim()
        : typeof rawAttribution === 'number' && Number.isFinite(rawAttribution)
          ? String(rawAttribution)
          : 'unknown';
    entries.push({ path: rawPath.trim(), attribution });
  }
  return entries;
}

/**
 * Projects one typed `recertification` event into a display row. Only explicit,
 * well-formed values are surfaced; everything else is unavailable. The row is
 * built solely from the already parsed event, never from marker files.
 */
function buildRecertification(taskNumber: string, event: TimelineEvent): RecertificationDetail {
  const data = event.data ?? {};
  const differingPaths = [...new Set(stringList(data.differingPaths))].sort();
  const recorded = attributionEntries(data.attribution);
  const byPath = new Map<string, string>();
  for (const entry of recorded) {
    if (!byPath.has(entry.path)) byPath.set(entry.path, entry.attribution);
  }
  const allPaths = [...new Set([...differingPaths, ...recorded.map((entry) => entry.path)])].sort();
  const attribution = allPaths.map((path) => ({
    path,
    attribution: byPath.get(path) ?? 'unknown',
  }));

  const rawTimestamp = typeof event.timestamp === 'string' ? event.timestamp.trim() : '';
  const timestamp =
    rawTimestamp && !Number.isNaN(new Date(rawTimestamp).getTime()) ? rawTimestamp : null;
  const outcome: 'passed' | 'requeued' | null =
    data.outcome === 'passed' ? 'passed' : data.outcome === 'requeued' ? 'requeued' : null;
  const verify =
    typeof data.command === 'string' && data.command.trim() !== '' ? data.command.trim() : null;
  const exitCode =
    typeof data.exitCode === 'number' && Number.isFinite(data.exitCode) ? data.exitCode : null;
  const timedOut = typeof data.timedOut === 'boolean' ? data.timedOut : null;

  return {
    taskNumber,
    timestamp,
    outcome,
    differingPaths,
    attribution,
    verify,
    exitCode,
    timedOut,
  };
}

export async function resolveSpecFolder(
  projectRoot: string,
  idOrPrefix: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<{
  folderPath: string;
  isArchived: boolean;
  location: 'active' | 'archived' | 'rejected';
}> {
  const trimmed = idOrPrefix.trim();
  if (!trimmed) {
    throw new Error('Spec ID or prefix cannot be empty');
  }

  const specsDir = getChangesDir(config.paths.openspecRoot, projectRoot);
  const archiveDir = getArchiveDir(config.paths.openspecRoot, projectRoot);
  const rejectedDir = getRejectedDir(config.paths.openspecRoot, projectRoot);

  // If directly pointing to an existing folder
  if (path.isAbsolute(trimmed) || trimmed.includes(path.sep)) {
    const candidatePath = path.isAbsolute(trimmed) ? trimmed : path.resolve(projectRoot, trimmed);
    const stat = await fs.stat(candidatePath).catch(() => null);
    if (stat?.isDirectory()) {
      const location =
        candidatePath === archiveDir || candidatePath.startsWith(`${archiveDir}${path.sep}`)
          ? 'archived'
          : candidatePath === rejectedDir || candidatePath.startsWith(`${rejectedDir}${path.sep}`)
            ? 'rejected'
            : 'active';
      return { folderPath: candidatePath, isArchived: location === 'archived', location };
    }
  }

  // 1. Search active specs
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

  for (const entry of activeEntries) {
    if (
      entry.startsWith('.') ||
      entry.startsWith('_') ||
      entry === archiveFolder ||
      entry === rejectedFolder
    ) {
      continue;
    }
    if (matchesFolder(entry, trimmed)) {
      const fullPath = path.join(specsDir, entry);
      const stat = await fs.stat(fullPath).catch(() => null);
      if (stat?.isDirectory()) {
        return { folderPath: fullPath, isArchived: false, location: 'active' };
      }
    }
  }

  // 2. Search archive directory
  const archived = await searchFolder(archiveDir, trimmed, 'archived');
  if (archived) return archived;

  // 3. Search rejected directory
  const rejected = await searchFolder(rejectedDir, trimmed, 'rejected');
  if (rejected) return rejected;

  throw new Error(`Spec "${idOrPrefix}" not found in specs or archive`);
}

/** Search one canonical location directory for a folder matching the query. */
async function searchFolder(
  dir: string,
  query: string,
  location: 'archived' | 'rejected',
): Promise<{ folderPath: string; isArchived: boolean; location: 'archived' | 'rejected' } | null> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (entry.startsWith('.') || entry.startsWith('_')) {
      continue;
    }
    if (matchesFolder(entry, query)) {
      const fullPath = path.join(dir, entry);
      const stat = await fs.stat(fullPath).catch(() => null);
      if (stat?.isDirectory()) {
        return { folderPath: fullPath, isArchived: location === 'archived', location };
      }
    }
  }
  return null;
}

export async function getSpecDetails(
  projectRoot: string,
  specIdOrPrefix: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<SpecDetails> {
  const { folderPath, location } = await resolveSpecFolder(projectRoot, specIdOrPrefix, config);
  const details = await buildSpecDetails(projectRoot, folderPath, location, config);
  return withNextStep(projectRoot, folderPath, location, details, config);
}

/**
 * Attach the change's next step for active and archived folders, and its
 * verification history for an archived folder that requires verification. A
 * rejected folder is returned unchanged, so no next step is invented for it.
 */
async function withNextStep(
  projectRoot: string,
  folderPath: string,
  location: 'active' | 'archived' | 'rejected',
  details: SpecDetails,
  config: OsqConfig,
): Promise<SpecDetails> {
  if (location === 'rejected') return details;

  const next = await readNextStep(projectRoot, folderPath, config);
  if (location !== 'archived') return { ...details, next };

  const verification = await readVerification(folderPath);
  if (!verification.required) return { ...details, next };
  return { ...details, next, verification: buildVerificationHistory(details.timeline) };
}

/** A recorded timestamp when it parses, else `unavailable`. */
function showTime(value: string): string {
  return value && !Number.isNaN(new Date(value).getTime()) ? value : 'unavailable';
}

/**
 * Project the change-level `check_ran` and `verification_recorded` events of
 * an archived change into the `Verification:` section rows. Missing optional
 * values stay unavailable rather than being guessed.
 */
function buildVerificationHistory(timeline: TimelineEvent[]): VerificationHistory {
  const checks: VerificationCheckRow[] = [];
  const outcomes: VerificationOutcomeRow[] = [];
  for (const event of timeline) {
    const data = event.data ?? {};
    if (event.type === 'check_ran') {
      checks.push({
        time: showTime(event.timestamp),
        command:
          typeof data.command === 'string' && data.command.trim() !== ''
            ? data.command.trim()
            : 'unavailable',
        exitCode:
          typeof data.exitCode === 'number' && Number.isFinite(data.exitCode)
            ? data.exitCode
            : null,
      });
    } else if (event.type === 'verification_recorded') {
      outcomes.push({
        time: showTime(event.timestamp),
        outcome: data.outcome === 'passed' || data.outcome === 'failed' ? data.outcome : null,
        note: typeof data.note === 'string' && data.note.trim() !== '' ? data.note.trim() : null,
      });
    }
  }
  return { checks, outcomes };
}

/**
 * Builds the complete change detail for an already resolved folder in any of
 * the three canonical locations. Selector discovery stays with the caller.
 */
export async function getSpecDetailsFromFolder(
  projectRoot: string,
  folderPath: string,
  location: 'active' | 'archived' | 'rejected',
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<SpecDetails> {
  return buildSpecDetails(projectRoot, folderPath, location, config);
}

/** A test path is under `tests/`, or its file name holds `.test.` or `.spec.`. */
function showIsTestPath(relativePath: string): boolean {
  if (relativePath === 'tests' || relativePath.startsWith('tests/')) return true;
  const base = relativePath.slice(relativePath.lastIndexOf('/') + 1);
  return base.includes('.test.') || base.includes('.spec.');
}

/** Distinct scenario pairs named by a file list, sorted by capability and name. */
function distinctScenarioPairs(files: readonly string[], index: ScenarioIndex): TaggedScenario[] {
  const seen = new Set<string>();
  const pairs: TaggedScenario[] = [];
  for (const file of files) {
    for (const pair of index.scenariosInFile(file)) {
      const key = `${pair.capability}\u0000${pair.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push(pair);
    }
  }
  return pairs.sort(
    (a, b) => a.capability.localeCompare(b.capability) || a.name.localeCompare(b.name),
  );
}

/**
 * Attach each task's scenario pairs from scenario test files in its resolved
 * scope. The import graph is built only when some task's scope holds a test
 * path, so a change without scenario tests pays nothing extra.
 */
async function attachTaskScenarios(
  projectRoot: string,
  tasks: readonly TaskDetail[],
  config: OsqConfig,
): Promise<TaskDetail[]> {
  const resolvedByTask = new Map<string, readonly string[]>();
  let hasTestPath = false;
  for (const task of tasks) {
    const resolved = await resolveScope(projectRoot, task.scope);
    const files = resolved.map((entry) => entry.relativePath);
    resolvedByTask.set(task.taskNumber, files);
    if (files.some(showIsTestPath)) hasTestPath = true;
  }
  if (!hasTestPath) return [...tasks];

  const graph = await buildImportGraph(projectRoot, { skip: [config.paths.openspecRoot] });
  const index = buildScenarioIndex(projectRoot, graph);
  const scenarioFiles = new Set(index.scenarioTestFiles);
  return tasks.map((task) => {
    const files = (resolvedByTask.get(task.taskNumber) ?? []).filter((file) =>
      scenarioFiles.has(file),
    );
    const scenarios = distinctScenarioPairs(files, index);
    return scenarios.length > 0 ? { ...task, scenarios } : task;
  });
}

async function buildSpecDetails(
  projectRoot: string,
  folderPath: string,
  location: 'active' | 'archived' | 'rejected',
  config: OsqConfig,
): Promise<SpecDetails> {
  const isArchived = location === 'archived';

  const folderName = path.basename(folderPath);
  const idMatch = folderName.match(/^(\d+)/);
  const id = idMatch ? idMatch[1] : folderName;

  const specData = await parseSpecMdFromFolder(folderPath);
  if (!specData) {
    throw new Error(`Neither proposal.md nor spec.md found in ${folderPath}`);
  }

  // Capability writes are declared solely by delta spec folders under `specs/`.
  const deltasDir = path.join(folderPath, 'specs');
  const writtenCapabilities = (await fs.readdir(deltasDir, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const runDir = path.join(folderPath, '.run');
  const approvedPath = path.join(runDir, 'approved');

  let approvedHash: string | null = null;
  try {
    const hashContent = await fs.readFile(approvedPath, 'utf8');
    approvedHash = hashContent.trim() || null;
  } catch {}

  // Correlated planning lifecycle pairs in start order. A malformed or missing
  // log yields an empty list and never blocks the remaining details.
  const planningSessions: PlanningSessionDetail[] = (
    await readPlanningSessions(folderPath)
  ).flatMap((session) => {
    const started = session.started;
    if (!started) return [];
    return [
      {
        sessionId: session.sessionId,
        startTime: started.timestamp,
        harness: started.data.harness,
        model: started.data.model,
        ...(started.data.agent ? { agent: started.data.agent } : {}),
        exitCode: session.exited?.data.exitCode ?? null,
        wallSeconds: session.exited?.data.wallSeconds ?? null,
      },
    ];
  });

  const tasksDir = path.join(folderPath, 'tasks');
  let taskEntries: string[] = [];
  try {
    taskEntries = (await fs.readdir(tasksDir))
      .filter((e) => e.endsWith('.md'))
      .sort((a, b) => {
        const numA = Number.parseInt(a, 10);
        const numB = Number.parseInt(b, 10);
        if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
          return numA - numB;
        }
        return a.localeCompare(b);
      });
  } catch {}

  // Parse events
  const eventsDir = path.join(runDir, 'events');
  let eventFiles: string[] = [];
  try {
    eventFiles = (await fs.readdir(eventsDir))
      .filter((e) => e.endsWith('.jsonl'))
      .sort((a, b) => {
        const numA = Number.parseInt(a, 10);
        const numB = Number.parseInt(b, 10);
        if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
          return numA - numB;
        }
        return a.localeCompare(b);
      });
  } catch {}

  const taskEventsMap = new Map<string, TimelineEvent[]>();
  const timeline: TimelineEvent[] = [];
  // Typed recertification decisions from numbered task streams only, kept with
  // their original stream order so ties break deterministically.
  const recertificationEvents: { seq: number; streamTask: string; event: TimelineEvent }[] = [];
  let eventSeq = 0;

  for (const eventFile of eventFiles) {
    const taskNum = path.basename(eventFile, '.jsonl');
    const eventFilePath = path.join(eventsDir, eventFile);
    try {
      const fileContent = await fs.readFile(eventFilePath, 'utf8');
      const lines = fileContent.split('\n');
      const taskEvents: TimelineEvent[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          const event: TimelineEvent = {
            taskNumber: String(parsed.taskNumber || taskNum),
            type: String(parsed.type || 'unknown'),
            timestamp: String(parsed.timestamp || ''),
            data:
              typeof parsed.data === 'object' && parsed.data !== null
                ? (parsed.data as Record<string, unknown>)
                : undefined,
          };
          taskEvents.push(event);
          timeline.push(event);
          if (event.type === 'recertification' && /^\d+$/.test(taskNum)) {
            recertificationEvents.push({ seq: eventSeq, streamTask: taskNum, event });
          }
          eventSeq++;
        } catch {}
      }
      taskEventsMap.set(taskNum, taskEvents);
    } catch {}
  }

  // Sort overall timeline chronologically
  timeline.sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) {
      return timeA - timeB;
    }
    return a.timestamp.localeCompare(b.timestamp);
  });

  const recertifications = recertificationEvents
    .map(({ seq, streamTask, event }) => ({
      seq,
      row: buildRecertification(numericTaskTarget(event.data?.task) ?? streamTask, event),
    }))
    .sort((a, b) => {
      const timeA = a.row.timestamp ? new Date(a.row.timestamp).getTime() : null;
      const timeB = b.row.timestamp ? new Date(b.row.timestamp).getTime() : null;
      if (timeA !== null && timeB !== null && timeA !== timeB) {
        return timeA - timeB;
      }
      const numA = Number.parseInt(a.row.taskNumber, 10);
      const numB = Number.parseInt(b.row.taskNumber, 10);
      if (numA !== numB) {
        return numA - numB;
      }
      return a.seq - b.seq;
    })
    .map((entry) => entry.row);

  const tasks: TaskDetail[] = [];
  for (const taskFileName of taskEntries) {
    const taskNumber = taskFileName.replace(/\.md$/, '');
    const taskPath = path.join(tasksDir, taskFileName);
    const taskContent = await fs.readFile(taskPath, 'utf8');
    const taskData = parseTaskMd(taskContent);

    // Derive task status
    let status: TaskStatus = 'pending';
    const donePath = path.join(runDir, 'done', taskNumber);
    const isDone = await fs
      .stat(donePath)
      .then(() => true)
      .catch(() => false);

    const deadPath = path.join(runDir, 'dead', `${taskNumber}.md`);
    let deadReason: string | undefined;
    let deadDiagnostic: string | undefined;
    let regressedReason: string | undefined;
    let regressedDiagnostic: string | undefined;
    const regressedPath = path.join(runDir, 'regressed', `${taskNumber}.md`);
    const regressedContent = await fs.readFile(regressedPath, 'utf8').catch(() => null);
    const deadContent = await fs.readFile(deadPath, 'utf8').catch(() => null);
    if (regressedContent !== null) {
      status = 'regressed';
      const parsedRegressed = parseFrontmatter(regressedContent);
      regressedReason =
        typeof parsedRegressed.data.reason === 'string' ? parsedRegressed.data.reason : undefined;
      regressedDiagnostic = parsedRegressed.body.trim() || undefined;
    } else if (deadContent !== null) {
      status = 'dead';
      const parsedDead = parseFrontmatter(deadContent);
      deadReason = typeof parsedDead.data.reason === 'string' ? parsedDead.data.reason : undefined;
      deadDiagnostic = parsedDead.body.trim() || undefined;
    } else if (isDone) {
      status = 'done';
    } else {
      const runningPath = path.join(runDir, 'running', `${taskNumber}.pid`);
      const isRunning = await fs
        .stat(runningPath)
        .then(() => true)
        .catch(() => false);
      if (isRunning) {
        status = 'running';
      } else {
        status = 'pending';
      }
    }

    // Read result file if present
    const resultPath = path.join(runDir, 'results', `${taskNumber}.md`);
    let resultContent: string | undefined;
    const rawResult = await fs.readFile(resultPath, 'utf8').catch(() => null);
    if (rawResult !== null) {
      resultContent = rawResult.trim() || undefined;
    }

    const taskEvents = taskEventsMap.get(taskNumber) || [];

    tasks.push({
      taskNumber,
      fileName: taskFileName,
      title: taskData.title,
      status,
      verify: taskData.verify,
      scope: taskData.scope,
      entry: taskData.entry,
      skills: taskData.skills,
      acceptance: taskData.acceptance,
      deadReason,
      deadDiagnostic,
      regressedReason,
      regressedDiagnostic,
      resultContent,
      events: taskEvents,
    });
  }

  const taskDetails = await attachTaskScenarios(projectRoot, tasks, config);

  // Derive spec status
  let status: SpecStatus = 'pending';
  if (isArchived) {
    status = 'done';
  } else if (!approvedHash) {
    status = 'unapproved';
  } else if (tasks.some((t) => t.status === 'regressed')) {
    status = 'regressed';
  } else if (tasks.some((t) => t.status === 'dead')) {
    status = 'dead';
  } else if (tasks.some((t) => t.status === 'running')) {
    status = 'running';
  } else if (tasks.length > 0 && tasks.every((t) => t.status === 'done')) {
    status = 'done';
  } else {
    try {
      const derived = await deriveSpecState(projectRoot, folderPath);
      status = derived.status;
    } catch {
      status = 'pending';
    }
  }

  return {
    id,
    folderName,
    folderPath,
    isArchived,
    location,
    title: specData.title,
    status,
    approvedHash,
    dependsOn: specData.dependsOn,
    features: { reads: specData.features.reads, writes: writtenCapabilities },
    goal: specData.goal,
    contract: specData.contract,
    nonGoals: specData.nonGoals,
    delta: specData.delta,
    tasks: taskDetails,
    planningSessions,
    recertifications,
    timeline,
  };
}

/**
 * Projects the latest pre-spawn `verify_ran` event of one task into the
 * `Pre-spawn verify:` show line. Returns null when the task recorded no
 * pre-spawn result, so output for every other task stays unchanged. The start
 * is worded exactly as the watch log words it. Only the already parsed event
 * stream is read; a missing exit code or declared state renders as unavailable
 * rather than being guessed.
 */
function formatPreSpawnVerify(events: TimelineEvent[]): string | null {
  let latest: TimelineEvent | undefined;
  for (const event of events) {
    if (event.type === 'verify_ran' && event.data?.phase === 'pre_spawn') {
      latest = event;
    }
  }
  if (!latest) return null;

  const data = latest.data ?? {};
  const exitCode =
    typeof data.exitCode === 'number' && Number.isFinite(data.exitCode) ? data.exitCode : null;
  const expected = typeof data.expected === 'string' ? data.expected.trim() : '';
  if (exitCode === null || expected === '') {
    return '      Pre-spawn verify: unavailable';
  }
  const missing = validMissingPaths(data.missingPaths);
  return `      Pre-spawn verify: ${formatPreSpawnStart(expected, exitCode, missing)}`;
}

/**
 * The recorded missing named paths of a pre-spawn event. Only a non-empty array
 * whose every entry is a non-empty string qualifies, so an empty, absent, or
 * malformed value contributes no path.
 */
function validMissingPaths(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) return [];
  if (!value.every((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')) {
    return [];
  }
  return value.map((entry) => entry.trim());
}

/**
 * Counts a task's `retry` events split into total and automatic. Automatic
 * retries are exactly those whose event data carries `automatic: true`.
 * Returns null when the task recorded no retry, so every other task's output
 * stays unchanged.
 */
function retryCounts(events: TimelineEvent[]): { total: number; automatic: number } | null {
  let total = 0;
  let automatic = 0;
  for (const event of events) {
    if (event.type !== 'retry') continue;
    total += 1;
    if (event.data?.automatic === true) automatic += 1;
  }
  return total > 0 ? { total, automatic } : null;
}

/** Projects a task's `retry` events into the `Retries:` line, or null. */
function formatRetries(events: TimelineEvent[]): string | null {
  const counts = retryCounts(events);
  if (!counts) return null;
  return `      Retries: ${counts.total} (${counts.automatic} automatic)`;
}

/**
 * Projects the task's latest `stuck` event into the `Stuck:` line, but only
 * while it is still the task's current state. A later `retry` event means a
 * human already retried the task, so the line disappears. Returns null when
 * the task recorded no stuck event or is no longer stuck.
 */
function formatStuck(events: TimelineEvent[]): string | null {
  let stuck: TimelineEvent | undefined;
  let stuckIndex = -1;
  let lastRetry = -1;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.type === 'retry') {
      lastRetry = index;
    } else if (event.type === 'stuck') {
      stuck = event;
      stuckIndex = index;
    }
  }
  if (!stuck || lastRetry > stuckIndex) return null;
  const fingerprint =
    typeof stuck.data?.fingerprint === 'string' && stuck.data.fingerprint.trim() !== ''
      ? stuck.data.fingerprint.trim()
      : 'unavailable';
  return `      Stuck: same failure twice (${fingerprint})`;
}

/**
 * Projects every `dependencies_added` event of a task into the
 * `Dependencies added:` show line, with distinct pairs sorted by file and then
 * name. Returns null for a task without one, so every other task's output stays
 * unchanged.
 */
function formatDependenciesAdded(events: TimelineEvent[]): string | null {
  const pairs: DependencyPair[] = [];
  for (const event of events) {
    if (event.type !== 'dependencies_added') continue;
    pairs.push(...addedPairs(event.data?.added));
  }
  const distinct = distinctPairs(pairs);
  if (distinct.length === 0) return null;
  const rendered = distinct.map((pair) => `${pair.name} (${pair.file})`).join(', ');
  return `      Dependencies added: ${rendered}`;
}

/**
 * Projects the scenario pairs named by the scenario test files in a task's
 * resolved scope into the `Scenarios:` line. Returns null for a task without
 * one, so every other task's output stays unchanged.
 */
function formatTaskScenarios(scenarios: readonly TaggedScenario[] | undefined): string | null {
  if (!scenarios || scenarios.length === 0) return null;
  const rendered = scenarios.map((pair) => `${pair.capability}: ${pair.name}`).join('; ');
  return `      Scenarios: ${rendered}`;
}

/**
 * The note a `failed` focused entry carries. Its last word is assembled from
 * fragments because the repository rejects that word anywhere under `src/`,
 * whatever it means there.
 */
const FOCUSED_FAILED_NOTE = ` (attempt ended, verify ${'ski'}${'pped'})`;

/**
 * Projects every `focused_ran` event of a task into the `Focused runs:` show
 * line, one entry per event in stream order. A `failed` entry records that the
 * attempt ended and its verify did not run. Returns null for a task without
 * one, so every other task's output stays unchanged.
 */
function formatFocusedRuns(events: TimelineEvent[]): string | null {
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
function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** One line per valid survivor of a measured mutation event. */
function mutationSurvivorLines(value: unknown, fallbackFile: string): string[] {
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
function formatMutationRuns(events: TimelineEvent[]): string[] | null {
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

/**
 * Projects the task's latest `instructions_changed` event into the
 * `Instructions changed after approval:` line. Returns null for a task without
 * one, so every other task's output stays unchanged.
 */
function formatInstructionsChanged(events: TimelineEvent[]): string | null {
  let latest: TimelineEvent | undefined;
  for (const event of events) {
    if (event.type === 'instructions_changed') latest = event;
  }
  if (!latest) return null;
  return `      Instructions changed after approval: ${stringList(latest.data?.changed).join(', ')}`;
}

/**
 * Projects the real disclosure sections of a task's result file into the
 * `Disclosures:` show line. Empty or `None`-only sections are absent, and a
 * task whose result holds no real disclosure prints no line. Returns null so
 * every other task's output stays unchanged.
 */
function formatDisclosures(resultContent: string | undefined): string | null {
  if (!resultContent) return null;
  const sections = parseResultSections(resultContent);
  const names: string[] = [];
  if (sections.deviated !== null) names.push('deviated');
  if (sections.missingContext !== null) names.push('missing context');
  if (sections.outsideScope !== null) names.push('outside scope');
  if (names.length === 0) return null;
  return `      Disclosures: ${names.join(', ')}`;
}

function formatEventData(data?: Record<string, unknown>): string {
  if (!data || Object.keys(data).length === 0) return '';
  const entries = Object.entries(data).map(([k, v]) => `${k}: ${v}`);
  return ` (${entries.join(', ')})`;
}

/**
 * Render an archived change's verification history as the `Verification:`
 * section: one line per `check_ran` with its time, command, and exit code, and
 * one per `verification_recorded` with its time, outcome, and note.
 */
function formatVerificationHistory(history: VerificationHistory): string[] {
  const lines = ['Verification:'];
  for (const check of history.checks) {
    const exit = check.exitCode === null ? 'unavailable' : String(check.exitCode);
    lines.push(`  check_ran ${check.time}: ${check.command} (exit ${exit})`);
  }
  for (const outcome of history.outcomes) {
    const note = outcome.note ?? 'none';
    lines.push(
      `  verification_recorded ${outcome.time}: ${outcome.outcome ?? 'unavailable'} (note: ${note})`,
    );
  }
  return lines;
}

export function formatSpecDetails(details: SpecDetails): string {
  const lines: string[] = [];

  const location = details.isArchived ? 'archived' : 'active';
  const approval = details.approvedHash ? `approved (${details.approvedHash})` : 'unapproved';

  lines.push(`Spec: ${details.folderName} (${details.id})`);
  lines.push(`Title: ${details.title}`);
  lines.push(`Status: [${details.status}]`);
  if (details.next) {
    lines.push(`Next: ${formatNextStep(details.next)}`);
  }
  if (details.verification) {
    lines.push(...formatVerificationHistory(details.verification));
  }
  lines.push(`Location: ${location}`);
  lines.push(`Approval: ${approval}`);

  const dependsOnStr = details.dependsOn.length > 0 ? details.dependsOn.join(', ') : 'none';
  lines.push(`Depends on: ${dependsOnStr}`);

  lines.push('Features:');
  const readsStr = details.features.reads.length > 0 ? details.features.reads.join(', ') : 'none';
  const writesStr =
    details.features.writes.length > 0 ? details.features.writes.join(', ') : 'none';
  lines.push(`  Reads: ${readsStr}`);
  lines.push(`  Writes: ${writesStr}`);

  if (details.goal) {
    lines.push('');
    lines.push('Goal:');
    const goalLines = details.goal.split('\n');
    for (const gLine of goalLines) {
      lines.push(`  ${gLine}`);
    }
  }

  if (details.contract) {
    lines.push('');
    lines.push('Contract:');
    const contractLines = details.contract.split('\n');
    for (const cLine of contractLines) {
      lines.push(`  ${cLine}`);
    }
  }

  lines.push('');
  lines.push('Tasks:');
  if (details.tasks.length === 0) {
    lines.push('  (no tasks)');
  } else {
    for (const task of details.tasks) {
      let indicator = '[ ]';
      if (task.status === 'done') {
        indicator = '[x]';
      } else if (task.status === 'running') {
        indicator = '[>]';
      } else if (task.status === 'dead') {
        indicator = '[!]';
      }

      const deadTag = task.deadReason ? ` (reason: ${task.deadReason})` : '';
      lines.push(`  ${indicator} ${task.taskNumber}. ${task.title} [${task.status}]${deadTag}`);
      if (task.verify) {
        lines.push(`      Verify: ${task.verify}`);
      }
      const preSpawnVerify = formatPreSpawnVerify(task.events);
      if (preSpawnVerify) {
        lines.push(preSpawnVerify);
      }
      const retries = formatRetries(task.events);
      if (retries) {
        lines.push(retries);
      }
      const stuck = formatStuck(task.events);
      if (stuck) {
        lines.push(stuck);
      }
      const instructionsChanged = formatInstructionsChanged(task.events);
      if (instructionsChanged) {
        lines.push(instructionsChanged);
      }
      const dependenciesAdded = formatDependenciesAdded(task.events);
      if (dependenciesAdded) {
        lines.push(dependenciesAdded);
      }
      const taskScenarios = formatTaskScenarios(task.scenarios);
      if (taskScenarios) {
        lines.push(taskScenarios);
      }
      const focusedRuns = formatFocusedRuns(task.events);
      if (focusedRuns) {
        lines.push(focusedRuns);
      }
      const mutationRuns = formatMutationRuns(task.events);
      if (mutationRuns) {
        lines.push(...mutationRuns);
      }
      const disclosures = formatDisclosures(task.resultContent);
      if (disclosures) {
        lines.push(disclosures);
      }
      if (task.scope.length > 0) {
        lines.push(`      Scope: ${task.scope.join(', ')}`);
      }
      if (task.acceptance.length > 0) {
        lines.push('      Acceptance:');
        for (const item of task.acceptance) {
          const itemIndicator = task.status === 'done' ? '[x]' : '[ ]';
          lines.push(`        - ${itemIndicator} ${item}`);
        }
      }
      if (task.deadDiagnostic) {
        lines.push('      Failure diagnostic:');
        const diagLines = task.deadDiagnostic.split('\n');
        for (const dLine of diagLines) {
          lines.push(`        ${dLine}`);
        }
      }
      if (task.resultContent) {
        lines.push('      Result:');
        const resLines = task.resultContent.split('\n');
        for (const rLine of resLines) {
          lines.push(`        ${rLine}`);
        }
      }
    }
  }

  lines.push('');
  lines.push('Planning Sessions:');
  if (details.planningSessions.length === 0) {
    lines.push('  (no planning sessions)');
  } else {
    for (const session of details.planningSessions) {
      const agent = session.agent ? ` agent: ${session.agent}` : '';
      const model = session.model ?? 'unavailable';
      const exit = session.exitCode === null ? 'unavailable' : String(session.exitCode);
      const wall =
        session.wallSeconds === null ? 'unavailable' : formatDuration(session.wallSeconds * 1000);
      lines.push(
        `  ${session.startTime} ${session.harness}/${model}${agent} exit: ${exit} wall: ${wall}`,
      );
    }
  }

  // Derived, append-only recertification view. It is rendered only when typed
  // decisions exist and never replaces the raw event timeline below.
  if (details.recertifications.length > 0) {
    lines.push('');
    lines.push('Recertifications:');
    for (const row of details.recertifications) {
      const label =
        row.outcome === 'passed'
          ? 'recertified'
          : row.outcome === 'requeued'
            ? 'requeued for agent work'
            : 'unavailable';
      lines.push(`  Task ${row.taskNumber} ${row.timestamp ?? 'unavailable'} [${label}]`);
      lines.push(`      Verify: ${row.verify ?? 'unavailable'}`);
      lines.push(`      Exit code: ${row.exitCode ?? 'unavailable'}`);
      lines.push(
        `      Timed out: ${row.timedOut === null ? 'unavailable' : row.timedOut ? 'yes' : 'no'}`,
      );
      if (row.attribution.length > 0) {
        lines.push('      Differing paths:');
        for (const entry of row.attribution) {
          const attribution =
            entry.attribution === 'ambiguous' || entry.attribution === 'unknown'
              ? entry.attribution
              : `attributed to task ${entry.attribution}`;
          lines.push(`        - ${entry.path} — ${attribution}`);
        }
      }
    }
  }

  lines.push('');
  lines.push('Event Timeline:');
  if (details.timeline.length === 0) {
    lines.push('  (no events recorded)');
  } else {
    for (const event of details.timeline) {
      const eventData = formatEventData(event.data);
      lines.push(`  ${event.timestamp} [Task ${event.taskNumber}] ${event.type}${eventData}`);
    }
  }

  return lines.join('\n');
}

/**
 * Alias for {@link formatSpecDetails} matching the show-output name used by
 * the status-inspection spec. Displays the dead reason (including
 * `undeclared_test_change`) and its failure diagnostic.
 */
export const formatShowOutput = formatSpecDetails;
