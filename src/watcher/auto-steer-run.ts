/**
 * The execution half of the automatic steering run: snapshot the tree, spawn
 * the planner once in the change's tree, put back what it wrote outside the
 * plan, lint the plan, and write the record and the `auto_steer_ran` event.
 */

import path from 'node:path';
import { plannerRunConfig } from '../core/foundation/config-auto-steer.js';
import type { OsqConfig } from '../core/foundation/config.js';
import type { Logger } from '../core/foundation/logger.js';
import { type AutoSteerOutcome, writeAutoSteerRecord } from '../core/run/auto-steer-record.js';
import { lintChangeFolder } from '../core/spec/linter.js';
import type { SpecState } from '../core/status/state.js';
import { selectVcs } from '../core/vcs/select.js';
import { getHarnessAdapter } from '../harness/index.js';
import {
  type AutoSteerRanEventData,
  type SpawnResult,
  type SpawnTaskOptions,
  appendHarnessEvent,
} from '../harness/types.js';
import { diffPlanFiles, snapshotPlanFiles } from './auto-steer-plan.js';
import type { AutoSteerOptions } from './auto-steer.js';
import { restoreTreeExcept, snapshotValidatorTree } from './validator-guard.js';

interface OutcomeFields {
  readonly outcome: AutoSteerOutcome;
  readonly exitCode: number | null;
  readonly output?: string;
  readonly recordDetail?: string;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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

async function decideOutcome(
  spawn: SpawnResult | null,
  thrown: string | null,
  changed: readonly string[],
  projectRoot: string,
  folderPath: string,
  config: OsqConfig,
): Promise<OutcomeFields> {
  if (thrown !== null) {
    return { outcome: 'failed', exitCode: null, output: thrown, recordDetail: thrown };
  }
  const result = spawn as SpawnResult;
  if (result.timedOut === true) {
    const text = result.error ?? '';
    return {
      outcome: 'timed_out',
      exitCode: result.exitCode,
      ...(text.length > 0 ? { output: text, recordDetail: text } : {}),
    };
  }
  if (result.exitCode !== 0) {
    const text = result.error ?? '';
    return {
      outcome: 'failed',
      exitCode: result.exitCode,
      ...(text.length > 0 ? { output: text, recordDetail: text } : {}),
    };
  }
  if (changed.length === 0) return { outcome: 'unchanged', exitCode: result.exitCode };
  const lint = await lintChangeFolder(projectRoot, folderPath, config);
  if (lint.valid) return { outcome: 'ready', exitCode: result.exitCode };
  return {
    outcome: 'lint_red',
    exitCode: result.exitCode,
    output: lint.errors.join('\n'),
    recordDetail: lint.errors.map((entry) => `- ${entry}`).join('\n'),
  };
}

export interface RunContext {
  readonly treeRoot: string;
  readonly folderPath: string;
  readonly state: SpecState;
  readonly projectRoot: string;
  readonly config: OsqConfig;
  readonly options: AutoSteerOptions;
  readonly harness: string;
  readonly model: string;
  readonly triggers: readonly string[];
  readonly key: string;
  readonly prompt: string;
  readonly timeoutSeconds: number;
}

async function spawnPlanner(
  context: RunContext,
  adapter: ReturnType<typeof getHarnessAdapter>,
): Promise<{
  readonly result: SpawnResult | null;
  readonly thrown: string | null;
  readonly duration: number;
}> {
  const spawn: SpawnTaskOptions = {
    projectRoot: context.treeRoot,
    specFolderPath: context.folderPath,
    taskNumber: 'planner',
    taskTitle: 'Steering planner',
    verifyCommand: '',
    scope: [],
    entry: [],
    skills: [],
    tier: 'smart',
    timeoutSeconds: context.timeoutSeconds,
    config: plannerRunConfig(context.config),
    ...(context.options.logger !== undefined ? { logger: context.options.logger } : {}),
    prompt: context.prompt,
  };
  const started = Date.now();
  let result: SpawnResult | null = null;
  let thrown: string | null = null;
  try {
    result = await adapter.spawn(spawn);
  } catch (error) {
    thrown = message(error);
  }
  return { result, thrown, duration: Math.max(0, (Date.now() - started) / 1000) };
}

/**
 * Run the planner once and record the outcome. The plan edits stay whatever
 * the outcome.
 * @scenario watcher-and-harness: Blocked task gets a revised plan
 * @scenario watcher-and-harness: Planner outcomes
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
