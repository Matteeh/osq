import { asData } from './report-events.js';

/**
 * A measured task's scope size: the number of files in the `scopeHashes` of the
 * task's last `measures` end event that carries them, which includes files the
 * task created, and otherwise its first valid start event's `scopeFiles`.
 */
export function taskScopeSize(
  events: readonly Record<string, unknown>[],
  startScopeFiles: number,
): number {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event.type !== 'measures') continue;
    const data = asData(event);
    if (data?.phase !== 'end') continue;
    const hashes = data.scopeHashes;
    if (hashes !== null && typeof hashes === 'object' && !Array.isArray(hashes)) {
      return Object.keys(hashes).length;
    }
  }
  return startScopeFiles;
}
