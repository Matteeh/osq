/**
 * The execution half of the automatic steering run: snapshot the tree, spawn
 * the planner once in the change's tree, put back what it wrote outside the
 * plan, lint the plan, and write the record and the `auto_steer_ran` event.
 */

import path from 'node:path';
import type { Logger } from '../core/foundation/logger.js';
import { type AutoSteerOutcome, writeAutoSteerRecord } from '../core/run/auto-steer-record.js';
import { selectVcs } from '../core/vcs/select.js';
import { getHarnessAdapter } from '../harness/index.js';
import { type AutoSteerRanEventData, appendHarnessEvent } from '../harness/types.js';
import { diffPlanFiles, snapshotPlanFiles } from './auto-steer-plan.js';
import { type RunContext, decideOutcome, spawnPlanner } from './planner-spawn.js';
import { restoreTreeExcept, snapshotValidatorTree } from './validator-guard.js';

/**
 * Append the change-level `auto_steer_ran` event.
 * @scenario watcher-and-harness: Blocked task gets a revised plan
 * @adr 018
 */
export async function appendAutoSteerEvent(
  folderPath: string,
  data: AutoSteerRanEventData,
): Promise<void> {
  await appendHarnessEvent(folderPath, 'change', {
    type: 'auto_steer_ran',
    timestamp: new Date().toISOString(),
    data,
  });
}

/** Leave the plan, the planner's harness events, and the record alone. */
function planKeep(treeRoot: string, folderPath: string): (relative: string) => boolean {
  const folder = path.relative(treeRoot, folderPath).split(path.sep).join('/');
  const prefix = `${folder}/`;
  const events = `${prefix}.run/events/planner.jsonl`;
  const record = `${prefix}.run/auto-steer.md`;
  return (relative) => {
    if (relative === events || relative === record) return true;
    if (!relative.startsWith(prefix)) return false;
    return !relative.slice(prefix.length).startsWith('.run/');
  };
}

/**
 * Run the planner once and record the outcome. The plan edits stay whatever
 * the outcome.
 * @scenario watcher-and-harness: Blocked task gets a revised plan
 * @scenario watcher-and-harness: Planner outcomes
 * @scenario watcher-and-harness: Running record names its process
 * @adr 018
 */
export async function executeRun(context: RunContext): Promise<AutoSteerOutcome> {
  const { treeRoot, folderPath, state, projectRoot, config, options } = context;
  const vcs = await selectVcs(treeRoot, config);
  const snapshot = await snapshotValidatorTree(treeRoot, vcs);
  const planBefore = await snapshotPlanFiles(folderPath);
  await writeAutoSteerRecord(folderPath, {
    key: context.key,
    outcome: 'running',
    changed: [],
    at: new Date().toISOString(),
    pid: process.pid,
  });

  const adapter = options.plannerAdapter ?? getHarnessAdapter(context.harness);
  const run = await spawnPlanner(context, adapter);
  const restored = await restoreTreeExcept(treeRoot, vcs, snapshot, planKeep(treeRoot, folderPath));
  const changed = await diffPlanFiles(folderPath, planBefore);
  const fields = await decideOutcome(
    run.result,
    run.thrown,
    changed,
    projectRoot,
    folderPath,
    config,
  );

  await writeAutoSteerRecord(folderPath, {
    key: context.key,
    outcome: fields.outcome,
    changed,
    at: new Date().toISOString(),
    ...(fields.recordDetail !== undefined ? { detail: fields.recordDetail } : {}),
  });
  await appendAutoSteerEvent(folderPath, {
    outcome: fields.outcome,
    harness: context.harness,
    model: context.model,
    duration: run.duration,
    exitCode: fields.exitCode,
    triggers: [...context.triggers],
    changed,
    restored,
    ...(fields.output !== undefined ? { output: fields.output } : {}),
  });
  options.logger?.info(`spec ${state.id} automatic planner ${fields.outcome}`);
  return fields.outcome;
}

/** What a failure record needs, without the whole run context. */
export interface FailureContext {
  readonly harness: string;
  readonly model: string;
  readonly triggers: readonly string[];
  readonly key: string;
  readonly specId: string;
  readonly logger?: Logger;
}

/**
 * Record a prompt that could not be built: a `failed` record whose body is the
 * error's message, with an `auto_steer_ran` event. Nothing is spawned.
 * @scenario watcher-and-harness: Prompt cannot be built
 * @adr 018
 */
export async function recordFailure(
  folderPath: string,
  context: FailureContext,
  text: string,
): Promise<AutoSteerOutcome> {
  await writeAutoSteerRecord(folderPath, {
    key: context.key,
    outcome: 'failed',
    changed: [],
    at: new Date().toISOString(),
    detail: text,
  });
  await appendAutoSteerEvent(folderPath, {
    outcome: 'failed',
    harness: context.harness,
    model: context.model,
    duration: 0,
    exitCode: null,
    triggers: [...context.triggers],
    changed: [],
    restored: [],
    output: text,
  });
  context.logger?.info(`spec ${context.specId} automatic planner failed`);
  return 'failed';
}
