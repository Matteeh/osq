import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import type { LocatedChange } from '../status/change-locations.js';
import { getEventsPath, getRegressedMarkerPath } from '../status/layout.js';
import { selectVcs } from './select.js';
import type { SyncStop, SyncStopReason } from './sync-stop.js';

/** The sync stops a land commits on the change's branch; every other stop records nothing. */
export function recordsLandStop(reason: SyncStopReason): boolean {
  return (
    reason === 'sync_conflict' || reason === 'requirement_changed' || reason === 'sync_verify_red'
  );
}

/** A file's contents, or null when it does not exist. */
async function readIfPresent(target: string): Promise<string | null> {
  return fs.readFile(target, 'utf8').catch(() => null);
}

/** Put a file back exactly as it was, removing it when it was absent. */
async function restore(target: string, content: string | null): Promise<void> {
  if (content === null) {
    await fs.rm(target, { force: true });
    return;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** `target` relative to `root`, as a POSIX path git takes. */
function relativeTo(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join('/');
}

/**
 * Commit the sync stop on the change's branch: the `.run/regressed/change.md`
 * marker and the `regressed` event, exactly as "Worktree halt" writes them.
 * A failed commit puts both files back and throws `osq could not record the
 * stop: <git output>`.
 */
export async function recordLandStop(
  config: OsqConfig,
  change: LocatedChange,
  stop: SyncStop,
): Promise<void> {
  const root = change.tree.root;
  const vcs = await selectVcs(root, config);
  const author = config.vcs?.author;
  if (author === undefined) throw new Error('vcs.author is required when vcs.enabled is true');

  const marker = getRegressedMarkerPath(change.folderPath, 'change');
  const events = getEventsPath(change.folderPath, 'change');
  const markerBefore = await readIfPresent(marker);
  const eventsBefore = await readIfPresent(events);

  await fs.mkdir(path.dirname(marker), { recursive: true });
  await fs.mkdir(path.dirname(events), { recursive: true });
  await fs.writeFile(marker, `---\nreason: ${stop.reason}\n---\n${stop.message}\n`, 'utf8');
  await fs.appendFile(
    events,
    `${JSON.stringify({
      type: 'regressed',
      timestamp: new Date().toISOString(),
      data: { task: 'change', reason: stop.reason, output: stop.message },
    })}\n`,
    'utf8',
  );

  const paths = [relativeTo(root, marker), relativeTo(root, events)];
  const id = change.folderName.split('-')[0] ?? change.folderName;
  try {
    await vcs.commit(paths, `osq: ${id} land stopped`, author);
  } catch (error) {
    await vcs.discard(paths).catch(() => undefined);
    await restore(marker, markerBefore);
    await restore(events, eventsBefore);
    const output = error instanceof Error ? error.message : String(error);
    throw new Error(`osq could not record the stop: ${output}`);
  }
}
