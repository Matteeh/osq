import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import { readPlanningSessions } from '../report/planning.js';
import { formatDuration } from '../report/report.js';
import { parseFrontmatter, parseSpecMdFromFolder, parseTaskMd } from '../spec/parser.js';
import { getArchiveDir, getChangesDir, getRejectedDir } from './layout.js';
import { type SpecStatus, type TaskStatus, deriveSpecState } from './state.js';

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
  return buildSpecDetails(projectRoot, folderPath, location, config);
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

async function buildSpecDetails(
  projectRoot: string,
  folderPath: string,
  location: 'active' | 'archived' | 'rejected',
  _config: OsqConfig,
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
    tasks,
    planningSessions,
    recertifications,
    timeline,
  };
}

function formatEventData(data?: Record<string, unknown>): string {
  if (!data || Object.keys(data).length === 0) return '';
  const entries = Object.entries(data).map(([k, v]) => `${k}: ${v}`);
  return ` (${entries.join(', ')})`;
}

export function formatSpecDetails(details: SpecDetails): string {
  const lines: string[] = [];

  const location = details.isArchived ? 'archived' : 'active';
  const approval = details.approvedHash ? `approved (${details.approvedHash})` : 'unapproved';

  lines.push(`Spec: ${details.folderName} (${details.id})`);
  lines.push(`Title: ${details.title}`);
  lines.push(`Status: [${details.status}]`);
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
