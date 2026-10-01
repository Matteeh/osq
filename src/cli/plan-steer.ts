import fs from 'node:fs/promises';
import type { OsqConfig } from '../core/foundation/config.js';
import { parseFrontmatter } from '../core/spec/parser.js';
import { type LocatedChange, findChange } from '../core/status/change-locations.js';
import { type SpecState, deriveSpecState, readChangeFolder } from '../core/status/state.js';
import {
  type SteeringTrigger,
  describeTrigger,
  steeringMarkerPath,
} from '../core/status/steering.js';

/** A located change that needs steering, its id, and the prompt section. */
export interface SteeringPlan {
  readonly change: LocatedChange;
  readonly id: string;
  readonly section: string;
}

/** One trigger's heading, evidence line, and marker body inside a fence. */
async function triggerLines(folderPath: string, trigger: SteeringTrigger): Promise<string[]> {
  const markerPath = steeringMarkerPath(folderPath, trigger);
  const content = await fs.readFile(markerPath, 'utf8').catch(() => '');
  const body = parseFrontmatter(content).body.trim();
  return [`### ${describeTrigger(trigger)}`, `Evidence: ${markerPath}`, '', '```', body, '```'];
}

/** The `## Steering` section for one located approved change. */
async function buildSteeringSection(change: LocatedChange, state: SpecState): Promise<string> {
  const lines = ['## Steering', '', 'osq halted this change and asks you to revise its plan.'];
  for (const trigger of state.steering ?? []) {
    lines.push('', ...(await triggerLines(change.folderPath, trigger)));
  }
  const done = state.tasks.filter((task) => task.status === 'done').map((task) => task.taskNumber);
  lines.push(
    '',
    `The change runs in ${change.tree.root}; read its code there. Edit only ${change.folderPath}.`,
    `Done tasks stay done: ${done.length > 0 ? done.join(', ') : 'none'}. Add a task for new work instead of rewriting a done one.`,
    `Run \`osq lint ${state.id}\` and fix every finding. A human runs \`osq approve ${state.id}\`, and the run continues from the first task that is not done.`,
  );
  return lines.join('\n');
}

/**
 * The steering plan for a named change, or null when `findChange` finds none
 * or a checkout change needs no steering. An approved change outside the
 * checkout that needs none is an error: planning must not create a duplicate.
 */
export async function readSteeringPlan(
  projectRoot: string,
  config: OsqConfig,
  name: string,
): Promise<SteeringPlan | null> {
  let change: LocatedChange;
  try {
    change = await findChange(projectRoot, config, name);
  } catch {
    return null;
  }
  const state = deriveSpecState(await readChangeFolder(change.tree.root, change.folderPath));
  if (!state.steering || state.steering.length === 0) {
    const outside =
      change.tree.worktreeFolder !== undefined || change.tree.stackedFolder !== undefined;
    if (outside) {
      throw new Error(
        `${change.folderName} is approved and needs no steering; osq plan ${state.id} reopens an approved change only when it needs steering`,
      );
    }
    return null;
  }
  return { change, id: state.id, section: await buildSteeringSection(change, state) };
}
