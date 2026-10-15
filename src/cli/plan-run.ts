/**
 * `osq plan <id> --run`: start a planner for one change in a detached osq
 * process and return. The detached process re-runs this command in the worker
 * role and does the planning (`plan-run-worker.ts`). Only a human's tap or
 * command starts one, and a human still approves the result.
 */

import { spawn } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { steeringKey, writeAutoSteerRecord } from '../core/run/auto-steer-record.js';
import { readLivePlanner, writePlanRunRecord } from '../core/run/plan-run-record.js';
import { formatPauseUntil } from '../core/run/usage-pause.js';
import { formatNextStep, readNextStep } from '../core/status/next-step.js';
import { canStartPlanner } from '../core/status/plan-run-eligible.js';
import { deriveSpecState } from '../core/status/state.js';
import { resolveChangeFolder } from '../core/web/web-data-folders.js';
import { CommandError } from './command-error.js';
import { resolveInputs } from './command-inputs.js';
import { runPlanWorker } from './plan-run-worker.js';
import type { PlanCommandOptions } from './plan.js';

/** The environment variable the detached child reads to run in the worker role. */
export const PLAN_RUN_ROLE_ENV = 'OSQ_PLAN_RUN_ROLE';

/** Refuse an invalid `--run` option combination before anything is written. */
function validateRunOptions(options: PlanCommandOptions): void {
  if (options.notes !== undefined && options.run !== true) {
    throw new CommandError('Error: `--notes` is valid only with `--run`');
  }
  if (options.run !== true) return;
  const conflicts: readonly [string, boolean][] = [
    ['--print', options.print === true],
    ['--session', options.session === true],
    ['--brief', options.brief !== undefined],
    ['--next', options.next === true],
  ];
  for (const [flag, set] of conflicts) {
    if (set) throw new CommandError(`Error: \`--run\` cannot be combined with \`${flag}\``);
  }
}

/** Spawn the detached worker the way `startBackgroundWatch` spawns its supervisor. */
async function spawnDetachedWorker(
  projectRoot: string,
  folderPath: string,
  id: string,
  notes: string | undefined,
): Promise<number> {
  const log = path.join(folderPath, '.run', 'logs', 'plan-run.log');
  await fs.mkdir(path.dirname(log), { recursive: true });
  const args = [
    ...process.execArgv,
    process.argv[1] ?? '',
    'plan',
    id,
    '--run',
    ...(notes !== undefined ? ['--notes', notes] : []),
  ];
  const fd = fsSync.openSync(log, 'a');
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(process.execPath, args, {
      cwd: projectRoot,
      env: { ...process.env, [PLAN_RUN_ROLE_ENV]: 'worker' },
      detached: true,
      stdio: ['ignore', fd, fd],
    });
  } finally {
    fsSync.closeSync(fd);
  }
  child.unref();
  return child.pid ?? 0;
}

/** Write the `running` record for the change the spawn belongs to. */
async function writeRunningRecord(
  folderPath: string,
  state: Awaited<ReturnType<typeof deriveSpecState>>,
  pid: number,
): Promise<void> {
  const at = new Date().toISOString();
  const triggers = state.steering ?? [];
  if (triggers.length > 0) {
    const key = await steeringKey(folderPath, state.approvedHash ?? '', triggers);
    await writeAutoSteerRecord(folderPath, { key, outcome: 'running', changed: [], at, pid });
    return;
  }
  await writePlanRunRecord(folderPath, { outcome: 'running', changed: [], at, pid });
}

/**
 * Start a planner for one change: resolve it, refuse an ineligible or already
 * planning change, spawn the detached worker, record the `running` state, and
 * print the started line. With the worker role, run the planner here instead
 * and exit zero whatever the outcome.
 *
 * @scenario cli-foundation: Start for an unplanned change
 * @scenario cli-foundation: Start refused while one runs
 * @scenario cli-foundation: Nothing to plan
 * @scenario cli-foundation: Run option combinations
 * @adr 019
 */
export const planRunCommand = async (
  nameOrId: string | undefined,
  options: PlanCommandOptions = {},
): Promise<void> => {
  validateRunOptions(options);
  if ((options.planRunRole ?? process.env[PLAN_RUN_ROLE_ENV]) === 'worker') {
    await runPlanWorker(nameOrId, options).catch(() => undefined);
    return;
  }

  const inputs = resolveInputs(options);
  const config = await inputs.config();
  const projectRoot = inputs.cwd;
  const name = (nameOrId ?? '').trim();
  const resolved = await resolveChangeFolder(projectRoot, name, config);
  const state = await deriveSpecState(projectRoot, resolved.folderPath);

  const live = await readLivePlanner(state);
  if (live !== null) {
    throw new CommandError(
      `Error: a planner is already running for ${resolved.folderKey} since ${formatPauseUntil(live.since)}`,
    );
  }
  const next = await readNextStep(projectRoot, resolved.folderPath, config);
  if (!canStartPlanner(next, resolved.location, config)) {
    throw new CommandError(
      `Error: ${resolved.folderKey} has nothing for a planner to do; its next step is ${formatNextStep(next)}`,
    );
  }

  const spawnWorker =
    options.spawnPlanWorker ??
    ((id: string, notes: string | undefined) =>
      spawnDetachedWorker(projectRoot, resolved.folderPath, id, notes));
  const pid = await spawnWorker(state.id, options.notes);
  await writeRunningRecord(resolved.folderPath, state, pid);
  inputs.stdout(
    `Planner started for ${resolved.folderKey} (pid ${pid}). osq show ${state.id} shows its progress.\n`,
  );
};
