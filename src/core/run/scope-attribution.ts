import type { DifferingPath, ScopePathAttribution } from './scope-hash.js';

/**
 * Attribute each differing path to a later done task. A sole typed
 * `file_changed` candidate wins when its recorded completion hash matches the
 * current tree when one is available; otherwise the candidates come from the
 * later tasks' measured paths, and only an entry credited that way carries
 * `source: 'measures'`. Several candidates credit the highest-numbered one
 * whose done marker records the current hash, else `ambiguous`; no candidate is
 * `unknown`.
 *
 * @scenario watcher-and-harness: Later edit attribution
 * @scenario watcher-and-harness: Credit from measured hashes
 * @scenario watcher-and-harness: Typed event wins
 * @scenario watcher-and-harness: Two later tasks measured the path
 * @scenario watcher-and-harness: Two later tasks named the path
 */
export function attributeScopePaths(
  staleTaskNumber: string,
  differing: DifferingPath[],
  currentFileHashes: Record<string, string | null>,
  changesByPath: Map<string, Set<string>>,
  completionHashes: Map<string, Record<string, string | null>>,
  measuredPathsByTask: Map<string, Set<string>> = new Map(),
): ScopePathAttribution[] {
  const staleNumber = Number.parseInt(staleTaskNumber, 10);
  return differing.map((entry) => {
    const candidates = [...(changesByPath.get(entry.path) ?? [])]
      .filter((number) => Number.parseInt(number, 10) > staleNumber)
      .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
    if (candidates.length > 0) {
      if (candidates.length > 1) {
        return {
          path: entry.display,
          attribution: latestMatching(candidates, entry.path, currentFileHashes, completionHashes),
        };
      }
      const attribution = contradicted(
        candidates[0],
        entry.path,
        currentFileHashes,
        completionHashes,
      )
        ? 'unknown'
        : candidates[0];
      return { path: entry.display, attribution };
    }
    const measured = [...measuredPathsByTask.entries()]
      .filter(
        ([number, paths]) => Number.parseInt(number, 10) > staleNumber && paths.has(entry.path),
      )
      .map(([number]) => number)
      .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
    if (measured.length === 0) return { path: entry.display, attribution: 'unknown' };
    if (measured.length > 1) {
      const attribution = latestMatching(measured, entry.path, currentFileHashes, completionHashes);
      return attribution === 'ambiguous'
        ? { path: entry.display, attribution }
        : { path: entry.display, attribution, source: 'measures' };
    }
    if (contradicted(measured[0], entry.path, currentFileHashes, completionHashes)) {
      return { path: entry.display, attribution: 'unknown' };
    }
    return { path: entry.display, attribution: measured[0], source: 'measures' };
  });
}

/** Credit the last candidate whose done marker records the current file hash. */
function latestMatching(
  candidates: string[],
  filePath: string,
  currentFileHashes: Record<string, string | null>,
  completionHashes: Map<string, Record<string, string | null>>,
): string {
  for (let index = candidates.length - 1; index >= 0; index--) {
    const taskNumber = candidates[index];
    const recorded = completionHashes.get(taskNumber);
    if (recorded === undefined || !(filePath in recorded)) continue;
    if ((recorded[filePath] ?? null) === (currentFileHashes[filePath] ?? null)) return taskNumber;
  }
  return 'ambiguous';
}

/** True when a sole candidate's recorded completion hash contradicts the tree. */
function contradicted(
  taskNumber: string | undefined,
  filePath: string,
  currentFileHashes: Record<string, string | null>,
  completionHashes: Map<string, Record<string, string | null>>,
): boolean {
  if (taskNumber === undefined) return false;
  const completionHash = completionHashes.get(taskNumber)?.[filePath];
  return (
    typeof completionHash === 'string' && completionHash !== (currentFileHashes[filePath] ?? null)
  );
}
