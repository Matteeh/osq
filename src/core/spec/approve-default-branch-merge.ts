import fs from 'node:fs/promises';
import path from 'node:path';
import { refreshRecertifiedDoneMarker } from '../lifecycle/recertify.js';
import { appendObservedSessions } from '../report/planning-observed.js';
import { findUnpricedPlanningModels } from '../report/planning-price-gaps.js';
import { resolveOsqPackageVersion } from '../report/planning.js';
import { computeTaskScopeHash, readDoneMarker } from '../run/scope-hash.js';
import type { LocatedChange } from '../status/change-locations.js';
import { selectVcs } from '../vcs/select.js';
import { syncWithDefaultBranch } from '../vcs/sync-main.js';
import { rebuildLivingSpecs } from '../vcs/sync-specs.js';
import { SyncStop } from '../vcs/sync-stop.js';
import { worktreeBranch } from '../vcs/worktree.js';
import {
  defaultBranchResult,
  restartDefaultBranchBranch,
} from './approve-default-branch-restart.js';
import type { DefaultBranchContext } from './approve-default-branch.js';
import { retireSteering } from './approve-steer.js';
import { readBriefHash, writeApprovalSeal } from './approve-worktree-shared.js';
import type { ApproveResult } from './approve.js';
import { hashChangeFolder } from './hasher.js';
import { parseTaskMd } from './parser.js';

/** Move an archived folder into the worktree's changes directory. */
async function moveToChanges(
  changesDir: string,
  folderName: string,
  currentPath: string,
): Promise<string> {
  const target = path.join(changesDir, folderName);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.rename(currentPath, target);
  return target;
}

/** Refresh every done marker whose scope hash differs on the merged tree. */
async function refreshMergedDoneMarkers(worktreeRoot: string, folderPath: string): Promise<void> {
  const runDir = path.join(folderPath, '.run');
  const doneDir = path.join(runDir, 'done');
  for (const taskNumber of await fs.readdir(doneDir).catch(() => [])) {
    if (!/^\d+$/.test(taskNumber)) continue;
    const done = await readDoneMarker(runDir, taskNumber);
    if (done === null) continue;
    const content = await fs
      .readFile(path.join(folderPath, 'tasks', `${taskNumber}.md`), 'utf8')
      .catch(() => null);
    if (content === null) continue;
    const current = await computeTaskScopeHash(worktreeRoot, parseTaskMd(content).scope);
    if (done.scopeHash === current.hash) continue;
    await refreshRecertifiedDoneMarker(runDir, taskNumber, done.scopeHash, current);
  }
}

/**
 * Merge the default branch into the change's branch through the sync's own
 * code with verify off, keep done tasks, and retire the triggers. A merge
 * that conflicts restarts the change instead.
 */
export async function mergeDefaultBranch(context: DefaultBranchContext): Promise<ApproveResult> {
  const { projectRoot, config, change, specId, digest, mode, observations, triggers } = context;
  const { folderName, tree } = change;
  const worktreeRoot = tree.root;
  const branch = worktreeBranch(folderName);
  const author = config.vcs?.author;
  if (author === undefined) throw new Error('vcs.author is required when vcs.enabled is true');

  const vcs = await selectVcs(worktreeRoot, config);
  const rootVcs = await selectVcs(projectRoot, config);
  const defaultBranch = await vcs.defaultBranch();
  const baseSha = (await rootVcs.head()).sha;

  const archived = change.location !== 'active';
  const oldFolderPath = change.folderPath;
  const folderPath = archived
    ? await moveToChanges(tree.changesDir, folderName, oldFolderPath)
    : oldFolderPath;
  const activeChange: LocatedChange = { folderName, folderPath, location: 'active', tree };

  await rebuildLivingSpecs(worktreeRoot, activeChange, vcs, defaultBranch, config, false, []);
  await fs.writeFile(
    path.join(folderPath, '.run', 'requirements-base'),
    `${baseSha ?? ''}\n`,
    'utf8',
  );
  await appendObservedSessions(folderPath, observations, {
    briefHash: await readBriefHash(folderPath),
    osqVersion: await resolveOsqPackageVersion(),
  });
  const hash = await hashChangeFolder(folderPath);
  await writeApprovalSeal(worktreeRoot, folderPath, config, digest, mode, hash);
  const relativeFolder = path.relative(worktreeRoot, folderPath).split(path.sep).join('/');
  const staged = archived
    ? [relativeFolder, path.relative(worktreeRoot, oldFolderPath).split(path.sep).join('/')]
    : [relativeFolder];
  await vcs.stage(staged);
  await vcs.commit([], `osq: ${specId} approved`, author);

  try {
    await syncWithDefaultBranch(projectRoot, config, activeChange, undefined, { skipVerify: true });
  } catch (error) {
    if (error instanceof SyncStop && error.reason === 'sync_conflict') {
      return restartDefaultBranchBranch({ ...context, change: activeChange });
    }
    throw error;
  }

  await refreshMergedDoneMarkers(worktreeRoot, folderPath);
  const continuesFrom = await retireSteering(projectRoot, config, activeChange, triggers);
  return {
    ...defaultBranchResult(context, folderPath, hash),
    missingPrices: await findUnpricedPlanningModels([folderPath], config.planning?.prices),
    worktreePath: worktreeRoot,
    branch,
    merged: { defaultBranch },
    ...(continuesFrom !== null ? { continuesFrom } : {}),
  };
}
