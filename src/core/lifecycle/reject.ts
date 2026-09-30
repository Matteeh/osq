import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { restoreStackedDraft } from '../spec/checkout-draft.js';
import { type ChangeTree, findChange } from '../status/change-locations.js';
import { getChangeRunDir } from '../status/layout.js';
import { deriveSpecState, readChangeFolder } from '../status/state.js';
import { worktreeBranch } from '../vcs/worktree.js';
import { type WorktreeRejection, commitRejectedWorktree } from './reject-vcs.js';

/**
 * Explicit rejection transition. An eligible active change is moved intact into
 * `openspec/changes/rejected/<folder>/`; the rejection reason and timestamp are
 * then recorded beside the preserved diagnostics. Eligibility is decided before
 * the single filesystem rename, so a refusal never moves or overwrites anything.
 */

export interface RejectResult {
  readonly specId: string;
  readonly folderName: string;
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly reason: string;
  readonly timestamp: string;
  /** The worktree outcome when a worktree change was rejected. */
  readonly worktree?: WorktreeRejection;
  /** The branch a rejected worktree change keeps. */
  readonly branch?: string;
  /** The stacked approval directory a stacked change withdrew. */
  readonly stackedPath?: string;
  /** For a stacked change, the restored draft's path relative to the project root. */
  readonly restoredPath?: string;
}

async function pathExists(target: string): Promise<boolean> {
  return fs.stat(target).then(
    () => true,
    () => false,
  );
}

/** JSON strings are valid YAML double-quoted scalars, so reasons round-trip safely. */
function yamlString(value: string): string {
  return JSON.stringify(value);
}

/**
 * Append the typed `rejected` event directly rather than through the harness
 * layer so `src/core` stays free of cross-tier imports, mirroring `done_manual`.
 */
async function appendRejectedEvent(
  folderPath: string,
  reason: string,
  timestamp: string,
): Promise<void> {
  const eventsDir = path.join(folderPath, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  const event = { type: 'rejected', timestamp, data: { reason } };
  await fs.appendFile(path.join(eventsDir, 'change.jsonl'), `${JSON.stringify(event)}\n`, 'utf8');
}

/** Write `.run/rejected.md` carrying the same reason and timestamp as the event. */
async function writeRejectedMarker(
  folderPath: string,
  reason: string,
  timestamp: string,
): Promise<void> {
  const runDir = getChangeRunDir(folderPath);
  await fs.mkdir(runDir, { recursive: true });
  const content = `---\nreason: ${yamlString(reason)}\ntimestamp: ${yamlString(timestamp)}\n---\n`;
  await fs.writeFile(path.join(runDir, 'rejected.md'), content, 'utf8');
}

/**
 * Refuse a running task, and an approved change that is not dead or regressed,
 * before the first mutation. Reads markers directly so state precedence cannot
 * hide a live lock or read a historical suffixed marker as active.
 */
async function assertRejectable(
  tree: ChangeTree,
  sourcePath: string,
  folderName: string,
): Promise<void> {
  const snapshot = await readChangeFolder(tree.root, sourcePath);
  if (snapshot.runningPids.size > 0) {
    throw new Error(`Change ${folderName} has a running task; rejection is refused.`);
  }
  if (snapshot.approvedHash) {
    const state = deriveSpecState(snapshot);
    if (state.status !== 'dead' && state.status !== 'regressed') {
      throw new Error(
        `Change ${folderName} is approved and healthy; only a failed change may be rejected.`,
      );
    }
  }
}

/** Commit a rejected worktree's move and remove the clean worktree, keeping its branch. */
async function finalizeRejectedWorktree(
  tree: ChangeTree,
  config: OsqConfig,
  specId: string,
  folderName: string,
  sourcePath: string,
  destinationPath: string,
  reason: string,
): Promise<Pick<RejectResult, 'worktree' | 'branch'>> {
  if (config.vcs?.enabled !== true) return {};
  const outcome = await commitRejectedWorktree(
    tree,
    config,
    specId,
    sourcePath,
    destinationPath,
    reason,
  );
  return outcome === null ? {} : { worktree: outcome, branch: worktreeBranch(folderName) };
}

/**
 * Move an eligible active change into rejected history.
 *
 * An unapproved active change is eligible. An approved change is eligible only
 * while it has an active failure (a numeric dead or regressed marker, or a
 * change-level regression) and no task is running. Healthy approved, complete,
 * running, archived, already rejected, missing, and destination-colliding
 * changes are refused before the first mutation.
 */
export async function rejectSpec(
  projectRoot: string,
  specIdOrPrefix: string,
  reason: string,
  config: OsqConfig,
): Promise<RejectResult> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new Error('a non-empty rejection reason is required');
  }

  // Resolve only beneath the active changes directory. Archived and rejected
  // folders live elsewhere and therefore never match. A change that runs in a
  // worktree is rejected inside that tree, never in the checkout.
  const change = await findChange(projectRoot, config, specIdOrPrefix);
  const { folderPath: sourcePath, tree } = change;
  const folderName = path.basename(sourcePath);
  const specId = folderName.match(/^(\d+)/)?.[1] ?? folderName;
  const stacked = tree.stackedFolder !== undefined;
  const worktree = tree.worktreeFolder !== undefined;

  const rejectedDir = tree.rejectedDir;
  const destinationPath = path.join(rejectedDir, folderName);
  if (!stacked && (await pathExists(destinationPath))) {
    throw new Error(
      `Cannot reject ${folderName}: destination "${path.relative(tree.root, destinationPath) || destinationPath}" already exists.`,
    );
  }

  await assertRejectable(tree, sourcePath, folderName);

  // One ISO timestamp is shared by the marker and the event.
  const timestamp = new Date().toISOString();
  const base = {
    specId,
    folderName,
    sourcePath,
    destinationPath,
    reason: trimmedReason,
    timestamp,
  };

  // A stacked change has no branch and no worktree: move its draft back into
  // the checkout, withdraw the stacked approval, and write no rejection record.
  if (stacked) {
    const restored = await restoreStackedDraft(projectRoot, config, change);
    await fs.rm(tree.root, { recursive: true, force: true });
    const restoredPath = path.relative(projectRoot, restored).split(path.sep).join('/');
    return { ...base, stackedPath: tree.root, restoredPath };
  }

  await fs.mkdir(rejectedDir, { recursive: true });
  await fs.rename(sourcePath, destinationPath);

  await writeRejectedMarker(destinationPath, trimmedReason, timestamp);
  await appendRejectedEvent(destinationPath, trimmedReason, timestamp);

  const outcome = worktree
    ? await finalizeRejectedWorktree(
        tree,
        config,
        specId,
        folderName,
        sourcePath,
        destinationPath,
        trimmedReason,
      )
    : {};

  return { ...base, ...outcome };
}
