/**
 * The CLI's implementation of the watcher's `AutopilotCommands` port: each
 * method calls the command function `osq` runs, with no-op writers so nothing
 * autopilot does reaches stdout or stderr. The watcher cannot import `src/cli/`,
 * so this file builds the port and `osq watch` hands it in.
 */

import type { OsqConfig } from '../core/foundation/config.js';
import type { PlanningSessionReader } from '../core/report/planning-observed.js';
import type { HarnessAdapter } from '../harness/types.js';
import type { AutopilotCommands } from '../watcher/autopilot.js';
import { approveCommand } from './approve.js';
import type { Writer } from './command-inputs.js';
import { landCommand } from './land.js';
import { planCommand } from './plan.js';

/** Test seams for the commands autopilot calls, all optional. */
export interface AutopilotCommandOptions {
  /** Runs `plan <id>` in process instead of starting a detached planner. */
  readonly adapter?: HarnessAdapter;
  /** Approve's local planning readers; defaults to the real ones. */
  readonly planningReaders?: readonly PlanningSessionReader[];
  /** Land's stale-build bypass, for tests. */
  readonly allowStale?: boolean;
  /** Land's injectable home for the after-land record, for tests. */
  readonly home?: string;
}

const noop: Writer = () => {};

/**
 * Build the port from `planCommand`, `approveCommand` and `landCommand`, with
 * output discarded.
 *
 * @scenario cli-foundation: Autopilot runs the command functions
 * @adr 019
 * @adr 021
 */
export function createAutopilotCommands(
  cwd: string,
  config: OsqConfig,
  options: AutopilotCommandOptions = {},
): AutopilotCommands {
  const base = { cwd, config, stdout: noop, stderr: noop };
  return {
    planNext: () => planCommand(undefined, { ...base, next: true }),
    plan: (id) =>
      options.adapter === undefined
        ? planCommand(id, { ...base, run: true })
        : planCommand(id, { ...base, run: true, planRunRole: 'worker', adapter: options.adapter }),
    approve: (id) =>
      approveCommand([id], {
        ...base,
        ...(options.planningReaders !== undefined
          ? { planningReaders: options.planningReaders }
          : {}),
      }),
    land: (id) =>
      landCommand(id, {
        ...base,
        ...(options.allowStale !== undefined ? { allowStale: options.allowStale } : {}),
        ...(options.home !== undefined ? { home: options.home } : {}),
      }),
  };
}
