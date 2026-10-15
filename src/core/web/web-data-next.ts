import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { formatPlanPasteBlock } from '../foundation/plan-handoff.js';
import { type AutoSteerOutcome, currentAutoSteer } from '../run/auto-steer-record.js';
import { currentPlanRun } from '../run/plan-run-record.js';
import { type NextStep, readNextStep } from '../status/next-step.js';
import { deriveSpecState } from '../status/state.js';
import type { WebLocation } from './web-data-types.js';

/** The plan paste block for a change and whether its prompt file exists. */
export interface WebPlanHandoff {
  readonly text: string;
  readonly promptReady: boolean;
}

/** The current automatic planner's record for an active change. */
export interface WebAutoSteer {
  readonly outcome: AutoSteerOutcome;
  readonly changed: readonly string[];
}

/** The planner run a change carries: its outcome, start time and detail. */
export interface WebPlanRun {
  readonly outcome: AutoSteerOutcome;
  /** The record's `at` while the outcome is `running`; else null. */
  readonly startedAt: string | null;
  /** The record's body, or null. */
  readonly detail: string | null;
}

/** The four fields the change page reads to choose its next move. */
export interface WebChangeNext {
  readonly nextStep: NextStep | null;
  readonly planHandoff: WebPlanHandoff | null;
  readonly autoSteer: WebAutoSteer | null;
  readonly planRun: WebPlanRun | null;
}

async function hasPromptFile(folderPath: string): Promise<boolean> {
  const stat = await fs.stat(path.join(folderPath, 'plan-prompt.md')).catch(() => null);
  return stat?.isFile() ?? false;
}

/**
 * The next step, plan paste block, automatic planner record and planner run of
 * one change. Reuses `readNextStep`, `formatPlanPasteBlock`, `deriveSpecState`,
 * `currentAutoSteer` and `currentPlanRun`; a rejected change gets all null, and
 * a thrown state or next step reads as null.
 *
 * @scenario web-inspection: Change documents carry the next step
 * @scenario web-inspection: Running planner in the document
 * @scenario web-inspection: Finished planner in the document
 * @scenario web-inspection: No planner run
 * @adr 013
 * @adr 019
 */
export async function readWebChangeNext(
  projectRoot: string,
  folderPath: string,
  location: WebLocation,
  config: OsqConfig,
): Promise<WebChangeNext> {
  if (location === 'rejected') {
    return { nextStep: null, planHandoff: null, autoSteer: null, planRun: null };
  }
  const nextStep = await readNextStep(projectRoot, folderPath, config).catch(() => null);
  const planHandoff: WebPlanHandoff = {
    text: formatPlanPasteBlock(folderPath),
    promptReady: await hasPromptFile(folderPath),
  };
  let autoSteer: WebAutoSteer | null = null;
  let planRun: WebPlanRun | null = null;
  if (location === 'active') {
    const state = await deriveSpecState(projectRoot, folderPath).catch(() => null);
    if (state !== null) {
      const record = await currentAutoSteer(state);
      if (record !== null) {
        autoSteer = { outcome: record.outcome, changed: [...record.changed] };
      }
      const run = await currentPlanRun(state);
      if (run !== null) {
        planRun = {
          outcome: run.outcome,
          startedAt: run.outcome === 'running' ? run.at : null,
          detail: run.detail,
        };
      }
    }
  }
  return { nextStep, planHandoff, autoSteer, planRun };
}
