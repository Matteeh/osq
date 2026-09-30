import fs from 'node:fs/promises';
import path from 'node:path';
import { listChanges } from '../status/change-locations.js';
import { selectVcs } from '../vcs/select.js';
import type { OsqConfig } from './config.js';

export async function getNextSpecNumber(specsDir: string): Promise<string> {
  // Rejected attempts are numbered too, so a rejection followed by a replan
  // never reuses an identifier.
  const dirsToScan = [specsDir, path.join(specsDir, 'archive'), path.join(specsDir, 'rejected')];
  let maxNum = 0;

  for (const dir of dirsToScan) {
    let entries: string[] = [];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const match = entry.match(/^(\d+)/);
      if (match) {
        const num = Number.parseInt(match[1], 10);
        if (!Number.isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
  }

  return String(maxNum + 1).padStart(3, '0');
}

/** A branch name without its `osq/` prefix and any trailing `-rejected-<n>`. */
function branchChangeFolder(branch: string): string {
  return branch.slice('osq/'.length).replace(/-rejected-\d+$/, '');
}

/**
 * Every change folder the checkout, its worktrees, and its stacked approvals
 * hold, plus, with `vcs.enabled` and `GitVcs` selected, the folder every
 * `osq/` branch names. Duplicate names collapse to one entry.
 */
export async function knownChangeFolders(
  projectRoot: string,
  config: OsqConfig,
): Promise<string[]> {
  const folders = new Set<string>();
  for (const change of await listChanges(projectRoot, config)) {
    folders.add(change.folderName);
  }

  if (config.vcs?.enabled === true) {
    const vcs = await selectVcs(projectRoot, config);
    if (vcs.kind === 'git') {
      for (const branch of await vcs.listBranches('osq/')) {
        folders.add(branchChangeFolder(branch));
      }
    }
  }

  return [...folders];
}

/**
 * The next change number: `getNextSpecNumber`'s scan, or, with a config, the
 * highest numeric prefix across it and every folder `knownChangeFolders`
 * returns, plus one, zero-padded to three digits.
 */
export async function nextChangeNumber(
  projectDir: string,
  specsDir: string,
  config?: OsqConfig,
): Promise<string> {
  const scanned = await getNextSpecNumber(specsDir);
  if (config === undefined) {
    return scanned;
  }

  let highest = Number.parseInt(scanned, 10) - 1;
  for (const folder of await knownChangeFolders(projectDir, config)) {
    const match = folder.match(/^(\d+)/);
    if (!match) continue;
    const num = Number.parseInt(match[1], 10);
    if (!Number.isNaN(num) && num > highest) {
      highest = num;
    }
  }
  return String(highest + 1).padStart(3, '0');
}
