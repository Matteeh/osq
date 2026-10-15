/**
 * The planner spawn of an automatic steering run: the run's context, the one
 * adapter spawn, and the outcome decided from the spawn result, the changed
 * plan files and the lint. `auto-steer-run.ts` owns the rest of the run.
 */

import { plannerRunConfig } from '../core/foundation/config-auto-steer.js';
import type { OsqConfig } from '../core/foundation/config.js';
import type { AutoSteerOutcome } from '../core/run/auto-steer-record.js';
import { lintChangeFolder } from '../core/spec/linter.js';
import type { SpecState } from '../core/status/state.js';
import type { getHarnessAdapter } from '../harness/index.js';
import type { SpawnResult, SpawnTaskOptions } from '../harness/types.js';
import type { AutoSteerOptions } from './auto-steer.js';

/** The message of a thrown value. */
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The outcome fields one planner spawn decides. */
export interface OutcomeFields {
  readonly outcome: AutoSteerOutcome;
  readonly exitCode: number | null;
  readonly output?: string;
  readonly recordDetail?: string;
}

/**
 * Decide the outcome from the spawn's result, the changed files and the lint.
 *
 * @scenario watcher-and-harness: Planner outcomes
 * @adr 018
 */
export async function decideOutcome(
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

/** What one automatic steering run needs to spawn its planner. */
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

/**
 * Spawn the steering planner once, with the run's prompt and configuration.
 *
 * @scenario watcher-and-harness: Blocked task gets a revised plan
 * @adr 018
 */
export async function spawnPlanner(
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
