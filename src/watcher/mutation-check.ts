/**
 * The mutation check the watcher runs right after a passing task: pick the
 * covered functions the task changed or newly tested, run the project's
 * mutation command for each pick under one shared budget, and append one
 * `mutation_ran` event per pick. Observe only: it never fails the task,
 * changes a marker, or requests a retry.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_TRACEABILITY_CONFIG,
  type TraceabilityConfig,
} from '../core/foundation/config-traceability.js';
import type { OsqConfig } from '../core/foundation/config.js';
import type { Logger } from '../core/foundation/logger.js';
import { type MutationRunResult, runMutationPick } from '../core/run/mutation-run.js';
import { buildImportGraph } from '../core/spec/import-graph.js';
import { parseTaskMd } from '../core/spec/parser.js';
import {
  type MeasuresView,
  type MutationPick,
  pickMutations,
} from '../core/trace/mutation-pick.js';
import { buildScenarioIndex } from '../core/trace/scenario-index.js';
import {
  type MutationRanEventData,
  type MutationSurvivor,
  appendHarnessEvent,
} from '../harness/types.js';

/** A mutation reason, including the budget one the check itself owns. */
type CheckReason = NonNullable<MutationRunResult['reason']> | 'budget';

/** One pick's event-ready result, with the budget outcome included. */
interface CheckResult {
  readonly outcome: 'measured' | 'not_measured';
  readonly reason?: CheckReason;
  readonly killed: number;
  readonly survived: number;
  readonly invalid: number;
  readonly survivors: readonly MutationSurvivor[];
  readonly duration: number;
  readonly exitCode: number | null;
  readonly output: string;
}

/** A pick the spent budget never let run. */
const BUDGET_RESULT: CheckResult = {
  outcome: 'not_measured',
  reason: 'budget',
  killed: 0,
  survived: 0,
  invalid: 0,
  survivors: [],
  duration: 0,
  exitCode: null,
  output: '',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True when the configuration opts at least one capability in. */
function hasOptedInCapability(traceability: TraceabilityConfig): boolean {
  return traceability.capabilities === 'all' || traceability.capabilities.length > 0;
}

/** The two `MeasuresView` fields a pick reads, extracted from one event. */
function measuresView(data: Record<string, unknown>): MeasuresView {
  return {
    ...(isRecord(data.functionHashes)
      ? { functionHashes: data.functionHashes as Record<string, string | null> }
      : {}),
    ...(isRecord(data.scopeHashes)
      ? {
          scopeHashes: data.scopeHashes as Record<
            string,
            { before: string | null; after: string | null }
          >,
        }
      : {}),
  };
}

/** The task's latest start and end `measures` views; either may be absent. */
export async function latestMeasures(
  specFolderPath: string,
  taskNumber: string,
): Promise<{ start: MeasuresView | null; end: MeasuresView | null }> {
  const raw = await fs
    .readFile(path.join(specFolderPath, '.run', 'events', `${taskNumber}.jsonl`), 'utf8')
    .catch(() => '');
  let start: MeasuresView | null = null;
  let end: MeasuresView | null = null;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (event.type !== 'measures' || !isRecord(event.data)) continue;
    const view = measuresView(event.data);
    if (event.data.phase === 'start') start = view;
    else if (event.data.phase === 'end') end = view;
  }
  return { start, end };
}

/** Fold one pick's result into the `mutation_ran` payload. */
export function mutationEvent(pick: MutationPick, result: CheckResult): MutationRanEventData {
  const carriesOutput = result.reason === 'command_failed' || result.reason === 'timed_out';
  return {
    file: pick.file,
    function: pick.function,
    ranges: [...(pick.ranges ?? [])],
    scenarios: [...pick.scenarios],
    tests: [...pick.tests],
    outcome: result.outcome,
    killed: result.killed,
    survived: result.survived,
    invalid: result.invalid,
    survivors: [...result.survivors],
    duration: result.duration,
    exitCode: result.exitCode,
    ...(result.reason !== undefined ? { reason: result.reason } : {}),
    ...(carriesOutput ? { output: result.output } : {}),
  };
}

/** Run the picks in order, each under the budget left, and record each one. */
async function runPicks(
  projectRoot: string,
  specFolderPath: string,
  taskNumber: string,
  picks: readonly MutationPick[],
  command: string,
  budgetSeconds: number,
): Promise<void> {
  const deadline = Date.now() + budgetSeconds * 1000;
  for (const pick of picks) {
    const remaining = (deadline - Date.now()) / 1000;
    const result =
      remaining <= 0
        ? BUDGET_RESULT
        : await runMutationPick(pick, projectRoot, specFolderPath, command, remaining);
    await appendHarnessEvent(specFolderPath, taskNumber, {
      type: 'mutation_ran',
      timestamp: new Date().toISOString(),
      data: mutationEvent(pick, result),
    });
  }
}

/**
 * Run the mutation check for one passing task. Nothing happens unless
 * `traceability.mutation` is set and a capability is opted in. Every error is
 * caught, logged, and swallowed: the task's done state, markers, and retries
 * are never touched.
 */
export async function runMutationCheck(
  projectRoot: string,
  specFolderPath: string,
  taskNumber: string,
  config: OsqConfig,
  logger?: Logger,
): Promise<void> {
  const traceability = config.traceability ?? DEFAULT_TRACEABILITY_CONFIG;
  const mutation = traceability.mutation;
  if (mutation === undefined || !hasOptedInCapability(traceability)) return;
  try {
    const taskContent = await fs
      .readFile(path.join(specFolderPath, 'tasks', `${taskNumber}.md`), 'utf8')
      .catch(() => null);
    if (taskContent === null) return;
    const taskData = parseTaskMd(taskContent);
    const graph = await buildImportGraph(projectRoot, { skip: [config.paths.openspecRoot] });
    const index = buildScenarioIndex(projectRoot, graph);
    const { start, end } = await latestMeasures(specFolderPath, taskNumber);
    const picks = await pickMutations({
      projectRoot,
      index,
      traceability,
      scope: taskData.scope,
      start,
      end,
    });
    await runPicks(
      projectRoot,
      specFolderPath,
      taskNumber,
      picks,
      mutation.command,
      mutation.budgetSeconds,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger?.warn(`mutation check failed: ${message}`);
  }
}
