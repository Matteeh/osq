import fs from 'node:fs/promises';
import type { OsqConfig } from '../core/foundation/config.js';
import { parseCapabilitySpec } from '../core/spec/delta.js';
import { parseFrontmatter } from '../core/spec/parser.js';
import type { LocatedChange } from '../core/status/change-locations.js';
import type { SpecState } from '../core/status/state.js';
import { findSteeringChange } from '../core/status/steering-change.js';
import {
  type SteeringTrigger,
  describeTrigger,
  isDefaultBranchTrigger,
  steeringMarkerPath,
} from '../core/status/steering.js';
import { selectVcs } from '../core/vcs/select.js';
import { readRequirementsBase } from '../core/vcs/sync-files.js';
import { changedRequirements, livingSpecPath } from '../core/vcs/sync-specs.js';
import type { Vcs } from '../core/vcs/vcs.js';

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

/** One requirement's full text at the default branch, or null when removed. */
async function defaultRequirementText(
  vcs: Vcs,
  config: OsqConfig,
  defaultBranch: string,
  capability: string,
  requirement: string,
): Promise<string | null> {
  const content = await vcs.show(defaultBranch, livingSpecPath(config, capability));
  if (content === null) return null;
  const spec = parseCapabilitySpec(content);
  return spec.requirements.find((entry) => entry.name === requirement)?.raw ?? null;
}

/** The `####` requirement blocks a `requirement_changed` trigger adds. */
async function requirementLines(
  change: LocatedChange,
  config: OsqConfig,
  vcs: Vcs,
  defaultBranch: string,
): Promise<string[]> {
  const base = await readRequirementsBase(change.folderPath);
  const changed = await changedRequirements(vcs, change.folderPath, base, defaultBranch, config);
  const lines: string[] = [];
  for (const entry of changed) {
    lines.push('', `#### ${entry.capability}: ${entry.requirement} on ${defaultBranch}`, '');
    const raw = await defaultRequirementText(
      vcs,
      config,
      defaultBranch,
      entry.capability,
      entry.requirement,
    );
    if (raw === null) {
      lines.push(`Removed on ${defaultBranch}.`);
      continue;
    }
    lines.push('```', raw, '```');
  }
  return lines;
}

/** The `## Steering` section for one located approved change. */
async function buildSteeringSection(
  change: LocatedChange,
  state: SpecState,
  config: OsqConfig,
): Promise<string> {
  const triggers = state.steering ?? [];
  const hasDefault = triggers.some(isDefaultBranchTrigger);
  const conflict = triggers.some((trigger) => trigger.trigger === 'conflict');
  const vcs = hasDefault ? await selectVcs(change.tree.root, config) : null;
  const defaultBranch = vcs ? await vcs.defaultBranch() : '';

  const lines = ['## Steering', '', 'osq halted this change and asks you to revise its plan.'];
  for (const trigger of triggers) {
    lines.push('', ...(await triggerLines(change.folderPath, trigger)));
    if (trigger.trigger === 'requirement_changed' && vcs !== null) {
      lines.push(...(await requirementLines(change, config, vcs, defaultBranch)));
    }
  }
  const done = state.tasks.filter((task) => task.status === 'done').map((task) => task.taskNumber);
  lines.push(
    '',
    `The change runs in ${change.tree.root}; read its code there. Edit only ${change.folderPath}.`,
  );
  if (hasDefault) {
    lines.push(
      conflict
        ? `Approval restarts osq/${change.folderName} from ${defaultBranch}, and every task runs again.`
        : `Approval merges ${defaultBranch} into osq/${change.folderName} without running verify; add a task that makes the merged tree pass.`,
    );
  }
  lines.push(
    conflict
      ? 'Every task runs again after the restart. Revise any task the conflict shows is wrong.'
      : `Done tasks stay done: ${done.length > 0 ? done.join(', ') : 'none'}. Add a task for new work instead of rewriting a done one.`,
    `Run \`osq lint ${state.id}\` and fix every finding. A human runs \`osq approve ${state.id}\`, and the run continues from the first task that is not done.`,
  );
  return lines.join('\n');
}

/**
 * The steering plan for a named change, or null when `findSteeringChange`
 * finds none or a checkout change needs no steering. An approved change outside
 * the checkout that needs none is an error: planning must not create a duplicate.
 */
export async function readSteeringPlan(
  projectRoot: string,
  config: OsqConfig,
  name: string,
): Promise<SteeringPlan | null> {
  const found = await findSteeringChange(projectRoot, config, name);
  if (found === null) return null;
  const { change, state } = found;
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
  return { change, id: state.id, section: await buildSteeringSection(change, state, config) };
}
