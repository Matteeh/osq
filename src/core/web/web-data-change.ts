import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import { resolveScope } from '../run/scope.js';
import { getSpecDetailsFromFolder } from '../status/show.js';
import { deriveSpecState } from '../status/state.js';
import { numericIdOf, resolveChangeFolder, slugOf } from './web-data-folders.js';
import {
  readBriefMetadata,
  readManifestMetadata,
  readPlannerAttribution,
  readRejection,
} from './web-data-lifecycle.js';
import { observeTaskFile } from './web-data-observations.js';
import type { WebChange, WebRecertification, WebResolvedScope, WebTask } from './web-data-types.js';

function groupRecertifications(
  details: Awaited<ReturnType<typeof getSpecDetailsFromFolder>>,
): Map<string, WebRecertification[]> {
  const grouped = new Map<string, WebRecertification[]>();
  for (const row of details.recertifications) {
    const entry: WebRecertification = {
      taskNumber: row.taskNumber,
      timestamp: row.timestamp,
      outcome: row.outcome,
      actor: 'human',
      differingPaths: row.differingPaths,
      attribution: row.attribution.map((item) => ({
        path: item.path,
        attribution: item.attribution,
      })),
      verify: row.verify,
      exitCode: row.exitCode,
      timedOut: row.timedOut,
    };
    const rows = grouped.get(row.taskNumber) ?? [];
    rows.push(entry);
    grouped.set(row.taskNumber, rows);
  }
  return grouped;
}

function webTasks(
  details: Awaited<ReturnType<typeof getSpecDetailsFromFolder>>,
  recertifications: Map<string, WebRecertification[]>,
  taskObservations: Map<
    string,
    {
      attempts: number;
      cost: number | null;
      costCoverage: { reported: number; total: number };
      duration: number | null;
    }
  >,
  resolvedScopes: Map<string, WebResolvedScope[]>,
  lockStarts: Map<string, number>,
  nowMs: number,
): WebTask[] {
  const tasks: WebTask[] = [];
  for (const task of details.tasks) {
    const observation = taskObservations.get(task.taskNumber) ?? {
      attempts: 0,
      cost: null,
      costCoverage: { reported: 0, total: 0 },
      duration: null,
    };
    const startedAt = task.status === 'running' ? lockStarts.get(task.taskNumber) : undefined;
    const runningStart = startedAt !== undefined ? new Date(startedAt).toISOString() : null;
    const runningElapsedSeconds =
      startedAt !== undefined ? Math.max(0, Math.round((nowMs - startedAt) / 1000)) : null;
    tasks.push({
      taskNumber: task.taskNumber,
      title: task.title,
      declaredScope: [...task.scope],
      resolvedScope: resolvedScopes.get(task.taskNumber) ?? [],
      acceptance: [...task.acceptance],
      verify: task.verify,
      state: task.status,
      attempts: observation.attempts,
      reason: task.deadReason ?? task.regressedReason ?? null,
      runningStart,
      runningElapsedSeconds,
      duration: observation.duration,
      cost: observation.cost,
      costCoverage: observation.costCoverage,
      recertifications: recertifications.get(task.taskNumber) ?? [],
      result: task.resultContent ?? null,
    });
  }
  return tasks;
}

/**
 * Resolves one unambiguous active, archived, or rejected change by numeric id
 * or folder key and returns its proposal, brief, and task-level evidence.
 * Missing or malformed optional history becomes null or empty without hiding
 * valid sibling evidence.
 */
export async function getWebChange(
  projectRoot: string,
  selector: string,
  config: OsqConfig = DEFAULT_CONFIG,
  now: Date = new Date(),
): Promise<WebChange> {
  const folder = await resolveChangeFolder(projectRoot, selector, config);
  const details = await getSpecDetailsFromFolder(
    projectRoot,
    folder.folderPath,
    folder.location,
    config,
  );
  const brief = await readBriefMetadata(folder.folderPath);
  const manifest = await readManifestMetadata(folder.folderPath);
  const planner = await readPlannerAttribution(brief, manifest);

  const taskObservations = new Map<
    string,
    {
      attempts: number;
      cost: number | null;
      costCoverage: { reported: number; total: number };
      duration: number | null;
    }
  >();
  const resolvedScopes = new Map<string, WebResolvedScope[]>();
  const lockStarts = new Map<string, number>();
  for (const task of details.tasks) {
    taskObservations.set(
      task.taskNumber,
      await observeTaskFile(folder.folderPath, task.taskNumber),
    );
    resolvedScopes.set(task.taskNumber, await resolveScope(projectRoot, task.scope));
  }
  const derived = await deriveSpecState(projectRoot, folder.folderPath).catch(() => null);
  for (const task of derived?.tasks ?? []) {
    if (task.status === 'running' && task.lock)
      lockStarts.set(task.taskNumber, task.lock.startedAt);
  }

  return {
    folderKey: folder.folderKey,
    id: numericIdOf(folder.folderKey),
    slug: slugOf(folder.folderKey),
    title: details.title || folder.folderKey,
    state: folder.location,
    location: folder.location,
    planner,
    brief: brief.body,
    goal: details.goal,
    rejection: folder.location === 'rejected' ? await readRejection(folder.folderPath) : null,
    dependsOn: [...details.dependsOn],
    reads: [...details.features.reads],
    writes: [...details.features.writes],
    asOf: now.toISOString(),
    tasks: webTasks(
      details,
      groupRecertifications(details),
      taskObservations,
      resolvedScopes,
      lockStarts,
      now.getTime(),
    ),
  };
}
