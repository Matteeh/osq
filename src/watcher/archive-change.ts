/** Archive one completed change: verify the tree, move it, commit, print the manual steps. */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/foundation/config.js';
import { type Logger, resolveSymbol } from '../core/foundation/logger.js';
import { parseSpecMdFromFolder, resolveChangeDoc } from '../core/spec/parser.js';
import type { LocatedChange } from '../core/status/change-locations.js';
import { deriveSpecState, readChangeFolder } from '../core/status/state.js';
import { checkAndArchiveSpec } from './archiver.js';
import { type StaleCheck, assertNotStale } from './stale-pass.js';
import { checkSync } from './sync-run.js';
import { commitWorktreeArchive, newArchiveName, readArchiveNames } from './worktree-commit.js';
import { checkWorktree, haltWorktreeChange } from './worktree-run.js';

const HUMAN_STEPS_HEADING = /^##[ \t]+Human steps[ \t]*\r?$/im;

/** What archiving a change needs from the cycle or lane that runs it. */
export interface ArchiveContext {
  readonly projectRoot: string;
  readonly config: OsqConfig;
  readonly logger?: Logger;
  readonly staleCheck?: StaleCheck;
}

/**
 * Extract the `## Human steps` section from a change document. osq never
 * performs these steps itself; they are printed once the change completes so
 * the human knows which manual actions remain (for the layout cut-over: stop
 * the watcher, run the migration, restart). Returns an empty string when the
 * document has no such section or the section is blank.
 *
 * @scenario watcher-and-harness: Human steps after completion
 */
export function extractHumanSteps(content: string): string {
  const match = HUMAN_STEPS_HEADING.exec(content);
  if (!match || match.index === undefined) {
    return '';
  }
  const remainder = content.slice(match.index + match[0].length);
  const nextHeading = remainder.search(/^##[ \t]+\S/m);
  const section = nextHeading === -1 ? remainder : remainder.slice(0, nextHeading);
  return section.trim();
}

/**
 * Read the `## Human steps` section from a change folder, preferring the
 * OpenSpec `proposal.md` and falling back to a legacy `spec.md`. Never moves
 * anything: the cut-over is always performed by the human.
 *
 * @scenario watcher-and-harness: Human steps after completion
 */
export async function readHumanSteps(specFolderPath: string): Promise<string> {
  const resolved = await resolveChangeDoc(specFolderPath);
  if (!resolved) {
    return '';
  }
  const content = await fs.readFile(resolved.path, 'utf8').catch(() => '');
  return extractHumanSteps(content);
}

/**
 * Archive `change` when its tree is clean and its sync is settled. Returns true
 * when the folder moved into the archive and its worktree commit ran.
 *
 * @scenario watcher-and-harness: What a lane runs
 * @scenario watcher-and-harness: Completed change archived
 * @adr 002
 */
export async function archiveCompletedSpec(
  change: LocatedChange,
  specId: string,
  context: ArchiveContext,
): Promise<boolean> {
  const { config, logger, staleCheck } = context;
  const useSymbols = logger?.symbols === true;
  const tag = (symbol: string, word: string): string => resolveSymbol(symbol, word, useSymbols);
  await assertNotStale(staleCheck);
  const folder = change.folderName;
  const folderPath = change.folderPath;
  const root = change.tree.root;
  const worktree = change.tree.worktreeFolder !== undefined;
  // Read the manual steps while the folder still exists: the archive move
  // relocates it, and this task never performs those steps itself.
  const humanSteps = await readHumanSteps(folderPath);
  if (worktree) {
    const halt = await checkWorktree(change, config);
    if (halt) {
      await haltWorktreeChange(change, specId, halt, logger, config.limits);
      return false;
    }
    const archiveState = deriveSpecState(await readChangeFolder(root, folderPath));
    if (archiveState.status === 'done') {
      const syncHalt = await checkSync(context.projectRoot, change, config, logger);
      if (syncHalt) {
        await haltWorktreeChange(change, specId, syncHalt, logger, config.limits);
        return false;
      }
    }
  }
  const proposalTitle = worktree
    ? ((await parseSpecMdFromFolder(folderPath).catch(() => null))?.title ?? '')
    : '';
  const before = worktree ? await readArchiveNames(change.tree.archiveDir) : null;
  const archived = await checkAndArchiveSpec(root, folderPath, config);
  if (!archived) {
    return false;
  }
  logger?.info(`${tag('✓ spec', '[archived]')} ${specId} archived (${folder})`);
  if (worktree && before !== null) {
    const archiveName = await newArchiveName(change.tree.archiveDir, before);
    if (archiveName !== null) {
      const halt = await commitWorktreeArchive(change, config, archiveName, proposalTitle, logger);
      if (halt !== null) {
        const archivedChange: LocatedChange = {
          ...change,
          folderName: archiveName,
          folderPath: path.join(change.tree.archiveDir, archiveName),
          location: 'archived',
        };
        await haltWorktreeChange(archivedChange, specId, halt, logger, config.limits);
      }
    }
  }
  if (humanSteps) {
    logger?.info(`Human steps after completion:\n${humanSteps}`);
  }
  return true;
}
