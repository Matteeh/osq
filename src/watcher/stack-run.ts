import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/foundation/config.js';
import type { Logger } from '../core/foundation/logger.js';
import { cutStackedChange, decideStackCut } from '../core/spec/stack-cut.js';
import { type LocatedChange, listChanges } from '../core/status/change-locations.js';
import { selectVcs } from '../core/vcs/select.js';
import { type WorktreeHalt, haltWorktreeChange } from './worktree-run.js';

/** The change's numeric spec id, falling back to its folder name. */
function specIdOf(folderName: string): string {
  return folderName.match(/^(\d+)/)?.[1] ?? folderName;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Whether a change already carries a change-level regression marker. */
async function isRegressed(change: LocatedChange): Promise<boolean> {
  return fs.access(path.join(change.folderPath, '.run', 'regressed', 'change.md')).then(
    () => true,
    () => false,
  );
}

/** Halt one stacked change with its reason and detail. */
async function halt(
  change: LocatedChange,
  specId: string,
  halt_: WorktreeHalt,
  logger?: Logger,
): Promise<void> {
  await haltWorktreeChange(change, specId, halt_, logger);
}

/**
 * Visit every active change in a stacked tree, in numeric order, and wait,
 * halt, or cut it as "Stacked cut" says. A failed cut halts with
 * `stack_cut_failed` and keeps the stacked approval.
 */
export async function runStackedChanges(
  projectRoot: string,
  config: OsqConfig,
  logger?: Logger,
): Promise<void> {
  if (config.vcs?.enabled !== true) return;
  const vcs = await selectVcs(projectRoot, config);
  if (vcs.kind !== 'git') return;

  const active = await listChanges(projectRoot, config, ['active']);
  const stacked = active.filter((change) => change.tree.stackedFolder !== undefined);
  for (const change of stacked) {
    if (await isRegressed(change)) continue;
    const specId = specIdOf(change.folderName);
    try {
      const decision = await decideStackCut({ projectRoot, config, change, vcs });
      if (decision.kind === 'wait') continue;
      if (decision.kind === 'halt') {
        await halt(change, specId, { reason: decision.reason, detail: decision.detail }, logger);
        continue;
      }
      const worktree = await cutStackedChange({
        projectRoot,
        config,
        change,
        vcs,
        base: decision.base,
      });
      logger?.info(`stacked ${change.folderName} on ${decision.base}: worktree ${worktree}`);
    } catch (err) {
      await halt(change, specId, { reason: 'stack_cut_failed', detail: errorMessage(err) }, logger);
    }
  }
}
