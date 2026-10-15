import path from 'node:path';
import {
  type DoneMarkerInfo,
  listCanonicalDoneNumbers,
  readDoneMarker,
  readFileChangedPaths,
} from './scope-hash.js';
import { readMeasuredPaths } from './scope-segments.js';

/** The done, file-change and measured evidence the scope audit reads in one pass. */
export interface ScopeCreditIndex {
  /** Canonical done markers by task number. */
  readonly doneInfo: Map<string, DoneMarkerInfo>;
  /** Recorded per-file completion hashes by task number. */
  readonly completionHashes: Map<string, Record<string, string | null>>;
  /** The later task numbers whose typed `file_changed` events named each path. */
  readonly changesByPath: Map<string, Set<string>>;
  /** The paths each task's kept `measures` end segments changed. */
  readonly measuredPathsByTask: Map<string, Set<string>>;
}

/**
 * Read the done markers, completion hashes, `file_changed` paths and measured
 * paths of every canonical done task of one change in a single pass.
 *
 * @scenario watcher-and-harness: Credit from measured hashes
 * @scenario watcher-and-harness: Typed event wins
 */
export async function readScopeCredit(specFolderPath: string): Promise<ScopeCreditIndex> {
  const runDir = path.join(specFolderPath, '.run');
  const doneInfo = new Map<string, DoneMarkerInfo>();
  const completionHashes = new Map<string, Record<string, string | null>>();
  const changesByPath = new Map<string, Set<string>>();
  const measuredPathsByTask = new Map<string, Set<string>>();
  for (const number of await listCanonicalDoneNumbers(runDir)) {
    const info = await readDoneMarker(runDir, number);
    if (!info) continue;
    doneInfo.set(number, info);
    completionHashes.set(number, info.scopeFiles);
    for (const filePath of await readFileChangedPaths(specFolderPath, number)) {
      const tasks = changesByPath.get(filePath) ?? new Set<string>();
      tasks.add(number);
      changesByPath.set(filePath, tasks);
    }
    measuredPathsByTask.set(number, new Set(await readMeasuredPaths(specFolderPath, number)));
  }
  return { doneInfo, completionHashes, changesByPath, measuredPathsByTask };
}
