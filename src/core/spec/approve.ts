import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import {
  type PlanningSessionReader,
  appendObservedSessions,
  findPlanningSessions,
  resolveChangeCreationTime,
} from '../report/planning-observed.js';
import { findUnpricedPlanningModels } from '../report/planning-price-gaps.js';
import { resolveOsqPackageVersion } from '../report/planning.js';
import { findChange } from '../status/change-locations.js';
import { deriveSpecState, readChangeFolder } from '../status/state.js';
import { findSteeringChange } from '../status/steering-change.js';
import { selectVcs } from '../vcs/select.js';
import { approveSteeredChange, retireSteering } from './approve-steer.js';
import {
  type ApprovalReviewOptions,
  confirmApproval,
  readBriefHash,
  toIso,
  writeApprovalSeal,
} from './approve-worktree-shared.js';
import { approveIntoWorktree } from './approve-worktree.js';
import { restoreStackedDraft } from './checkout-draft.js';
import type { ApprovalDigest } from './digest.js';
import { hashChangeFolder } from './hasher.js';
import { lintChangeFolder } from './linter.js';

export type {
  ApprovalReview,
  ApprovalReviewOptions,
} from './approve-worktree-shared.js';
export { ApprovalDeclinedError } from './approve-worktree-shared.js';

export async function findSpecFolder(specsDir: string, idOrPrefix: string): Promise<string> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(specsDir);
  } catch {
    throw new Error(`Specs directory not found at ${specsDir}`);
  }

  const trimmed = idOrPrefix.trim();
  const num = Number.parseInt(trimmed, 10);
  const padded = !Number.isNaN(num) ? String(num).padStart(3, '0') : trimmed;

  for (const entry of entries) {
    if (
      entry === trimmed ||
      entry === padded ||
      entry.startsWith(`${trimmed}-`) ||
      entry.startsWith(`${padded}-`)
    ) {
      const fullPath = path.join(specsDir, entry);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        return fullPath;
      }
    }
  }

  throw new Error(`Spec "${idOrPrefix}" not found in ${specsDir}`);
}

export interface ApproveResult {
  specId: string;
  folderName: string;
  folderPath: string;
  hash: string;
  warnings: string[];
  /** Number of local planning sessions matched at approval time. */
  planningMatches: number;
  /** Recorded-token planning models the change's folder leaves unpriced. */
  missingPrices: string[];
  /** The digest built for this approval, flags included. */
  digest: ApprovalDigest;
  /** For a worktree approval, the linked worktree's absolute path. */
  worktreePath?: string;
  /** For a worktree approval, the branch the commit landed on. */
  branch?: string;
  /** A rejected branch from an earlier attempt, renamed aside and kept. */
  keptBranch?: string;
  /** For a stacked approval, the directory that holds it. */
  stackedPath?: string;
  /** For a stacked approval, the awaited dependency folder names, in order. */
  waitingFor?: string[];
  /** The first task still not done after steering triggers were retired. */
  continuesFrom?: string;
  /** After a restart, the default branch it was cut from and the kept branch. */
  restarted?: { defaultBranch: string; keptBranch: string };
  /** After a merge, the default branch merged into the change's branch. */
  merged?: { defaultBranch: string };
}

export interface ApproveOptions extends ApprovalReviewOptions {
  /** Independent local session readers supplied by the CLI. */
  planningReaders?: readonly PlanningSessionReader[];
  /** Single observation end; defaults to the current time. */
  now?: Date | string;
  /** Approve from a branch other than the default branch. */
  baseOk?: boolean;
  /** Approve despite uncommitted changes covered by a task's scope. */
  ignoreDirty?: boolean;
}

interface InPlaceApproval {
  readonly specId: string;
  readonly folderName: string;
  readonly folderPath: string;
  readonly specsDir: string;
  readonly config: OsqConfig;
  readonly options: ApproveOptions;
  readonly warnings: string[];
}

