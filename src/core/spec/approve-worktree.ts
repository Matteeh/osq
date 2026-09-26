import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import {
  appendObservedSessions,
  findPlanningSessions,
  resolveChangeCreationTime,
} from '../report/planning-observed.js';
import { findUnpricedPlanningModels } from '../report/planning-price-gaps.js';
import { resolveOsqPackageVersion } from '../report/planning.js';
import { scopeCoversPath } from '../run/scope.js';
import { runVerificationCommand } from '../run/verification.js';
import { findChange } from '../status/change-locations.js';
import { selectVcs } from '../vcs/select.js';
import type { Vcs, VcsHead } from '../vcs/vcs.js';
import { worktreeBranch, worktreePath } from '../vcs/worktree.js';
import {
  confirmApproval,
  readBriefHash,
  toIso,
  writeApprovalSeal,
} from './approve-worktree-shared.js';
import type { ApproveOptions, ApproveResult } from './approve.js';
import { hashChangeFolder } from './hasher.js';
import { parseSpecMdFromFolder, parseTaskMd } from './parser.js';

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

/** Refuse when the change's branch already exists. */
async function refuseExistingBranch(vcs: Vcs, branch: string): Promise<void> {
  const branches = await vcs.listBranches(branch);
  if (branches.includes(branch)) throw new Error(`branch ${branch} already exists`);
}

/** Refuse when a `depends_on` change is approved but has not landed. */
async function refuseUnlandedDependencies(
  projectRoot: string,
  config: OsqConfig,
  folderPath: string,
): Promise<void> {
  const proposal = await parseSpecMdFromFolder(folderPath);
  for (const id of proposal?.dependsOn ?? []) {
    const dependency = await findChange(projectRoot, config, id).catch(() => null);
    if (dependency === null) continue;
    const approved = await fs
      .stat(path.join(dependency.folderPath, '.run', 'approved'))
      .then(() => true)
      .catch(() => false);
    if (approved) {
      throw new Error(
        `depends on ${dependency.folderName}, which is approved and has not landed; approve this change after it lands`,
      );
    }
  }
}

/** Run `vcs.prepare` once in the worktree, stopping on a non-zero exit. */
async function runPrepare(worktreeRoot: string, config: OsqConfig, branch: string): Promise<void> {
  const prepare = config.vcs?.prepare;
  if (prepare === undefined) return;
  const result = await runVerificationCommand(
    worktreeRoot,
    prepare,
    config.timeouts.verifyTimeoutSeconds,
    null,
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `prepare failed in worktree ${worktreeRoot} on branch ${branch}:\n${result.output}`,
    );
  }
}

/** Write `.run/base` and `.run/approver` into the worktree's folder copy. */
async function writeProvenance(
  vcs: Vcs,
  worktreeFolder: string,
  base: string | null,
): Promise<void> {
  const runDir = path.join(worktreeFolder, '.run');
  await fs.writeFile(path.join(runDir, 'base'), `${base ?? ''}\n`, 'utf8');
  const [userName, userEmail] = await Promise.all([
    vcs.configValue('user.name'),
    vcs.configValue('user.email'),
  ]);
  await fs.writeFile(
    path.join(runDir, 'approver'),
    `${userName ?? ''} <${userEmail ?? ''}>\n`,
    'utf8',
  );
}

/**
 * Approve a change onto its own branch and linked worktree, writing nothing to
 * the checkout: lint and digest read it, the branch and worktree receive the
 * sealed copy, and the worktree's first commit holds it.
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
  await refuseExistingBranch(vcs, branch);
  await refuseUnlandedDependencies(projectRoot, config, folderPath);

  const hash = await hashChangeFolder(folderPath);
  const { digest, mode } = await confirmApproval(projectRoot, folderPath, config, options);

  const observations = await findPlanningSessions(folderPath, {
    createdAt: await resolveChangeCreationTime(folderPath),
    observedAt: toIso(options.now) ?? new Date().toISOString(),
    changesDir: specsDir,
    planning: config.planning ?? DEFAULT_CONFIG.planning,
    readers: options.planningReaders ?? [],
  });

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

  await appendObservedSessions(worktreeFolder, observations, {
    briefHash: await readBriefHash(folderPath),
    osqVersion: await resolveOsqPackageVersion(),
  });
  await writeApprovalSeal(wtPath, worktreeFolder, config, digest, mode, hash);
  await writeProvenance(vcs, worktreeFolder, head.sha);

  const worktreeVcs = await selectVcs(wtPath, config);
  await worktreeVcs.commit([relativeFolder], `osq: ${specId} approved`, vcsConfig.author);

  return {
    specId,
    folderName,
    folderPath,
    hash,
    warnings: [...warnings],
    planningMatches: observations.length,
    missingPrices: await findUnpricedPlanningModels([worktreeFolder], config.planning?.prices),
    digest,
    worktreePath: wtPath,
    branch,
  };
}
