import type { OsqConfig } from '../foundation/config.js';
import { readDependencyState } from '../spec/stack-dependencies.js';
import { assertCheckoutBranch } from './land-checks.js';
import { landId, requireGit, resolveChange } from './land-resolve.js';
import { type LandResult, landChange } from './land.js';
import type { Vcs } from './vcs.js';

/** Options a publishing land takes. */
export interface LandPublishHooks {
  /** Runs after the fetch and its catch-up, before the land; tests move origin here. */
  readonly afterFetch?: () => Promise<void>;
}

/** A failure's message, whatever it is. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The commit `origin`'s `branch` names, or a stop naming the fetch failure. */
async function fetchOrigin(vcs: Vcs, branch: string): Promise<string> {
  try {
    return await vcs.fetchBranch('origin', branch);
  } catch (error) {
    throw new Error(`Could not fetch origin/${branch}; nothing was landed\n${messageOf(error)}`);
  }
}

/** Push `commit`, or stop with `origin/<branch> moved while landing` on a refusal. */
async function pushOrigin(vcs: Vcs, commit: string, branch: string, id: string): Promise<string> {
  const pushed = await vcs.pushBranch('origin', commit, branch);
  if (pushed.status === 'rejected') {
    throw new Error(`origin/${branch} moved while landing; run osq land ${id} again`);
  }
  return `Pushed ${commit} to origin/${branch}`;
}

/** Fast-forward the checkout to origin's commit, or stop when the branches diverged. */
async function catchUp(
  vcs: Vcs,
  head: string | null,
  originCommit: string,
  branch: string,
  id: string,
): Promise<string | null> {
  if (head !== null && (await vcs.isAncestor(head, originCommit))) {
    if (head === originCommit) return null;
    await vcs.fastForward(originCommit);
    return `Updated ${branch} to origin/${branch}`;
  }
  if (head !== null && (await vcs.isAncestor(originCommit, head))) return null;
  throw new Error(
    `${branch} and origin/${branch} have diverged; nothing was landed. Merge origin/${branch} into ${branch} on the server, then run osq land ${id} again`,
  );
}

/** Push the default branch's HEAD when it is strictly ahead of origin, else null. */
async function pushAhead(
  vcs: Vcs,
  originCommit: string,
  head: string | null,
  branch: string,
  id: string,
): Promise<string | null> {
  if (head === null || head === originCommit || !(await vcs.isAncestor(originCommit, head))) {
    return null;
  }
  return pushOrigin(vcs, head, branch, id);
}

/** Keep every non-null line, in order. */
function lines(...parts: readonly (string | null)[]): string[] {
  return parts.filter((part): part is string => part !== null);
}

/**
 * Land an archived change and keep `origin`'s default branch equal to the
 * checkout's: fetch origin first, fast-forward the checkout when origin is
 * ahead, push the land commit before the branch moves, and push the default
 * branch's HEAD when the change had already landed. A stop is an `Error` with
 * the message the spec names, and leaves the default branch where it was.
 *
 * @scenario version-control: Land pushes the land commit
 * @scenario version-control: Origin ahead before the land
 * @scenario version-control: Origin moved while landing
 * @scenario version-control: Diverged branches
 * @scenario version-control: No origin
 * @scenario version-control: Terminal land goes out with the next server land
 * @adr 003
 * @adr 014
 */
export async function landAndPublish(
  projectRoot: string,
  config: OsqConfig,
  idOrPrefix: string,
  progress?: (line: string) => void,
  hooks?: LandPublishHooks,
): Promise<LandResult> {
  const vcs = await requireGit(projectRoot, config);
  const change = await resolveChange(projectRoot, config, idOrPrefix);
  const id = change === null ? idOrPrefix : landId(change);
  const branch = await vcs.defaultBranch();
  assertCheckoutBranch(await vcs.head(), branch);

  const originCommit = await fetchOrigin(vcs, branch);
  const updated = await catchUp(vcs, (await vcs.head()).sha, originCommit, branch, id);
  if (hooks?.afterFetch !== undefined) await hooks.afterFetch();

  const alreadyLanded =
    change !== null &&
    (await readDependencyState(projectRoot, config, vcs, change.folderName)).state === 'landed';
  const pushed: string[] = [];
  const result = await landChange(projectRoot, config, idOrPrefix, progress, {
    beforeMove: async (commit) => {
      if (!alreadyLanded) pushed.push(await pushOrigin(vcs, commit, branch, id));
    },
  });
  const behind = alreadyLanded
    ? await pushAhead(vcs, originCommit, (await vcs.head()).sha, branch, id)
    : null;
  return { ...result, lines: lines(updated, ...pushed, behind, ...result.lines) };
}
