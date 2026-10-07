/**
 * Flaky tests in the report: every `change_verify_rerun` event with
 * `passed: true` in the numbered task streams of every active and archived
 * change, counted once per test each such event names. Read through the shared
 * reader; nothing is persisted.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { compareNumericPrefix } from '../status/state.js';
import { asData } from './report-events.js';
import { readEventStream } from './stream-reads.js';

/** One test that flaked, with the number of passing reruns that named it. */
export interface FlakyTestEntry {
  readonly test: string;
  readonly count: number;
}

/**
 * Distinct non-empty test paths a `change_verify_rerun` event names, or none
 * when the event did not pass or holds no readable `tests` array. An event that
 * names one test twice names it once.
 */
function namedTests(data: Record<string, unknown> | null): string[] {
  if (data === null || data.passed !== true) return [];
  const tests = data.tests;
  if (!Array.isArray(tests)) return [];
  const named = new Set<string>();
  for (const value of tests) {
    if (typeof value === 'string' && value.trim()) named.add(value.trim());
  }
  return [...named];
}

/**
 * Count one flake per passing `change_verify_rerun` event naming a test, across
 * each folder's numbered task streams. The change-level stream is never read.
 */
async function countFlakes(folders: readonly string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const folderPath of folders) {
    const eventsDir = path.join(folderPath, '.run', 'events');
    let eventFiles: string[] = [];
    try {
      eventFiles = (await fs.readdir(eventsDir)).filter((entry) => /^\d+\.jsonl$/.test(entry));
    } catch {
      continue;
    }
    for (const eventFile of eventFiles.sort(compareNumericPrefix)) {
      const events = (await readEventStream(path.join(eventsDir, eventFile))) ?? [];
      for (const event of events) {
        if (event.type !== 'change_verify_rerun') continue;
        for (const test of namedTests(asData(event))) {
          counts.set(test, (counts.get(test) ?? 0) + 1);
        }
      }
    }
  }
  return counts;
}

/**
 * Flaky tests ordered by count, highest first, then by test path. Returns
 * undefined when no passing `change_verify_rerun` event names a test, so the
 * report is unchanged for a project without flakes.
 */
export async function collectFlakyTests(
  folders: readonly string[],
): Promise<readonly FlakyTestEntry[] | undefined> {
  const counts = await countFlakes(folders);
  if (counts.size === 0) return undefined;
  return [...counts.entries()]
    .map(([test, count]) => ({ test, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.test.localeCompare(b.test)));
}

/** Render the `Flaky tests:` section body, one test and its count per line. */
export function formatFlakyTests(entries: readonly FlakyTestEntry[]): string[] {
  return ['Flaky tests:', ...entries.map((entry) => `  ${entry.test}: ${entry.count}`)];
}
