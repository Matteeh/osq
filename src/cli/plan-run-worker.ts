/**
 * The planner run's worker. A change that needs steering runs the planner in
 * its own tree through `executeRun`, as the watcher's automatic run does; any
 * other change plans in a scratch worktree, and only the plan files move back.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_AUTO_STEER_TIMEOUT_SECONDS } from '../core/foundation/config-auto-steer.js';
import type { OsqConfig } from '../core/foundation/config.js';
import {
  resolveHarnessModel,
  resolvePlannerSelection,
} from '../core/foundation/harness-catalog.js';
import { steeringKey } from '../core/run/auto-steer-record.js';
import { writePlanRunRecord } from '../core/run/plan-run-record.js';
import { hashChangeFolder } from '../core/spec/hasher.js';
import type { LocatedChange } from '../core/status/change-locations.js';
import { type SpecState, deriveSpecState } from '../core/status/state.js';
import { findSteeringChange } from '../core/status/steering-change.js';
import { type SteeringTrigger, describeTrigger } from '../core/status/steering.js';
import { selectVcs } from '../core/vcs/select.js';
import { resolveChangeFolder } from '../core/web/web-data-folders.js';
import { getHarnessAdapter } from '../harness/index.js';
import type { HarnessAdapter } from '../harness/types.js';
import { diffPlanFiles, snapshotPlanFiles } from '../watcher/auto-steer-plan.js';
import { executeRun, recordFailure } from '../watcher/auto-steer-run.js';
import { type RunContext, decideOutcome, spawnPlanner } from '../watcher/planner-spawn.js';
import { resolveInputs } from './command-inputs.js';
import {
  type ScratchTree,
  appendPlannerEvents,
  copyBackPlanFiles,
  createScratchTree,
  removeScratchTree,
} from './plan-scratch.js';
import { buildSteeringPrompt } from './plan-steer-prompt.js';
import type { PlanCommandOptions } from './plan.js';

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Append the human's notes as the prompt's trailing section. */
function withNotes(prompt: string, notes: string | undefined): string {
  if (notes === undefined) return prompt;
  return `${prompt}\n\n## Notes from the human\n\n${notes}`;
}

/** The planner identity, timeout, and adapter every run shares. */
interface PlannerSelectionArgs {
  readonly projectRoot: string;
  readonly config: OsqConfig;
  readonly harness: string;
  readonly model: string;
  readonly timeoutSeconds: number;
  readonly adapter: HarnessAdapter;
  readonly notes: string | undefined;
}

interface PlanTarget {
  readonly folderPath: string;
  readonly folderName: string;
  readonly state: SpecState;
}

/** Resolve the change the worker plans for; `findSteeringChange` first. */
async function resolveTarget(
  projectRoot: string,
  config: OsqConfig,
  name: string,
  found: Awaited<ReturnType<typeof findSteeringChange>>,
): Promise<PlanTarget> {
  if (found !== null) {
    return {
      folderPath: found.change.folderPath,
      folderName: found.change.folderName,
      state: found.state,
    };
  }
  const resolved = await resolveChangeFolder(projectRoot, name, config);
  return {
    folderPath: resolved.folderPath,
    folderName: resolved.folderKey,
    state: await deriveSpecState(projectRoot, resolved.folderPath),
  };
}

/**
 * Run the steering planner in the change's own tree.
 * @scenario cli-foundation: Steered in place
 * @scenario cli-foundation: Notes reach the prompt
 * @adr 019
 */
async function runSteeringPlan(
  args: PlannerSelectionArgs,
  change: LocatedChange,
  state: SpecState,
  triggers: readonly SteeringTrigger[],
): Promise<void> {
  const triggerTexts = triggers.map(describeTrigger);
  const key = await steeringKey(change.folderPath, state.approvedHash ?? '', triggers);
  const context = {
    harness: args.harness,
    model: args.model,
    triggers: triggerTexts,
    key,
    specId: state.id,
  };
  let prompt: string | null;
  try {
    prompt = await buildSteeringPrompt(args.projectRoot, args.config, state.id);
  } catch (error) {
    await recordFailure(change.folderPath, context, message(error));
    return;
  }
  if (prompt === null) {
    await recordFailure(change.folderPath, context, `${state.folderName} needs no steering`);
    return;
  }
  await executeRun({
    treeRoot: change.tree.root,
    folderPath: change.folderPath,
    state,
    projectRoot: args.projectRoot,
    config: args.config,
    options: { plannerAdapter: args.adapter },
    harness: args.harness,
    model: args.model,
    triggers: triggerTexts,
    key,
    prompt: withNotes(prompt, args.notes),
    timeoutSeconds: args.timeoutSeconds,
  }).catch(async (error: unknown) => {
    await recordFailure(change.folderPath, context, message(error));
  });
}

