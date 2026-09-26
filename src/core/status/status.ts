import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import { hashChangeFolder } from '../spec/hasher.js';
import { parseFrontmatter, parseSpecMdFromFolder, resolveChangeDoc } from '../spec/parser.js';
import { changeTrees, listChanges } from './change-locations.js';
import { getRejectedMarkerPath } from './layout.js';
import { type NextStep, formatNextStep, readNextStep } from './next-step.js';
import { type SpecState, type TaskState, deriveSpecState } from './state.js';
import { listPendingVerifications } from './verification.js';

/** Where a change runs when it has its own worktree. */
export interface ChangeWorktree {
  /** Absolute path of the linked worktree the change runs in. */
  readonly path: string;
  /** Whether the checkout's copy differs from the worktree's `.run/approved`. */
  readonly checkoutChanged: boolean;
}

/**
 * A change retained under `rejected/`. Rejection is a terminal location, not a
 * task state, so it is summarized separately from active {@link SpecState}
 * entries and never contributes to active or archived counts.
 */
export interface RejectedSpecSummary {
  readonly folderName: string;
  readonly title: string;
  readonly reason: string | null;
  readonly timestamp: string | null;
}

export interface StatusOverview {
  specs: SpecState[];
  rejected: RejectedSpecSummary[];
  archivedCount: number;
  archivedChangeFolders: number;
  /** Next step for each active change, keyed by folder name. */
  nextSteps?: Record<string, NextStep>;
  /** Worktree path and checkout drift for each change running in a worktree. */
  worktrees?: Record<string, ChangeWorktree>;
  /** Archived changes still awaiting a verification outcome. */
  pendingVerifications?: Array<{ folderName: string; title: string; next: NextStep }>;
}

/** Whether the checkout's copy changed since approval; a missing copy does not. */
async function checkoutCopyChanged(
  checkoutFolder: string,
  approvedHash: string | null,
): Promise<boolean> {
  if (!approvedHash) return false;
  const current = await hashChangeFolder(checkoutFolder).catch(() => null);
  return current !== null && current !== approvedHash.trim();
}

/** Reads rejection reason and timestamp from `.run/rejected.md`, tolerating absence. */
async function readRejectedSummary(
  folderPath: string,
  folderName: string,
): Promise<RejectedSpecSummary> {
  const spec = await parseSpecMdFromFolder(folderPath).catch(() => null);
  const title = spec?.title || folderName;

  const content = await fs.readFile(getRejectedMarkerPath(folderPath), 'utf8').catch(() => null);
  let reason: string | null = null;
  let timestamp: string | null = null;
  if (content !== null) {
    const { data } = parseFrontmatter(content);
    if (typeof data.reason === 'string' && data.reason.trim()) reason = data.reason.trim();
    if (typeof data.timestamp === 'string' && data.timestamp.trim()) {
      timestamp = data.timestamp.trim();
    }
  }
  return { folderName, title, reason, timestamp };
}

/** Discover rejected changes under the canonical rejected directory. */
async function readRejectedSummaries(
  projectRoot: string,
  config: OsqConfig,
): Promise<RejectedSpecSummary[]> {
  const rejected = await listChanges(projectRoot, config, ['rejected']);
  const summaries: RejectedSpecSummary[] = [];
  for (const change of rejected) {
    summaries.push(await readRejectedSummary(change.folderPath, change.folderName));
  }
  return summaries;
}

