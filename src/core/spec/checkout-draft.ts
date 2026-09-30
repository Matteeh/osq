import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { type LocatedChange, changeTrees } from '../status/change-locations.js';
import type { Vcs } from '../vcs/vcs.js';

/** The `.run/` entries a restored draft keeps, so it reads as a draft. */
const RESTORE_KEEP_RUN_ENTRIES = new Set(['manifest.json', 'plan.jsonl']);

/**
 * Remove an approved change's folder from the checkout, unless the checkout's
 * HEAD holds it: a committed draft stays, because the land commit moves it
 * into the archive.
 */
export async function removeCheckoutDraft(
  vcs: Vcs,
  projectRoot: string,
  folderPath: string,
): Promise<void> {
  const repoRoot = (await vcs.root()) ?? projectRoot;
  const relative = path.relative(repoRoot, folderPath).split(path.sep).join('/');
  if (await vcs.pathExists('HEAD', relative)) return;
  await fs.rm(folderPath, { recursive: true, force: true });
}

/**
 * Copy a stacked approval's change folder into the checkout as an unapproved
 * draft, replacing any folder already there. Every `.run/` entry except the
 * manifest and plan log is dropped. The stacked directory is left untouched,
 * and the copy's absolute path is returned.
 */
export async function restoreStackedDraft(
  projectRoot: string,
  config: OsqConfig,
  change: LocatedChange,
): Promise<string> {
  const [checkout] = await changeTrees(projectRoot, config);
  const target = path.join(checkout.changesDir, change.folderName);
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(change.folderPath, target, { recursive: true });

  const runDir = path.join(target, '.run');
  for (const entry of await fs.readdir(runDir).catch(() => [] as string[])) {
    if (RESTORE_KEEP_RUN_ENTRIES.has(entry)) continue;
    await fs.rm(path.join(runDir, entry), { recursive: true, force: true });
  }
  return target;
}
