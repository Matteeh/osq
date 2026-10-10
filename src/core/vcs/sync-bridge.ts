import type { Vcs } from './vcs.js';

/** The bridge commit's subject, change trailer, and folder id. */
function bridgeMessage(folderName: string, defaultBranch: string): string {
  const id = folderName.split('-')[0] ?? folderName;
  return `osq: ${id} bridge ${defaultBranch}\n\nOsq-Change: ${folderName}`;
}

/** Every landed tip, once, that shares history with `head` off the default branch. */
async function keptTips(vcs: Vcs, head: string, defaultBranch: string): Promise<string[]> {
  const kept: string[] = [];
  for (const tip of await vcs.trailerValues(head, defaultBranch, 'Osq-Head')) {
    if (kept.includes(tip)) continue;
    const base = await vcs.mergeBase(head, tip);
    if (base === null) continue;
    if (await vcs.isAncestor(base, defaultBranch)) continue;
    kept.push(tip);
  }
  return kept;
}

/**
 * The commit step 2 of "Default branch sync" merges in place of the default
 * branch: the default branch itself when no landed tip shares history with
 * `head`, else a bridge commit holding the default branch's tree with each
 * kept tip as an extra parent. The bridge descends from the landed tip, so git
 * takes that tip as the merge base and only the change's own edits conflict.
 *
 * @scenario version-control: Three-change stack lands in order
 * @scenario version-control: Stacked sync merges a bridge
 * @scenario version-control: Unrelated change merges the default branch
 * @scenario version-control: Landed tip missing from the repository
 * @adr 003
 */
export async function syncBridge(
  vcs: Vcs,
  defaultBranch: string,
  head: string,
  folderName: string,
  author: string,
): Promise<string> {
  const tips = await keptTips(vcs, head, defaultBranch);
  if (tips.length === 0) return defaultBranch;
  return vcs.commitTree(
    defaultBranch,
    defaultBranch,
    bridgeMessage(folderName, defaultBranch),
    author,
    tips,
  );
}
