import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import {
  type PlanningObservation,
  appendObservedSessions,
  findPlanningSessions,
  resolveChangeCreationTime,
} from '../report/planning-observed.js';
import { findUnpricedPlanningModels } from '../report/planning-price-gaps.js';
import { resolveOsqPackageVersion } from '../report/planning.js';
import { scopeCoversPath } from '../run/scope.js';
import { runVerificationCommand } from '../run/verification.js';
import { selectVcs } from '../vcs/select.js';
import type { Vcs, VcsHead } from '../vcs/vcs.js';
import { stackedPath, worktreeBranch, worktreePath } from '../vcs/worktree.js';
import { claimBranch } from './approve-branch.js';
import {
  confirmApproval,
  readBriefHash,
  toIso,
  writeApprovalSeal,
} from './approve-worktree-shared.js';
import type { ApproveOptions, ApproveResult } from './approve.js';
import type { ApprovalDigest } from './digest.js';
import { hashChangeFolder } from './hasher.js';
import { parseTaskMd } from './parser.js';
import {
  awaitedDependencies,
  recordStackedApproval,
  writeProvenance,
} from './stack-dependencies.js';

/** Everything the worktree path needs from the checkout's change folder. */
export interface WorktreeApprovalInput {
  readonly specId: string;
  readonly folderName: string;
  readonly folderPath: string;
  readonly specsDir: string;
  readonly config: OsqConfig;
  readonly options: ApproveOptions;
  readonly vcs: Vcs;
  readonly warnings: readonly string[];
}

/** HEAD, refusing a branch other than the default unless `baseOk` is set. */
async function resolveBase(vcs: Vcs, baseOk: boolean | undefined): Promise<VcsHead> {
  const [head, defaultBranch] = await Promise.all([vcs.head(), vcs.defaultBranch()]);
  if (head.branch === defaultBranch || baseOk) return head;
  const actual = head.branch ?? 'a detached HEAD';
  throw new Error(
    `HEAD is on ${actual}, not the default branch ${defaultBranch}; pass --base-ok to approve from it`,
  );
}

/** Every scope entry declared by every task of the change. */
async function readTaskScopes(folderPath: string): Promise<string[]> {
  const tasksDir = path.join(folderPath, 'tasks');
  const files = (await fs.readdir(tasksDir).catch(() => [] as string[]))
    .filter((entry) => entry.endsWith('.md'))
    .sort();
  const scopes: string[] = [];
  for (const file of files) {
    const content = await fs.readFile(path.join(tasksDir, file), 'utf8').catch(() => null);
    if (content !== null) scopes.push(...parseTaskMd(content).scope);
  }
  return scopes;
}

/** Refuse uncommitted checkout changes covered by any task's scope. */
async function refuseDirtyScope(
  folderPath: string,
  vcs: Vcs,
  ignoreDirty: boolean | undefined,
): Promise<void> {
  if (ignoreDirty) return;
  const scopes = await readTaskScopes(folderPath);
  if (scopes.length === 0) return;
  const dirty = new Set<string>();
  for (const entry of await vcs.status()) {
    if (scopeCoversPath(scopes, entry.path)) dirty.add(entry.path);
    if (entry.from !== undefined && scopeCoversPath(scopes, entry.from)) dirty.add(entry.from);
  }
  if (dirty.size === 0) return;
  throw new Error(
    `uncommitted changes in task scope: ${[...dirty].sort().join(', ')}; commit them or pass --ignore-dirty`,
  );
}

/** Run `vcs.prepare` once in the worktree, stopping on a non-zero exit. */
export async function runPrepare(
  worktreeRoot: string,
  config: OsqConfig,
  branch: string,
): Promise<void> {
  const prepare = config.vcs?.prepare;
  if (prepare === undefined) return;
  const result = await runVerificationCommand(
    worktreeRoot,
    prepare,
    config.timeouts.verifyTimeoutSeconds,
    null,
    { role: 'prepare', config },
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `prepare failed in worktree ${worktreeRoot} on branch ${branch}:\n${result.output}`,
    );
  }
}

/** The approval prelude's results that the worktree write needs. */
interface WorktreeApprovalResolved extends WorktreeApprovalInput {
  readonly branch: string;
  readonly head: VcsHead;
  readonly hash: string;
  readonly digest: ApprovalDigest;
  readonly mode: 'shown' | 'confirmed';
  readonly observations: readonly PlanningObservation[];
  readonly author: string;
  readonly keptBranch: string | null;
}

