import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { formatPlanPasteBlock } from '../foundation/plan-handoff.js';
import { type AutoSteerOutcome, currentAutoSteer } from '../run/auto-steer-record.js';
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

/** The three fields the change page reads to choose its next move. */
export interface WebChangeNext {
  readonly nextStep: NextStep | null;
  readonly planHandoff: WebPlanHandoff | null;
  readonly autoSteer: WebAutoSteer | null;
}

async function hasPromptFile(folderPath: string): Promise<boolean> {
  const stat = await fs.stat(path.join(folderPath, 'plan-prompt.md')).catch(() => null);
  return stat?.isFile() ?? false;
}

/**
 * The next step, plan paste block, and automatic planner record of one change.
 * Reuses `readNextStep`, `formatPlanPasteBlock`, `deriveSpecState` and
 * `currentAutoSteer`; a rejected change gets all null, and a thrown next step
 * reads as null.
 *
 * @scenario web-inspection: Change documents carry the next step
 * @adr 013
 */
export async function readWebChangeNext(
  projectRoot: string,
  folderPath: string,
  location: WebLocation,
  config: OsqConfig,
): Promise<WebChangeNext> {
  if (location === 'rejected') {
    return { nextStep: null, planHandoff: null, autoSteer: null };
  }
  const nextStep = await readNextStep(projectRoot, folderPath, config).catch(() => null);
  const planHandoff: WebPlanHandoff = {
    text: formatPlanPasteBlock(folderPath),
    promptReady: await hasPromptFile(folderPath),
  };
  let autoSteer: WebAutoSteer | null = null;
  if (location === 'active') {
    const state = await deriveSpecState(projectRoot, folderPath).catch(() => null);
    if (state !== null) {
      const record = await currentAutoSteer(state);
      if (record !== null) {
        autoSteer = { outcome: record.outcome, changed: [...record.changed] };
      }
    }
  }
  return { nextStep, planHandoff, autoSteer };
}
