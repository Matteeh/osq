/**
 * Dependencies a change's tasks added, derived only from typed
 * `dependencies_added` events in numbered task streams.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { compareNumericPrefix } from '../status/state.js';
import { asData, parseEventLines } from './report-events.js';

/** One package added to one manifest. */
export interface DependencyPair {
  readonly file: string;
  readonly name: string;
}

/** Every distinct package an active or archived change's tasks added. */
export interface DependencyEntry {
  readonly change: string;
  readonly added: readonly DependencyPair[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Valid `{ file, name }` pairs from a `dependencies_added` event's `added`
 * data. An entry that is not a pair of non-empty strings contributes nothing.
 */
export function addedPairs(value: unknown): DependencyPair[] {
  if (!Array.isArray(value)) return [];
  const pairs: DependencyPair[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const { file, name } = entry;
    if (typeof file !== 'string' || !file.trim()) continue;
    if (typeof name !== 'string' || !name.trim()) continue;
    pairs.push({ file: file.trim(), name: name.trim() });
  }
  return pairs;
}

function comparePairs(a: DependencyPair, b: DependencyPair): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  if (a.name === b.name) return 0;
  return a.name < b.name ? -1 : 1;
}

/** Distinct pairs from every given event, sorted by file and then name. */
export function distinctPairs(pairs: readonly DependencyPair[]): DependencyPair[] {
  const seen = new Map<string, DependencyPair>();
  for (const pair of pairs) seen.set(`${pair.file}\u0000${pair.name}`, pair);
  return [...seen.values()].sort(comparePairs);
}

/** Pairs from every `dependencies_added` event in one numbered task stream. */
async function streamPairs(eventFilePath: string): Promise<DependencyPair[]> {
  const content = await fs.readFile(eventFilePath, 'utf8').catch(() => '');
  const pairs: DependencyPair[] = [];
  for (const event of parseEventLines(content)) {
    if (event.type !== 'dependencies_added') continue;
    pairs.push(...addedPairs(asData(event)?.added));
  }
  return pairs;
}

/**
 * Every active or archived change whose numbered task streams hold a
 * `dependencies_added` event, in change order. A change with none is absent.
 */
export async function collectDependencies(folders: readonly string[]): Promise<DependencyEntry[]> {
  const entries: DependencyEntry[] = [];
  for (const folderPath of folders) {
    const eventsDir = path.join(folderPath, '.run', 'events');
    let eventFiles: string[] = [];
    try {
      eventFiles = (await fs.readdir(eventsDir)).filter((entry) => /^\d+\.jsonl$/.test(entry));
    } catch {
      eventFiles = [];
    }
    const pairs: DependencyPair[] = [];
    for (const eventFile of eventFiles.sort(compareNumericPrefix)) {
      pairs.push(...(await streamPairs(path.join(eventsDir, eventFile))));
    }
    const added = distinctPairs(pairs);
    if (added.length === 0) continue;
    entries.push({ change: path.basename(folderPath), added });
  }
  return entries.sort((a, b) => compareNumericPrefix(a.change, b.change));
}

/** Render the `Dependencies added:` section body, one line per change. */
export function formatDependencies(entries: readonly DependencyEntry[]): string[] {
  const lines = ['Dependencies added:'];
  for (const entry of entries) {
    const rendered = entry.added.map((pair) => `${pair.name} (${pair.file})`).join(', ');
    lines.push(`  ${entry.change}: ${rendered}`);
  }
  return lines;
}