/** Create the branch and worktree, seal the checkout's copy, and commit it. */
async function approveIntoNewWorktree(
  projectRoot: string,
  input: WorktreeApprovalResolved,
): Promise<ApproveResult> {
  const { specId, folderName, folderPath, config, vcs, warnings, branch, head, author } = input;
  const vcsConfig = config.vcs;
  if (vcsConfig === undefined) throw new Error('vcs.enabled is required');

  const repoRoot = (await vcs.root()) ?? projectRoot;
  const wtPath = worktreePath(vcsConfig, repoRoot, folderName);
  await fs.mkdir(path.dirname(wtPath), { recursive: true });
  await vcs.createBranch(branch, head.sha ?? 'HEAD');
  await vcs.worktreeAdd(wtPath, branch);
  await runPrepare(wtPath, config, branch);

  const relativeFolder = path.relative(projectRoot, folderPath).split(path.sep).join('/');
  const worktreeFolder = path.join(wtPath, relativeFolder);
  await fs.rm(worktreeFolder, { recursive: true, force: true });
  await fs.cp(folderPath, worktreeFolder, { recursive: true });
  await appendObservedSessions(worktreeFolder, input.observations, {
    briefHash: await readBriefHash(folderPath),
    osqVersion: await resolveOsqPackageVersion(),
  });
  await writeApprovalSeal(wtPath, worktreeFolder, config, input.digest, input.mode, input.hash);
  await writeProvenance(vcs, worktreeFolder, head.sha);

  const worktreeVcs = await selectVcs(wtPath, config);
  await worktreeVcs.commit([relativeFolder], `osq: ${specId} approved`, author);
  await fs.rm(stackedPath(vcsConfig, repoRoot, folderName), { recursive: true, force: true });

  return {
    specId,
    folderName,
    folderPath,
    hash: input.hash,
    warnings: [...warnings],
    planningMatches: input.observations.length,
    missingPrices: await findUnpricedPlanningModels([worktreeFolder], config.planning?.prices),
    digest: input.digest,
    worktreePath: wtPath,
    branch,
    ...(input.keptBranch !== null ? { keptBranch: input.keptBranch } : {}),
  };
}

/**
 * Approve a change onto its own branch and linked worktree, writing nothing to
 * the checkout: lint and digest read it, the branch and worktree receive the
 * sealed copy, and the worktree's first commit holds it. When any `depends_on`
 * entry is approved or archived, record a stacked approval instead.
 */
export async function approveIntoWorktree(
  projectRoot: string,
  input: WorktreeApprovalInput,
): Promise<ApproveResult> {
  const { specId, folderName, folderPath, specsDir, config, options, vcs, warnings } = input;
  const vcsConfig = config.vcs;
  if (vcsConfig === undefined || vcsConfig.author === undefined) {
    throw new Error('vcs.author is required when vcs.enabled is true');
  }

  const branch = worktreeBranch(folderName);
  const head = await resolveBase(vcs, options.baseOk);
  await refuseDirtyScope(folderPath, vcs, options.ignoreDirty);
  const keptBranch = await claimBranch(vcs, projectRoot, folderPath, folderName);

  const hash = await hashChangeFolder(folderPath);
  const { digest, mode } = await confirmApproval(projectRoot, folderPath, config, options);
  const observations = await findPlanningSessions(folderPath, {
    createdAt: await resolveChangeCreationTime(folderPath),
    observedAt: toIso(options.now) ?? new Date().toISOString(),
    changesDir: specsDir,
    planning: config.planning ?? DEFAULT_CONFIG.planning,
    readers: options.planningReaders ?? [],
  });

  const awaited = await awaitedDependencies(projectRoot, config, vcs, folderPath);
  if (awaited.length > 0) {
    const stacked = await recordStackedApproval({
      projectRoot,
      config,
      vcs,
      folderName,
      folderPath,
      hash,
      digest,
      mode,
      observations,
      awaited,
    });
    return {
      specId,
      folderName,
      folderPath,
      hash,
      warnings: [...warnings],
      planningMatches: observations.length,
      missingPrices: await findUnpricedPlanningModels(
        [stacked.copyFolder],
        config.planning?.prices,
      ),
      digest,
      stackedPath: stacked.path,
      waitingFor: awaited.map((entry) => entry.folder),
      ...(keptBranch !== null ? { keptBranch } : {}),
    };
  }

  return approveIntoNewWorktree(projectRoot, {
    ...input,
    branch,
    head,
    hash,
    digest,
    mode,
    observations,
    author: vcsConfig.author,
    keptBranch,
  });
}
