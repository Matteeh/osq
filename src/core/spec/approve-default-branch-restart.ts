import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { appendObservedSessions } from '../report/planning-observed.js';
import { findUnpricedPlanningModels } from '../report/planning-price-gaps.js';
import { resolveOsqPackageVersion } from '../report/planning.js';
import { deriveSpecState, readChangeFolder } from '../status/state.js';
import { selectVcs } from '../vcs/select.js';
import type { Vcs } from '../vcs/vcs.js';
import { worktreeBranch } from '../vcs/worktree.js';
import type { DefaultBranchContext } from './approve-default-branch.js';
import { readBriefHash, writeApprovalSeal } from './approve-worktree-shared.js';
import { runPrepare } from './approve-worktree.js';
import type { ApproveResult } from './approve.js';
import { hashChangeFolder } from './hasher.js';
import { writeProvenance } from './stack-dependencies.js';

/** The lowest free `osq/<folder>-restarted-<n>`, counting from 1. */
async function nextKeptBranch(vcs: Vcs, branch: string): Promise<string> {
  const taken = new Set(await vcs.listBranches(`${branch}-restarted-`));
  let n = 1;
  while (taken.has(`${branch}-restarted-${n}`)) n += 1;
  return `${branch}-restarted-${n}`;
}

/** Copy the revised folder into a fresh temporary directory. */
async function copyAside(folderPath: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-restart-'));
  const dest = path.join(dir, 'change');
  await fs.cp(folderPath, dest, { recursive: true });
  return dest;
}

/** Keep only `events/` and `plan.jsonl` under the folder's `.run/`. */
async function trimRunDir(folderPath: string): Promise<void> {
  const runDir = path.join(folderPath, '.run');
  for (const entry of await fs.readdir(runDir).catch(() => [])) {
    if (entry === 'events' || entry === 'plan.jsonl') continue;
    await fs.rm(path.join(runDir, entry), { recursive: true, force: true });
  }
}

/** The result fields every default-branch approval shares. */
export function defaultBranchResult(
  context: DefaultBranchContext,
  folderPath: string,
  hash: string,
) {
  return {
    specId: context.specId,
    folderName: context.change.folderName,
    folderPath,
    hash,
    warnings: [...context.warnings],
    planningMatches: context.observations.length,
    digest: context.digest,
  };
}

/**
 * Restart the change: keep the revised plan's old branch under
 * `osq/<folder>-restarted-<n>`, cut `osq/<folder>` from the default branch's
 * tip, and place the revised folder with a fresh seal. Every task runs again.
 */
export async function restartDefaultBranchBranch(
  context: DefaultBranchContext,
): Promise<ApproveResult> {
  const { projectRoot, config, change, specId, digest, mode, observations } = context;
  const { folderName, tree } = change;
  const worktreeRoot = tree.root;
  const branch = worktreeBranch(folderName);
  const author = config.vcs?.author;
  if (author === undefined) throw new Error('vcs.author is required when vcs.enabled is true');

  const rootVcs = await selectVcs(projectRoot, config);
  const defaultBranch = await rootVcs.defaultBranch();
  const baseSha = (await rootVcs.head()).sha;
  const newFolder = path.join(tree.changesDir, folderName);
  const relativeFolder = path.relative(worktreeRoot, newFolder).split(path.sep).join('/');

  const aside = await copyAside(change.folderPath);
  try {
    await rootVcs.worktreeRemove(worktreeRoot);
    const keptBranch = await nextKeptBranch(rootVcs, branch);
    await rootVcs.renameBranch(branch, keptBranch);
    await rootVcs.createBranch(branch, defaultBranch);
    await rootVcs.worktreeAdd(worktreeRoot, branch);
    await runPrepare(worktreeRoot, config, branch);

    await fs.cp(aside, newFolder, { recursive: true });
    await trimRunDir(newFolder);
    await appendObservedSessions(newFolder, observations, {
      briefHash: await readBriefHash(newFolder),
      osqVersion: await resolveOsqPackageVersion(),
    });
    const hash = await hashChangeFolder(newFolder);
    await writeApprovalSeal(worktreeRoot, newFolder, config, digest, mode, hash);
    await writeProvenance(rootVcs, newFolder, baseSha);
    const worktreeVcs = await selectVcs(worktreeRoot, config);
    await worktreeVcs.commit([relativeFolder], `osq: ${specId} approved`, author);

    const state = deriveSpecState(await readChangeFolder(worktreeRoot, newFolder));
    const continuesFrom = state.tasks.find((task) => task.status !== 'done')?.taskNumber ?? null;
    return {
      ...defaultBranchResult(context, newFolder, hash),
      missingPrices: await findUnpricedPlanningModels([newFolder], config.planning?.prices),
      worktreePath: worktreeRoot,
      branch,
      restarted: { defaultBranch, keptBranch },
      ...(continuesFrom !== null ? { continuesFrom } : {}),
    };
  } finally {
    await fs.rm(path.dirname(aside), { recursive: true, force: true });
  }
}
