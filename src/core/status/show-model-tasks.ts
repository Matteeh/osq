import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { resolveScope } from '../run/scope.js';
import { buildImportGraph } from '../spec/import-graph.js';
import { parseFrontmatter, parseTaskMd } from '../spec/parser.js';
import { type ScenarioIndex, buildScenarioIndex } from '../trace/scenario-index.js';
import type { TaggedScenario } from '../trace/tag-scan.js';
import { isTestPath } from '../trace/test-path.js';
import type { TaskDetail, TimelineEvent } from './show-types.js';
import type { TaskStatus } from './state.js';

interface TaskMarkers {
  status: TaskStatus;
  deadReason?: string;
  deadDiagnostic?: string;
  regressedReason?: string;
  regressedDiagnostic?: string;
}

/**
 * The task's marker status: a regressed or dead marker carries its reason and
 * diagnostic, then done, then running, then pending. A malformed marker reads
 * as no marker.
 */
async function readTaskMarkers(runDir: string, taskNumber: string): Promise<TaskMarkers> {
  const regressedPath = path.join(runDir, 'regressed', `${taskNumber}.md`);
  const regressedContent = await fs.readFile(regressedPath, 'utf8').catch(() => null);
  if (regressedContent !== null) {
    const parsed = parseFrontmatter(regressedContent);
    return {
      status: 'regressed',
      regressedReason: typeof parsed.data.reason === 'string' ? parsed.data.reason : undefined,
      regressedDiagnostic: parsed.body.trim() || undefined,
    };
  }

  const deadPath = path.join(runDir, 'dead', `${taskNumber}.md`);
  const deadContent = await fs.readFile(deadPath, 'utf8').catch(() => null);
  if (deadContent !== null) {
    const parsed = parseFrontmatter(deadContent);
    return {
      status: 'dead',
      deadReason: typeof parsed.data.reason === 'string' ? parsed.data.reason : undefined,
      deadDiagnostic: parsed.body.trim() || undefined,
    };
  }

  const donePath = path.join(runDir, 'done', taskNumber);
  const isDone = await fs
    .stat(donePath)
    .then(() => true)
    .catch(() => false);
  if (isDone) return { status: 'done' };

  const runningPath = path.join(runDir, 'running', `${taskNumber}.pid`);
  const isRunning = await fs
    .stat(runningPath)
    .then(() => true)
    .catch(() => false);
  return { status: isRunning ? 'running' : 'pending' };
}

/** The trimmed result file body, or undefined when absent or empty. */
async function readTaskResult(runDir: string, taskNumber: string): Promise<string | undefined> {
  const resultPath = path.join(runDir, 'results', `${taskNumber}.md`);
  const rawResult = await fs.readFile(resultPath, 'utf8').catch(() => null);
  if (rawResult === null) return undefined;
  return rawResult.trim() || undefined;
}

/** Read each task file with its markers, result and event stream. */
export async function readTaskDetails(
  folderPath: string,
  runDir: string,
  taskEventsMap: ReadonlyMap<string, TimelineEvent[]>,
): Promise<TaskDetail[]> {
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

  const tasks: TaskDetail[] = [];
  for (const taskFileName of taskEntries) {
    const taskNumber = taskFileName.replace(/\.md$/, '');
    const taskPath = path.join(tasksDir, taskFileName);
    const taskContent = await fs.readFile(taskPath, 'utf8');
    const taskData = parseTaskMd(taskContent);
    const markers = await readTaskMarkers(runDir, taskNumber);
    const resultContent = await readTaskResult(runDir, taskNumber);

    tasks.push({
      taskNumber,
      fileName: taskFileName,
      title: taskData.title,
      status: markers.status,
      verify: taskData.verify,
      scope: taskData.scope,
      entry: taskData.entry,
      skills: taskData.skills,
      acceptance: taskData.acceptance,
      deadReason: markers.deadReason,
      deadDiagnostic: markers.deadDiagnostic,
      regressedReason: markers.regressedReason,
      regressedDiagnostic: markers.regressedDiagnostic,
      resultContent,
      events: taskEventsMap.get(taskNumber) || [],
    });
  }
  return tasks;
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
export async function attachTaskScenarios(
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
    if (files.some(isTestPath)) hasTestPath = true;
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