/** The pre-worktree path: seal and observe inside the checkout's folder. */
async function approveInPlace(projectRoot: string, input: InPlaceApproval): Promise<ApproveResult> {
  const { specId, folderName, folderPath, specsDir, config, options, warnings } = input;
  const { digest, mode } = await confirmApproval(projectRoot, folderPath, config, options);

  // Discover local planning sessions after lint so a failed change is never
  // recorded, then append observed pairs before the manifest is built.
  const observations = await findPlanningSessions(folderPath, {
    createdAt: await resolveChangeCreationTime(folderPath),
    observedAt: toIso(options.now) ?? new Date().toISOString(),
    changesDir: specsDir,
    planning: config.planning ?? DEFAULT_CONFIG.planning,
    readers: options.planningReaders ?? [],
  });
  await appendObservedSessions(folderPath, observations, {
    briefHash: await readBriefHash(folderPath),
    osqVersion: await resolveOsqPackageVersion(),
  });

  // Price gaps are read after observation so a session found at approval is
  // named too. Approval itself is unaffected.
  const missingPrices = await findUnpricedPlanningModels([folderPath], config.planning?.prices);
  const hash = await hashChangeFolder(folderPath);

  // Approval only refreshes the seal. It never retires failure markers: that is
  // the exclusive job of an explicit `osq retry`.
  await writeApprovalSeal(projectRoot, folderPath, config, digest, mode, hash);

  return {
    specId,
    folderName,
    folderPath,
    hash,
    warnings,
    planningMatches: observations.length,
    missingPrices,
    digest,
  };
}

/**
 * Approve one change. Lint always runs in the checkout. With `vcs.enabled` and
 * git selected, the seal and commit go to a linked worktree or a stacked
 * approval and the checkout's draft is then removed; a stacked change is
 * restored to the checkout first. Otherwise approval writes in place.
 */
export async function approveSpec(
  projectRoot: string,
  specIdOrPrefix: string,
  config: OsqConfig,
  options: ApproveOptions = {},
): Promise<ApproveResult> {
  const located = await findSteeringChange(projectRoot, config, specIdOrPrefix);
  const change = located?.change ?? (await findChange(projectRoot, config, specIdOrPrefix));
  let folderPath = change.folderPath;
  let specsDir = change.tree.changesDir;
  let restoredDraft: string | null = null;
  if (change.tree.stackedFolder !== undefined) {
    // A stacked approval holds the approved seal; restore the draft it edits.
    restoredDraft = await restoreStackedDraft(projectRoot, config, change);
    folderPath = restoredDraft;
    specsDir = path.dirname(restoredDraft);
  }
  const folderName = change.folderName;
  const specId = folderName.match(/^(\d+)/)?.[1] || folderName;
  // Steering is read before any write: a worktree change whose revised plan
  // needs sealing goes to its own path, and an in-place change retires its
  // triggers after the new seal lands.
  const state = deriveSpecState(await readChangeFolder(change.tree.root, change.folderPath));

  try {
    if (change.tree.worktreeFolder !== undefined && state.steering) {
      return await approveSteeredChange(projectRoot, change, config, options);
    }

    const lintResult = await lintChangeFolder(projectRoot, folderPath, config);
    if (!lintResult.valid) {
      throw new Error(
        `Lint failed for spec "${folderName}":\n  - ${lintResult.errors.join('\n  - ')}`,
      );
    }

    if (config.vcs?.enabled === true) {
      const vcs = await selectVcs(projectRoot, config);
      if (vcs.kind === 'git') {
        return await approveIntoWorktree(projectRoot, {
          specId,
          folderName,
          folderPath,
          specsDir,
          config,
          options,
          vcs,
          warnings: lintResult.warnings,
        });
      }
    }

    const result = await approveInPlace(projectRoot, {
      specId,
      folderName,
      folderPath,
      specsDir,
      config,
      options,
      warnings: lintResult.warnings,
    });
    if (state.steering) {
      const continuesFrom = await retireSteering(projectRoot, config, change, state.steering);
      return continuesFrom === null ? result : { ...result, continuesFrom };
    }
    return result;
  } catch (error) {
    if (restoredDraft !== null) {
      await fs.rm(restoredDraft, { recursive: true, force: true });
    }
    throw error;
  }
}
