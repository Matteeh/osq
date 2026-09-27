import type { OsqConfig } from '../foundation/config.js';
import { parseSpecMdFromFolder } from '../spec/parser.js';
import { type LocatedChange, listChanges, matchesFolder } from './change-locations.js';
import type { Dispatch, DispatchItem, DispatchKind } from './dispatch-items.js';
import { compareNumericPrefix } from './state.js';

/** A dispatch item with its place in the queue. */
export interface OrderedDispatchItem extends DispatchItem {
  readonly weight: number;
  readonly reason: string;
}

/** One active change and the dependency ids its proposal declares. */
interface ActiveChange {
  readonly change: LocatedChange;
  readonly dependsOn: readonly string[];
}

/** Every active change in every tree, with its `depends_on` ids. */
async function readActiveChanges(projectRoot: string, config: OsqConfig): Promise<ActiveChange[]> {
  const active: ActiveChange[] = [];
  for (const change of await listChanges(projectRoot, config, ['active'])) {
    const spec = await parseSpecMdFromFolder(change.folderPath).catch(() => null);
    active.push({ change, dependsOn: spec?.dependsOn ?? [] });
  }
  return active;
}

/**
 * Whether `start` reaches `folder` through other active changes. Visits each
 * active change once, so a dependency cycle terminates and counts once.
 */
function reachesFolder(
  start: ActiveChange,
  folder: string,
  active: readonly ActiveChange[],
): boolean {
  const visited = new Set<string>([start.change.folderName]);
  const stack: ActiveChange[] = [start];
  while (stack.length > 0) {
    const node = stack.pop() as ActiveChange;
    for (const dep of node.dependsOn) {
      if (matchesFolder(folder, dep)) return true;
      for (const next of active) {
        if (visited.has(next.change.folderName)) continue;
        if (!matchesFolder(next.change.folderName, dep)) continue;
        visited.add(next.change.folderName);
        stack.push(next);
      }
    }
  }
  return false;
}

/**
 * One plus the number of active changes whose `depends_on` reaches `folder`.
 * The item's own change is never counted, so a cycle counts each once.
 */
function weightOf(folder: string, active: readonly ActiveChange[]): number {
  let dependants = 0;
  for (const candidate of active) {
    if (candidate.change.folderName === folder) continue;
    if (reachesFolder(candidate, folder, active)) dependants += 1;
  }
  return dependants + 1;
}

/** The kinds an idle watcher can act on, so they lead the queue. */
function isIdleWork(kind: DispatchKind): boolean {
  return kind === 'approval' || kind === 'halt';
}

/** The item's reason: idle work, then what it holds up, else change order. */
function reasonFor(item: DispatchItem, weight: number, idle: boolean): string {
  const parts: string[] = [];
  if (idle && isIdleWork(item.kind)) parts.push('watcher idle; this gives it work');
  if (weight > 1) {
    const held = weight - 1;
    parts.push(`holds up ${held} ${held === 1 ? 'change' : 'changes'}`);
  }
  return parts.length > 0 ? parts.join('; ') : 'in change order';
}

/** A change-level item before its task items, then lower task number. */
function compareTask(a: DispatchItem, b: DispatchItem): number {
  const aTask = a.task?.number ?? null;
  const bTask = b.task?.number ?? null;
  if (aTask === null || bTask === null) {
    if (aTask === bTask) return 0;
    return aTask === null ? -1 : 1;
  }
  return compareNumericPrefix(aTask, bTask);
}

/** Idle work first, then higher weight, then lower change id and task number. */
function compareOrdered(a: OrderedDispatchItem, b: OrderedDispatchItem, idle: boolean): number {
  if (idle) {
    const aRank = isIdleWork(a.kind) ? 0 : 1;
    const bRank = isIdleWork(b.kind) ? 0 : 1;
    if (aRank !== bRank) return aRank - bRank;
  }
  if (a.weight !== b.weight) return b.weight - a.weight;
  const byChange = compareNumericPrefix(a.change.id, b.change.id);
  if (byChange !== 0) return byChange;
  return compareTask(a, b);
}

/**
 * Add each item's weight and reason and return the items in dispatch order.
 * Weight is one plus the active changes, in any tree, that reach its change.
 */
export async function orderDispatchItems(
  projectRoot: string,
  config: OsqConfig,
  dispatch: Dispatch,
): Promise<OrderedDispatchItem[]> {
  const active = await readActiveChanges(projectRoot, config);
  const weights = new Map<string, number>();
  for (const item of dispatch.items) {
    if (!weights.has(item.change.folder)) {
      weights.set(item.change.folder, weightOf(item.change.folder, active));
    }
  }
  const ordered: OrderedDispatchItem[] = dispatch.items.map((item) => {
    const weight = weights.get(item.change.folder) ?? 1;
    return { ...item, weight, reason: reasonFor(item, weight, dispatch.watcherIdle) };
  });
  ordered.sort((a, b) => compareOrdered(a, b, dispatch.watcherIdle));
  return ordered;
}
