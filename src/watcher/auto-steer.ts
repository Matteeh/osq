/**
 * The automatic steering run. When a change needs steering and `autoSteer` is
 * on, the watcher runs the planner once on the same prompt `osq plan <id>`
 * builds, in the change's own tree. osq puts back every path the planner wrote
 * outside the plan, lists the plan files it changed, lints the plan, and
 * records the outcome. The planner never approves, and a human still does.
 */

import { DEFAULT_AUTO_STEER_TIMEOUT_SECONDS } from '../core/foundation/config-auto-steer.js';
import type { OsqConfig } from '../core/foundation/config.js';
import {
  resolveHarnessModel,
  resolvePlannerSelection,
} from '../core/foundation/harness-catalog.js';
import type { Logger } from '../core/foundation/logger.js';
import {
  type AutoSteerOutcome,
  type AutoSteerRecord,
  readAutoSteerRecord,
  steeringKey,
  writeAutoSteerRecord,
} from '../core/run/auto-steer-record.js';
import { isProcessAlive } from '../core/run/watch-state.js';
import type { LocatedChange } from '../core/status/change-locations.js';
import type { SpecState } from '../core/status/state.js';
import { describeTrigger, isDefaultBranchTrigger } from '../core/status/steering.js';
import type { HarnessAdapter } from '../harness/types.js';
import { appendAutoSteerEvent, executeRun, recordFailure } from './auto-steer-run.js';

/** Builds the prompt `osq plan <id>` would print, or null when nothing steers. */
export type SteeringPromptBuilder = (
  projectRoot: string,
  config: OsqConfig,
  id: string,
) => Promise<string | null>;

/** What a watcher pass passes to `runAutoSteer`. */
export interface AutoSteerOptions {
  readonly steeringPrompt?: SteeringPromptBuilder;
  readonly plannerAdapter?: HarnessAdapter;
  readonly logger?: Logger;
}

const INTERRUPTED = 'interrupted: the watcher stopped during the run';

/** Whether another process is running this trigger's planner right now. */
function plannerStillRunning(record: AutoSteerRecord): boolean {
  return record.outcome === 'running' && record.pid !== undefined && isProcessAlive(record.pid);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Run the steering planner once for a change that needs steering, or return
 * null when `autoSteer` is off, no prompt builder was given, the change is not
 * approved, a trigger needs the default branch, or the current key already has
 * a record. The planner's plan edits stay whatever the outcome.
 *
 * @scenario watcher-and-harness: Blocked task gets a revised plan
 * @scenario watcher-and-harness: One run per trigger
 * @scenario watcher-and-harness: Off by default
 * @scenario watcher-and-harness: Default-branch trigger waits for a human
 * @scenario watcher-and-harness: Planner outcomes
 * @scenario watcher-and-harness: Prompt cannot be built
 * @scenario watcher-and-harness: Interrupted run
 * @scenario watcher-and-harness: Planner running elsewhere
 * @adr 018
 */
export async function runAutoSteer(
  projectRoot: string,
  change: LocatedChange,
  state: SpecState,
  config: OsqConfig,
  options: AutoSteerOptions,
): Promise<AutoSteerOutcome | null> {
  const autoSteer = config.autoSteer;
  const triggers = state.steering ?? [];
  if (autoSteer?.enabled !== true) return null;
  if (options.steeringPrompt === undefined) return null;
  if (state.approvedHash === null || triggers.length === 0) return null;
  if (triggers.some(isDefaultBranchTrigger)) return null;

  const { folderPath, tree } = change;
  const selection = resolvePlannerSelection(config);
  const harness = selection.harness;
  const model = selection.model ?? resolveHarnessModel(harness, config);
  const triggerTexts = triggers.map(describeTrigger);
  const key = await steeringKey(folderPath, state.approvedHash, triggers);

  const existing = await readAutoSteerRecord(folderPath);
  if (existing !== null && existing.key === key) {
    if (existing.outcome !== 'running' || plannerStillRunning(existing)) return null;
    await writeAutoSteerRecord(folderPath, {
      key,
      outcome: 'failed',
      changed: [...existing.changed],
      at: new Date().toISOString(),
      detail: INTERRUPTED,
    });
    await appendAutoSteerEvent(folderPath, {
      outcome: 'failed',
      harness,
      model,
      duration: 0,
      exitCode: null,
      triggers: [...triggerTexts],
      changed: [...existing.changed],
      restored: [],
      output: INTERRUPTED,
    });
    options.logger?.info(`spec ${state.id} automatic planner failed`);
    return 'failed';
  }

  let prompt: string | null;
  try {
    prompt = await options.steeringPrompt(projectRoot, config, state.id);
  } catch (error) {
    return recordFailure(
      folderPath,
      {
        harness,
        model,
        triggers: triggerTexts,
        key,
        specId: state.id,
        ...(options.logger !== undefined ? { logger: options.logger } : {}),
      },
      message(error),
    );
  }
  if (prompt === null) return null;

  return executeRun({
    treeRoot: tree.root,
    folderPath,
    state,
    projectRoot,
    config,
    options,
    harness,
    model,
    triggers: triggerTexts,
    key,
    prompt,
    timeoutSeconds: autoSteer.timeoutSeconds ?? DEFAULT_AUTO_STEER_TIMEOUT_SECONDS,
  });
}