/** Run one planner in the scratch tree and write the change folder's record. */
async function runScratchPlan(args: PlannerSelectionArgs, target: PlanTarget): Promise<void> {
  const { projectRoot, config } = args;
  const vcs = await selectVcs(projectRoot, config);
  const before = await snapshotPlanFiles(target.folderPath);
  await writePlanRunRecord(target.folderPath, {
    outcome: 'running',
    changed: [],
    at: new Date().toISOString(),
    pid: process.pid,
  });
  let scratch: ScratchTree | null = null;
  try {
    scratch = await createScratchTree({
      projectRoot,
      config,
      vcs,
      folderPath: target.folderPath,
      folderName: target.folderName,
    });
    const { planCommand } = await import('./plan.js');
    await planCommand(target.state.id, {
      cwd: scratch.root,
      config,
      stdout: () => {},
      stderr: () => {},
    });
    const stepThree = await snapshotPlanFiles(scratch.folderPath);
    const prompt = await fs.readFile(path.join(scratch.folderPath, 'plan-prompt.md'), 'utf8');
    const context: RunContext = {
      treeRoot: scratch.root,
      folderPath: scratch.folderPath,
      state: target.state,
      projectRoot,
      config,
      options: { plannerAdapter: args.adapter },
      harness: args.harness,
      model: args.model,
      triggers: [],
      key: '',
      prompt: withNotes(prompt, args.notes),
      timeoutSeconds: args.timeoutSeconds,
    };
    const run = await spawnPlanner(context, args.adapter);
    const copied = await copyBackPlanFiles(target.folderPath, scratch.folderPath, before);
    await appendPlannerEvents(target.folderPath, scratch.folderPath);
    const plannerChanged = await diffPlanFiles(scratch.folderPath, stepThree);
    const fields = await decideOutcome(
      run.result,
      run.thrown,
      plannerChanged,
      projectRoot,
      target.folderPath,
      config,
    );
    const hash = await hashChangeFolder(target.folderPath);
    await writePlanRunRecord(target.folderPath, {
      outcome: fields.outcome,
      changed: copied,
      at: new Date().toISOString(),
      hash,
      ...(fields.recordDetail !== undefined ? { detail: fields.recordDetail } : {}),
    });
  } catch (error) {
    await writePlanRunRecord(target.folderPath, {
      outcome: 'failed',
      changed: [],
      at: new Date().toISOString(),
      detail: message(error),
    });
  } finally {
    if (scratch !== null) await removeScratchTree(vcs, scratch.root);
  }
}

/**
 * Run one planner for the change in this process and write its outcome. The
 * process never approves, runs a task, or commits.
 * @scenario cli-foundation: Planned in a scratch tree
 * @scenario cli-foundation: Scratch planner outcomes
 * @scenario cli-foundation: Steered in place
 * @scenario cli-foundation: Notes reach the prompt
 * @adr 019
 */
export async function runPlanWorker(
  nameOrId: string | undefined,
  options: PlanCommandOptions,
): Promise<void> {
  const inputs = resolveInputs(options);
  const config = await inputs.config();
  const projectRoot = inputs.cwd;
  const name = (nameOrId ?? '').trim();
  const selection = resolvePlannerSelection(config);
  const args: PlannerSelectionArgs = {
    projectRoot,
    config,
    harness: selection.harness,
    model: selection.model ?? resolveHarnessModel(selection.harness, config),
    timeoutSeconds: config.autoSteer?.timeoutSeconds ?? DEFAULT_AUTO_STEER_TIMEOUT_SECONDS,
    adapter: options.adapter ?? getHarnessAdapter(selection.harness),
    notes: options.notes,
  };

  const found = await findSteeringChange(projectRoot, config, name);
  const triggers = found?.state.steering ?? [];
  if (found !== null && triggers.length > 0) {
    await runSteeringPlan(args, found.change, found.state, triggers);
    return;
  }
  await runScratchPlan(args, await resolveTarget(projectRoot, config, name, found));
}
