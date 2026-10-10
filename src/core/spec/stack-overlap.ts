import type { OsqConfig } from '../foundation/config.js';
import { listChanges } from '../status/change-locations.js';
import { listDeltaCapabilities } from '../vcs/sync-specs.js';
import type { Vcs } from '../vcs/vcs.js';
import {
  type AwaitedDependency,
  awaitedDependencies,
  readDependencyState,
} from './stack-dependencies.js';

/** One overlapping change: its folder, state hash, and shared capabilities. */
export interface OverlappingChange {
  readonly folder: string;
  readonly hash: string;
  readonly overlap: readonly string[];
}

/**
 * The changes the folder overlaps: another change folder `listChanges` returns
 * in any location or tree, counted once by folder name, whose state reads
 * `approved` or `archived` and whose delta shares a capability with the
 * folder's. Sorted by folder name.
 *
 * @scenario spec-lint-and-approve: Which changes overlap
 * @adr 003
 */
export async function overlappingChanges(
  projectRoot: string,
  config: OsqConfig,
  vcs: Vcs,
  folderPath: string,
  folderName: string,
): Promise<OverlappingChange[]> {
  const own = new Set(await listDeltaCapabilities(folderPath));
  if (own.size === 0) return [];

  const changes = await listChanges(projectRoot, config);
  const seen = new Set<string>([folderName]);
  const overlaps: OverlappingChange[] = [];
  for (const change of changes) {
    if (seen.has(change.folderName)) continue;
    seen.add(change.folderName);
    const state = await readDependencyState(projectRoot, config, vcs, change.folderName);
    if (state.state !== 'approved' && state.state !== 'archived') continue;
    const shared = (await listDeltaCapabilities(change.folderPath))
      .filter((capability) => own.has(capability))
      .sort();
    if (shared.length === 0) continue;
    overlaps.push({ folder: change.folderName, hash: state.hash ?? '', overlap: shared });
  }
  return overlaps.sort((a, b) => (a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0));
}

/** Every folder met by following `awaitedDependencies` from `start`. */
async function awaitedClosure(
  projectRoot: string,
  config: OsqConfig,
  vcs: Vcs,
  start: string,
  paths: ReadonlyMap<string, string>,
): Promise<Set<string>> {
  const out = new Set<string>();
  const seen = new Set<string>([start]);
  const stack = [start];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    const currentPath = paths.get(current);
    if (currentPath === undefined) continue;
    for (const entry of await awaitedDependencies(projectRoot, config, vcs, currentPath)) {
      out.add(entry.folder);
      if (!seen.has(entry.folder)) {
        seen.add(entry.folder);
        stack.push(entry.folder);
      }
    }
  }
  out.delete(start);
  return out;
}

/**
 * What approve stacks on: first `awaitedDependencies` of the folder, then each
 * overlapping change that no earlier entry names and that no other returned
 * entry already awaits, directly or through others, so a change that overlaps a
 * chain stacks only on its tip.
 *
 * @scenario spec-lint-and-approve: Which changes overlap
 * @scenario spec-lint-and-approve: Approve a change that overlaps a running one
 * @scenario spec-lint-and-approve: Approve a change that shares no capability
 * @adr 003
 */
export async function awaitedForApproval(
  projectRoot: string,
  config: OsqConfig,
  vcs: Vcs,
  folderPath: string,
  folderName: string,
): Promise<AwaitedDependency[]> {
  const declared = await awaitedDependencies(projectRoot, config, vcs, folderPath);
  const overlaps = await overlappingChanges(projectRoot, config, vcs, folderPath, folderName);
  if (overlaps.length === 0) return declared;

  const paths = new Map<string, string>();
  for (const change of await listChanges(projectRoot, config)) {
    if (!paths.has(change.folderName)) paths.set(change.folderName, change.folderPath);
  }
  const endpoints = [...new Set([...declared, ...overlaps].map((entry) => entry.folder))];
  const closures = new Map<string, Set<string>>();
  for (const folder of endpoints) {
    closures.set(folder, await awaitedClosure(projectRoot, config, vcs, folder, paths));
  }

  const named = new Set(declared.map((entry) => entry.folder));
  const result = [...declared];
  for (const overlap of overlaps) {
    if (named.has(overlap.folder)) continue;
    const awaitedByOther = endpoints.some(
      (other) => other !== overlap.folder && closures.get(other)?.has(overlap.folder) === true,
    );
    if (awaitedByOther) continue;
    named.add(overlap.folder);
    result.push({ folder: overlap.folder, hash: overlap.hash, overlap: [...overlap.overlap] });
  }
  return result;
}

/**
 * The `overlaps` an approve result carries for a stacked approval.
 *
 * @scenario spec-lint-and-approve: Approve a change that overlaps a running one
 * @adr 003
 */
export function overlapEntries(awaited: readonly AwaitedDependency[]): {
  overlaps?: { folder: string; capabilities: string[] }[];
} {
  const overlaps = awaited
    .filter((entry) => entry.overlap !== undefined)
    .map((entry) => ({ folder: entry.folder, capabilities: [...(entry.overlap ?? [])] }));
  return overlaps.length === 0 ? {} : { overlaps };
}
