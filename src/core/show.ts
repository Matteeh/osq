import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from './config.js';
import { parseFrontmatter, parseSpecMdFromFolder, parseTaskMd } from './parser.js';
import { type SpecStatus, type TaskStatus, deriveSpecState } from './state.js';

export interface TimelineEvent {
  taskNumber: string;
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
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
  resultContent?: string;
  events: TimelineEvent[];
}

export interface SpecDetails {
  id: string;
  folderName: string;
  folderPath: string;
  isArchived: boolean;
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

export async function resolveSpecFolder(
  projectRoot: string,
  idOrPrefix: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<{ folderPath: string; isArchived: boolean }> {
  const trimmed = idOrPrefix.trim();
  if (!trimmed) {
    throw new Error('Spec ID or prefix cannot be empty');
  }

  const specsDir = path.join(projectRoot, config.paths.specs);
  const archiveDir = path.join(projectRoot, config.paths.archive);

  // If directly pointing to an existing folder
  if (path.isAbsolute(trimmed) || trimmed.includes(path.sep)) {
    const candidatePath = path.isAbsolute(trimmed) ? trimmed : path.resolve(projectRoot, trimmed);
    const stat = await fs.stat(candidatePath).catch(() => null);
    if (stat?.isDirectory()) {
      const isArchived =
        candidatePath === archiveDir || candidatePath.startsWith(`${archiveDir}${path.sep}`);
      return { folderPath: candidatePath, isArchived };
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

  for (const entry of activeEntries) {
    if (entry.startsWith('.') || entry.startsWith('_') || entry === archiveFolder) {
      continue;
    }
    if (matchesFolder(entry, trimmed)) {
      const fullPath = path.join(specsDir, entry);
      const stat = await fs.stat(fullPath).catch(() => null);
      if (stat?.isDirectory()) {
        return { folderPath: fullPath, isArchived: false };
      }
    }
  }

  // 2. Search archive directory
  let archiveEntries: string[] = [];
  try {
    archiveEntries = await fs.readdir(archiveDir);
  } catch {
    archiveEntries = [];
  }

  for (const entry of archiveEntries) {
    if (entry.startsWith('.') || entry.startsWith('_')) {
      continue;
    }
    if (matchesFolder(entry, trimmed)) {
      const fullPath = path.join(archiveDir, entry);
      const stat = await fs.stat(fullPath).catch(() => null);
      if (stat?.isDirectory()) {
        return { folderPath: fullPath, isArchived: true };
      }
    }
  }

  throw new Error(`Spec "${idOrPrefix}" not found in specs or archive`);
}

export async function getSpecDetails(
  projectRoot: string,
  specIdOrPrefix: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<SpecDetails> {
  const { folderPath, isArchived } = await resolveSpecFolder(projectRoot, specIdOrPrefix, config);

  const folderName = path.basename(folderPath);
  const idMatch = folderName.match(/^(\d+)/);
  const id = idMatch ? idMatch[1] : folderName;

  const specData = await parseSpecMdFromFolder(folderPath);
  if (!specData) {
    throw new Error(`Neither proposal.md nor spec.md found in ${folderPath}`);
  }

  const runDir = path.join(folderPath, '.run');
  const approvedPath = path.join(runDir, 'approved');

  let approvedHash: string | null = null;
  try {
    const hashContent = await fs.readFile(approvedPath, 'utf8');
    approvedHash = hashContent.trim() || null;
  } catch {}

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
    const deadContent = await fs.readFile(deadPath, 'utf8').catch(() => null);
    if (deadContent !== null) {
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
    title: specData.title,
    status,
    approvedHash,
    dependsOn: specData.dependsOn,
    features: specData.features,
    goal: specData.goal,
    contract: specData.contract,
    nonGoals: specData.nonGoals,
    delta: specData.delta,
    tasks,
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