export async function getStatusOverview(
  projectRoot: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<StatusOverview> {
  const [tree] = await changeTrees(projectRoot, config);
  const active = await listChanges(projectRoot, config, ['active']);

  const specs: SpecState[] = [];
  const nextSteps: Record<string, NextStep> = {};
  const worktrees: Record<string, ChangeWorktree> = {};
  for (const change of active) {
    const changeDoc = await resolveChangeDoc(change.folderPath);
    if (!changeDoc) continue;
    const specState = await deriveSpecState(projectRoot, change.folderPath);
    specState.hasProposal = changeDoc.kind === 'proposal';
    specs.push(specState);
    nextSteps[change.folderName] = await readNextStep(projectRoot, change.folderPath, config);
    if (change.tree.worktreeFolder !== undefined) {
      worktrees[change.folderName] = {
        path: change.tree.root,
        checkoutChanged: await checkoutCopyChanged(
          path.join(tree.changesDir, change.folderName),
          specState.approvedHash,
        ),
      };
    }
  }

  const pendingVerifications = await Promise.all(
    (await listPendingVerifications(tree.archiveDir)).map(async (pending) => ({
      folderName: pending.folderName,
      title: pending.title,
      next: await readNextStep(projectRoot, pending.folderPath, config),
    })),
  );

  const archivedCount = (await listChanges(projectRoot, config, ['archived'])).length;
  const rejected = await readRejectedSummaries(projectRoot, config);

  return {
    specs,
    rejected,
    archivedCount,
    archivedChangeFolders: archivedCount,
    nextSteps,
    ...(Object.keys(worktrees).length > 0 ? { worktrees } : {}),
    pendingVerifications,
  };
}

export function formatStatusLine(task: TaskState): string {
  let indicator = '[ ]';
  if (task.status === 'done') {
    indicator = '[x]';
  } else if (task.status === 'running') {
    indicator = '[>]';
  } else if (task.status === 'dead' || task.status === 'regressed') {
    indicator = '[!]';
  }

  const title = task.title || task.fileName;
  const deadInfo = task.deadReason ? ` (reason: ${task.deadReason})` : '';
  return `  ${indicator} ${task.taskNumber}. ${title} [${task.status}]${deadInfo}`;
}

export function formatStatusOverview(overview: StatusOverview): string {
  const lines: string[] = [];

  lines.push('Active specs:');
  if (overview.specs.length === 0) {
    lines.push('  (none)');
  } else {
    for (const spec of overview.specs) {
      const approvalStatus = spec.approvedHash ? 'approved' : 'unapproved';
      lines.push(`${spec.folderName}: ${spec.title} [${spec.status}] (${approvalStatus})`);
      const worktree = overview.worktrees?.[spec.folderName];
      if (worktree) {
        lines.push(`  worktree: ${worktree.path}`);
        if (spec.tasks.some((task) => task.status === 'running')) {
          lines.push(
            '  warning: a task is running in this worktree; do not edit it until the task ends',
          );
        }
        if (worktree.checkoutChanged) {
          lines.push(
            `  warning: the checkout's copy of ${spec.folderName} changed since approval; edits there never reach the run`,
          );
        }
      }
      const next = overview.nextSteps?.[spec.folderName];
      if (next) {
        lines.push(`  next: ${formatNextStep(next)}`);
      }
      if (spec.tasks.length === 0) {
        lines.push('  (no tasks)');
      } else {
        for (const task of spec.tasks) {
          lines.push(formatStatusLine(task));
        }
      }
    }
  }

  lines.push('');
  const pending = overview.pendingVerifications;
  if (pending && pending.length > 0) {
    lines.push('Verification pending:');
    for (const item of pending) {
      lines.push(`${item.folderName}: ${item.title} — ${formatNextStep(item.next)}`);
    }
    lines.push('');
  }
  lines.push(`Archived specs: ${overview.archivedCount}`);

  lines.push('');
  lines.push('Rejected specs:');
  if (overview.rejected.length === 0) {
    lines.push('  (none)');
  } else {
    for (const rejected of overview.rejected) {
      const reason = rejected.reason ?? 'unavailable';
      const timestamp = rejected.timestamp ?? 'unavailable';
      lines.push(
        `${rejected.folderName}: ${rejected.title} [rejected] (reason: ${reason}, at: ${timestamp})`,
      );
    }
  }

  return lines.join('\n');
}
