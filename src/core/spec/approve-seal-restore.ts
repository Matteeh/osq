import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * The files a steered approval writes while it seals a revised plan, relative
 * to the worktree's change folder. A failed commit puts them back.
 */
export const APPROVAL_SEAL_FILES = [
  '.run/approved',
  '.run/manifest.json',
  '.run/plan.jsonl',
] as const;

/** One seal file's bytes before an approval, or null when it was absent. */
export interface SealFileSnapshot {
  readonly relative: string;
  readonly bytes: Buffer | null;
}

/** The one read the landed check needs; the `Vcs` port satisfies it. */
export interface SealShowReader {
  show(ref: string, filePath: string): Promise<string | null>;
}

/**
 * Keep the bytes of every seal file under `folderPath`, or that each is
 * absent, so a failed commit can put them back.
 *
 * @scenario spec-lint-and-approve: Approved commit fails
 */
export async function snapshotSealFiles(folderPath: string): Promise<SealFileSnapshot[]> {
  const snapshots: SealFileSnapshot[] = [];
  for (const relative of APPROVAL_SEAL_FILES) {
    const bytes = await fs.readFile(path.join(folderPath, relative)).catch(() => null);
    snapshots.push({ relative, bytes });
  }
  return snapshots;
}

/**
 * Put each snapshot back as it was, deleting a file that was absent and
 * leaving every other file alone.
 *
 * @scenario spec-lint-and-approve: Approved commit fails
 */
export async function restoreSealFiles(
  folderPath: string,
  snapshots: readonly SealFileSnapshot[],
): Promise<void> {
  for (const { relative, bytes } of snapshots) {
    const target = path.join(folderPath, relative);
    if (bytes === null) {
      await fs.rm(target, { force: true });
      continue;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
  }
}

/**
 * Whether the approved commit landed: HEAD holds `hash` at the change folder's
 * `.run/approved`. A null or another hash means it did not, so the seal files
 * go back.
 *
 * @scenario spec-lint-and-approve: Approved commit fails
 */
export async function approvalCommitLanded(
  reader: SealShowReader,
  relativeFolder: string,
  hash: string,
): Promise<boolean> {
  const atHead = await reader.show('HEAD', `${relativeFolder}/.run/approved`);
  return atHead !== null && atHead.trim() === hash.trim();
}

/**
 * The error a steered approval throws when its commit failed and did not land.
 *
 * @scenario spec-lint-and-approve: Approved commit fails
 */
export function commitFailedError(worktreeRoot: string, specId: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(
    `the approved commit failed in ${worktreeRoot}: ${detail}. The approval seal is undone and the plan edits are kept; run osq approve ${specId} again.`,
  );
}
