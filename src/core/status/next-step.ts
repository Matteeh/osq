import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { parseHumanSteps } from '../spec/human-steps.js';
import { analyzeVerifyCommand } from '../spec/linter.js';
import { parseFrontmatter } from '../spec/parser.js';
import { locateFolder } from './change-locations.js';
import { deriveSpecState, readChangeFolder } from './state.js';
import { readVerification } from './verification.js';

/** What one change folder needs next. */
export type NextStepState =
  | 'unplanned'
  | 'ready-for-approval'
  | 'dead'
  | 'blocked'
  | 'running'
  | 'verification-pending'
  | 'landed';

export interface NextStep {
  readonly state: NextStepState;
  readonly command: string | null;
  readonly detail: string | null;
}

async function changeHasBrief(folderPath: string): Promise<boolean> {
  return fs
    .stat(path.join(folderPath, 'brief.md'))
    .then(() => true)
    .catch(() => false);
}

async function readActiveNextStep(projectRoot: string, folderPath: string): Promise<NextStep> {
  const snapshot = await readChangeFolder(projectRoot, folderPath);
  const state = deriveSpecState(snapshot);
  const id = state.id;

  if (!state.approvedHash) {
    const verify = snapshot.spec.verify.trim();
    const analysis = verify ? await analyzeVerifyCommand(projectRoot, verify, new Set()) : null;
    if (!verify || analysis?.placeholder) {
      const command = (await changeHasBrief(folderPath)) ? `osq plan ${id}` : `osq lint ${id}`;
      return { state: 'unplanned', command, detail: null };
    }
    const steps = parseHumanSteps(parseFrontmatter(snapshot.spec.raw).body);
    return {
      state: 'ready-for-approval',
      command: `osq approve ${id}`,
      detail: steps.beforeApproval ? 'do the steps before approval first' : null,
    };
  }

  const deadTask = state.tasks.find(
    (task) => task.status === 'dead' || task.status === 'regressed',
  );
  if (state.status === 'dead' || state.status === 'regressed' || deadTask) {
    const command = deadTask
      ? `osq retry ${id} ${deadTask.taskNumber}`
      : `osq reject ${id} --reason <text>`;
    return { state: 'dead', command, detail: null };
  }

  if (state.status === 'blocked' || snapshot.unmetDependencies.size > 0) {
    const unmet = [...snapshot.unmetDependencies];
    return {
      state: 'blocked',
      command: `osq show ${unmet[0]}`,
      detail: `waiting for ${unmet.join(', ')}`,
    };
  }

  return { state: 'running', command: `osq show ${id}`, detail: null };
}

async function readArchivedNextStep(folderPath: string): Promise<NextStep> {
  const folderName = path.basename(folderPath);
  const id = folderName.match(/^(\d+)/)?.[1] ?? folderName;
  const verification = await readVerification(folderPath);

  if (!verification.required || verification.outcome === 'passed') {
    return { state: 'landed', command: null, detail: null };
  }

  const needsCheck = verification.check !== null && !verification.checkRanSinceArchive;
  return {
    state: 'verification-pending',
    command: needsCheck ? `osq check ${id}` : `osq verified ${id} --passed|--failed`,
    detail: verification.outcome === 'failed' ? 'failed' : null,
  };
}

/**
 * One state and the command that moves a change forward. A folder directly
 * under the configured archive directory is archived; every other folder is
 * judged by its current marker state.
 */
export async function readNextStep(
  projectRoot: string,
  folderPath: string,
  config: OsqConfig,
): Promise<NextStep> {
  const located = await locateFolder(projectRoot, config, folderPath);
  if (located?.location === 'archived') {
    return readArchivedNextStep(folderPath);
  }
  return readActiveNextStep(projectRoot, folderPath);
}

/** Render a next step with spaces for hyphens, its detail, and its command. */
export function formatNextStep(step: NextStep): string {
  let text = step.state.replace(/-/g, ' ');
  if (step.detail) text += ` (${step.detail})`;
  if (step.command) text += ` — ${step.command}`;
  return text;
}
