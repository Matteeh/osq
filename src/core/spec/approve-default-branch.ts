import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import {
  type PlanningObservation,
  findPlanningSessions,
  resolveChangeCreationTime,
} from '../report/planning-observed.js';
import type { LocatedChange } from '../status/change-locations.js';
import { deriveSpecState, readChangeFolder } from '../status/state.js';
import type { SteeringTrigger } from '../status/steering.js';
import { selectVcs } from '../vcs/select.js';
import { mergeDefaultBranch } from './approve-default-branch-merge.js';
import { restartDefaultBranchBranch } from './approve-default-branch-restart.js';
import { confirmApproval, toIso } from './approve-worktree-shared.js';
import type { ApproveOptions, ApproveResult } from './approve.js';
import type { ApprovalDigest } from './digest.js';
import { lintChangeFolder } from './linter.js';

/** Everything the restart and merge paths need after the shared prelude. */
export interface DefaultBranchContext {
  readonly projectRoot: string;
  readonly config: OsqConfig;
  readonly change: LocatedChange;
  readonly specId: string;
  readonly digest: ApprovalDigest;
  readonly mode: 'shown' | 'confirmed';
  readonly observations: readonly PlanningObservation[];
  readonly warnings: readonly string[];
  readonly triggers: readonly SteeringTrigger[];
}

/**
 * Approve a change whose triggers include a default-branch trigger. The
 * shared prelude lints, reviews the digest, and commits the revised plan as
 * `osq: <id> replanned`; a conflict restarts the branch from the default
 * branch and any other trigger merges it in.
 */
export async function approveDefaultBranchSteering(
  projectRoot: string,
  change: LocatedChange,
  config: OsqConfig,
  options: ApproveOptions = {},
): Promise<ApproveResult> {
  const { folderName, folderPath, tree } = change;
  const specId = folderName.match(/^(\d+)/)?.[1] ?? folderName;
  const state = deriveSpecState(await readChangeFolder(tree.root, folderPath));
  const triggers = state.steering ?? [];

  const lintResult = await lintChangeFolder(projectRoot, folderPath, config);
  if (!lintResult.valid) {
    throw new Error(
      `Lint failed for spec "${folderName}":\n  - ${lintResult.errors.join('\n  - ')}`,
    );
  }
  const { digest, mode } = await confirmApproval(projectRoot, folderPath, config, options);

  const author = config.vcs?.author;
  if (author === undefined) throw new Error('vcs.author is required when vcs.enabled is true');
  const vcs = await selectVcs(tree.root, config);
  const relativeFolder = path.relative(tree.root, folderPath).split(path.sep).join('/');
  await vcs.commit([relativeFolder], `osq: ${specId} replanned`, author);

  const observations = await findPlanningSessions(folderPath, {
    createdAt: await resolveChangeCreationTime(folderPath),
    observedAt: toIso(options.now) ?? new Date().toISOString(),
    changesDir: tree.changesDir,
    planning: config.planning ?? DEFAULT_CONFIG.planning,
    readers: options.planningReaders ?? [],
  });

  const context: DefaultBranchContext = {
    projectRoot,
    config,
    change,
    specId,
    digest,
    mode,
    observations,
    warnings: [...lintResult.warnings],
    triggers,
  };
  if (triggers.some((trigger) => trigger.trigger === 'conflict')) {
    return restartDefaultBranchBranch(context);
  }
  return mergeDefaultBranch(context);
}
