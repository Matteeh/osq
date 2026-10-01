import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import { retrySpec } from '../lifecycle/retry.js';
import {
  appendObservedSessions,
  findPlanningSessions,
  resolveChangeCreationTime,
} from '../report/planning-observed.js';
import { findUnpricedPlanningModels } from '../report/planning-price-gaps.js';
import { resolveOsqPackageVersion } from '../report/planning.js';
import type { LocatedChange } from '../status/change-locations.js';
import { deriveSpecState, readChangeFolder } from '../status/state.js';
import type { SteeringTrigger } from '../status/steering.js';
import { selectVcs } from '../vcs/select.js';
import { worktreeBranch } from '../vcs/worktree.js';
import {
  confirmApproval,
  readBriefHash,
  toIso,
  writeApprovalSeal,
} from './approve-worktree-shared.js';
import type { ApproveOptions, ApproveResult } from './approve.js';
import { hashChangeFolder } from './hasher.js';
import { lintChangeFolder } from './linter.js';

/**
 * Retire each trigger through `retrySpec`, in `deriveSteering` order, then
 * name the first task still not done (`null` when every task is done).
 */
export async function retireSteering(
  projectRoot: string,
  config: OsqConfig,
  change: LocatedChange,
  triggers: readonly SteeringTrigger[],
): Promise<string | null> {
  for (const trigger of triggers) {
    await retrySpec(projectRoot, change.folderName, trigger.target, config);
  }
  const state = deriveSpecState(await readChangeFolder(change.tree.root, change.folderPath));
  return state.tasks.find((task) => task.status !== 'done')?.taskNumber ?? null;
}

/**
 * Approve a worktree change's revised plan where it runs. Lint and the digest
 * read the checkout, the worktree receives the seal and the `osq: <id>
 * approved` commit, and each steering trigger is then retired as `osq retry`
 * would. Nothing is written to the checkout and no branch or worktree is made.
 */
export async function approveSteeredChange(
  projectRoot: string,
  change: LocatedChange,
  config: OsqConfig,
  options: ApproveOptions = {},
): Promise<ApproveResult> {
  const { folderName, folderPath, tree } = change;
  const specId = folderName.match(/^(\d+)/)?.[1] ?? folderName;
  const state = deriveSpecState(await readChangeFolder(tree.root, folderPath));
  // A running target is never approved: never mutate under a live lock.
  if (state.tasks.some((task) => task.status === 'running')) {
    throw new Error(`${folderName} has a task running; approve it after the task ends`);
  }
  const triggers = state.steering ?? [];

  const lintResult = await lintChangeFolder(projectRoot, folderPath, config);
  if (!lintResult.valid) {
    throw new Error(
      `Lint failed for spec "${folderName}":\n  - ${lintResult.errors.join('\n  - ')}`,
    );
  }
  const { digest, mode } = await confirmApproval(projectRoot, folderPath, config, options);

  const observations = await findPlanningSessions(folderPath, {
    createdAt: await resolveChangeCreationTime(folderPath),
    observedAt: toIso(options.now) ?? new Date().toISOString(),
    changesDir: tree.changesDir,
    planning: config.planning ?? DEFAULT_CONFIG.planning,
    readers: options.planningReaders ?? [],
  });
  await appendObservedSessions(folderPath, observations, {
    briefHash: await readBriefHash(folderPath),
    osqVersion: await resolveOsqPackageVersion(),
  });
  const hash = await hashChangeFolder(folderPath);
  await writeApprovalSeal(tree.root, folderPath, config, digest, mode, hash);

  const author = config.vcs?.author;
  if (author === undefined) throw new Error('vcs.author is required when vcs.enabled is true');
  const vcs = await selectVcs(tree.root, config);
  const relativeFolder = path.relative(tree.root, folderPath).split(path.sep).join('/');
  await vcs.commit([relativeFolder], `osq: ${specId} approved`, author);

  const continuesFrom = await retireSteering(projectRoot, config, change, triggers);
  return {
    specId,
    folderName,
    folderPath,
    hash,
    warnings: [...lintResult.warnings],
    planningMatches: observations.length,
    missingPrices: await findUnpricedPlanningModels([folderPath], config.planning?.prices),
    digest,
    worktreePath: tree.root,
    branch: worktreeBranch(folderName),
    ...(continuesFrom !== null ? { continuesFrom } : {}),
  };
}
