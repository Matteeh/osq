import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { parseHumanSteps } from '../spec/human-steps.js';
import { analyzeVerifyCommand } from '../spec/linter.js';
import { parseFrontmatter } from '../spec/parser.js';
import { readDependencyState } from '../spec/stack-dependencies.js';
import { selectVcs } from '../vcs/select.js';
import { type LocatedChange, locateFolder } from './change-locations.js';
import { deriveSpecState, readChangeFolder } from './state.js';

/** What one change folder needs next. */
export type NextStepState =
  | 'unplanned'
  | 'ready-for-approval'
  | 'dead'
  | 'blocked'
  | 'running'
  | 'archived'
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

  if (state.steering && state.steering.length > 0) {
    return { state: 'dead', command: `osq plan ${id}`, detail: 'needs steering' };
  }

  const deadTask = state.tasks.find(
    (task) => task.status === 'dead' || task.status === 'regressed',
  );
  if (state.status === 'dead' || state.status === 'regressed' || deadTask) {
    const command = deadTask ? `osq retry ${id} ${deadTask.taskNumber}` : `osq retry ${id} change`;
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

async function readArchivedNextStep(
  projectRoot: string,
  located: LocatedChange,
  config: OsqConfig,
): Promise<NextStep> {
  const state = deriveSpecState(await readChangeFolder(located.tree.root, located.folderPath));
  if ((state.steering?.length ?? 0) > 0) {
    return { state: 'dead', command: `osq plan ${state.id}`, detail: 'needs steering' };
  }
  if (config.vcs?.enabled === true) {
    const vcs = await selectVcs(projectRoot, config);
    if (vcs.kind === 'git') {
      const dependency = await readDependencyState(projectRoot, config, vcs, located.folderName);
      if (dependency.state !== 'landed') {
        return { state: 'archived', command: `osq land ${state.id}`, detail: 'not landed' };
      }
    }
  }
  return { state: 'landed', command: null, detail: null };
}

/**
 * One state and the command that moves a change forward. A folder directly
 * under the configured archive directory is archived; every other folder is
 * judged by its current marker state.
 *
 * @scenario status-inspection: Archived change the default branch does not hold
 * @scenario status-inspection: Archived change the default branch holds
 * @scenario status-inspection: Archived change without version control
 * @scenario status-inspection: Archived change that needs steering
 */
export async function readNextStep(
  projectRoot: string,
  folderPath: string,
  config: OsqConfig,
): Promise<NextStep> {
  const located = await locateFolder(projectRoot, config, folderPath);
  if (located?.location === 'archived') {
    return readArchivedNextStep(projectRoot, located, config);
  }
  return readActiveNextStep(projectRoot, folderPath);
}

/**
 * Render a next step with spaces for hyphens, its detail, and its command.
 *
 * @scenario status-inspection: Steering format
 * @scenario status-inspection: Failed verification
 * @scenario status-inspection: Not landed format
 */
export function formatNextStep(step: NextStep): string {
  let text = step.state.replace(/-/g, ' ');
  if (step.detail) text += ` (${step.detail})`;
  if (step.command) text += ` — ${step.command}`;
  return text;
}
