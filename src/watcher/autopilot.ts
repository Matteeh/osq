/**
 * The autopilot pass. With `autopilot.enabled`, the watcher takes one step
 * after each cycle: it reads the file-derived view, takes the one next step
 * through the command functions the CLI hands in, records the marker autopilot
 * owns, and writes the one stop record a human resumes from. `src/watcher/`
 * cannot import `src/cli/`, so the port lives here and the CLI hands in its
 * implementation, as `watch-service.ts` hands in `buildSteeringPrompt`.
 */

import type { Logger } from '../core/foundation/logger.js';
import { updateAutopilotMarker, writeAutopilotMarker } from '../core/status/autopilot-marker.js';
import { type AutopilotStep, autopilotStep } from '../core/status/autopilot-step.js';
import {
  clearAutopilotStop,
  readAutopilotStop,
  writeAutopilotStop,
} from '../core/status/autopilot-stop.js';
import type { AutopilotStopReason } from '../core/status/autopilot-stop.js';
import { readAutopilotView } from '../core/status/autopilot-view.js';
import { readQueueApproval } from '../core/status/queue-approval.js';
import { readQueueState } from '../core/status/queue-state.js';

/** The command functions autopilot calls; each throws what its command throws. */
export interface AutopilotCommands {
  /** `osq plan --next`: create the next queue item's change folder. */
  planNext(): Promise<void>;
  /** `osq plan <id> --run`: start the planner; its outcome lands in `.run/plan-run.md`. */
  plan(id: string): Promise<void>;
  /** `osq approve <id>`, with no override flag. */
  approve(id: string): Promise<void>;
  /** `osq land <id>`. */
  land(id: string): Promise<void>;
}

/** What one pass needs from the watcher. */
export interface AutopilotPassOptions {
  readonly logger?: Logger;
}

const TAKES: ReadonlySet<string> = new Set(['plan-next', 'plan', 'approve', 'land']);

/** The stop reason and command a command's failure maps to. */
function failureFor(step: AutopilotStep): { reason: AutopilotStopReason; command: string } {
  const id = step.change ?? step.item ?? '';
  if (step.kind === 'plan-next') return { reason: 'plan_refused', command: 'osq plan --next' };
  if (step.kind === 'plan') return { reason: 'planner_not_ready', command: `osq plan ${id}` };
  if (step.kind === 'approve') return { reason: 'approve_refused', command: `osq approve ${id}` };
  return { reason: 'land_stopped', command: `osq land ${id}` };
}

/** The stop's detail: the error's message, else its exit code. */
function detailOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.length > 0) return message;
  const exitCode = (error as { exitCode?: unknown } | null)?.exitCode;
  return typeof exitCode === 'number' ? `exit code ${exitCode}` : '';
}

/** Whether a stop record names the same item and change the step does. */
function sameTarget(
  stop: { readonly item: string; readonly change?: string },
  step: AutopilotStep,
): boolean {
  return stop.item === (step.item ?? '') && (stop.change ?? null) === (step.change ?? null);
}

/** Whether an existing stop already records this step. */
function sameStop(
  stop: {
    readonly reason: string;
    readonly item: string;
    readonly change?: string;
    readonly command: string;
  },
  step: AutopilotStep,
): boolean {
  return (
    stop.reason === step.reason && sameTarget(stop, step) && stop.command === (step.command ?? '')
  );
}

/** Write the one stop record for a step and log it. */
async function writeStop(
  projectRoot: string,
  config: Parameters<typeof writeAutopilotStop>[1],
  step: AutopilotStep,
  reason: AutopilotStopReason,
  command: string,
  detail: string,
  logger: Logger | undefined,
): Promise<void> {
  await writeAutopilotStop(projectRoot, config, {
    reason,
    item: step.item ?? '',
    ...(step.change !== null ? { change: step.change } : {}),
    command,
    at: new Date().toISOString(),
    ...(detail.length > 0 ? { detail } : {}),
  });
  logger?.info(`autopilot: stopped ${reason} (${step.item ?? ''}) — ${command}`);
}

/** The new change a `plan-next` step just created, through the queue state. */
async function findNewChange(
  projectRoot: string,
  config: Parameters<typeof readQueueState>[1],
  slug: string,
): Promise<string | null> {
  const snapshot = await readQueueState(projectRoot, config);
  return snapshot.groups.get(slug)?.active[0]?.folderPath ?? null;
}

/**
 * Take autopilot's next step once. Returns whether it took a `plan-next`,
 * `plan`, `approve` or `land` step, so the caller can cycle again.
 *
 * @scenario watcher-and-harness: Approved queue lands in order
 * @scenario watcher-and-harness: Autopilot off
 * @scenario watcher-and-harness: Restart mid-queue
 * @scenario watcher-and-harness: Edited item stops the queue
 * @scenario watcher-and-harness: Planner not ready stops the queue
 * @scenario watcher-and-harness: A stopped land is not retried
 * @scenario watcher-and-harness: A failed land with an exit code
 * @scenario watcher-and-harness: A human's step clears the stop
 * @scenario cli-foundation: Autopilot runs the command functions
 * @adr 019
 * @adr 021
 */
export async function runAutopilotPass(
  projectRoot: string,
  config: Parameters<typeof readAutopilotView>[1],
  commands: AutopilotCommands,
  options: AutopilotPassOptions = {},
): Promise<boolean> {
  const { logger } = options;
  const view = await readAutopilotView(projectRoot, config);
  const step = autopilotStep(view);
  const existing = await readAutopilotStop(projectRoot, config);
  const takes = TAKES.has(step.kind);

  if (existing !== null && takes && sameTarget(existing, step)) return false;

  if (step.kind === 'stop') {
    if (existing !== null && sameStop(existing, step)) return false;
    if (existing !== null) await clearAutopilotStop(projectRoot, config);
    await writeStop(
      projectRoot,
      config,
      step,
      step.reason ?? 'queue_unreadable',
      step.command ?? '',
      step.detail,
      logger,
    );
    return false;
  }

  if (existing !== null) await clearAutopilotStop(projectRoot, config);
  if (!takes) return false;

  const folderPath = view.firstOpenItem?.change?.folderPath ?? null;
  const at = new Date().toISOString();

  try {
    if (step.kind === 'plan-next') {
      await commands.planNext();
      const created =
        step.item === null ? null : await findNewChange(projectRoot, config, step.item);
      if (created === null) {
        await writeStop(projectRoot, config, step, 'plan_refused', 'osq plan --next', '', logger);
        return false;
      }
      const approval = await readQueueApproval(projectRoot, config);
      await writeAutopilotMarker(created, {
        item: step.item ?? '',
        queueApproval: approval?.hash ?? '',
        createdAt: at,
      });
      logger?.info(`autopilot: plan-next ${step.item ?? ''} created ${created}`);
      return true;
    }
    if (step.kind === 'plan') {
      if (folderPath !== null) await updateAutopilotMarker(folderPath, { plannerStartedAt: at });
      await commands.plan(step.change ?? '');
      logger?.info(`autopilot: plan ${step.change ?? ''}`);
      return true;
    }
    if (step.kind === 'approve') {
      if (folderPath !== null) await updateAutopilotMarker(folderPath, { approvedAt: at });
      await commands.approve(step.change ?? '');
      logger?.info(`autopilot: approve ${step.change ?? ''}`);
      return true;
    }
    await commands.land(step.change ?? '');
    logger?.info(`autopilot: land ${step.change ?? ''}`);
    return true;
  } catch (error) {
    const { reason, command } = failureFor(step);
    await writeStop(projectRoot, config, step, reason, command, detailOf(error), logger);
    return false;
  }
}
