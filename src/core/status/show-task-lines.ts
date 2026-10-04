import { type DependencyPair, addedPairs, distinctPairs } from '../report/report-dependencies.js';
import { parseResultSections } from '../report/result-sections.js';
import type { TaggedScenario } from '../trace/tag-scan.js';
import { formatPreSpawnStart } from './pre-spawn-words.js';
import { type TimelineEvent, stringList } from './show-types.js';

/**
 * Projects the latest pre-spawn `verify_ran` event of one task into the
 * `Pre-spawn verify:` show line. Returns null when the task recorded no
 * pre-spawn result, so output for every other task stays unchanged. The start
 * is worded exactly as the watch log words it. Only the already parsed event
 * stream is read; a missing exit code or declared state renders as unavailable
 * rather than being guessed.
 */
export function formatPreSpawnVerify(events: TimelineEvent[]): string | null {
  let latest: TimelineEvent | undefined;
  for (const event of events) {
    if (event.type === 'verify_ran' && event.data?.phase === 'pre_spawn') {
      latest = event;
    }
  }
  if (!latest) return null;

  const data = latest.data ?? {};
  const exitCode =
    typeof data.exitCode === 'number' && Number.isFinite(data.exitCode) ? data.exitCode : null;
  const expected = typeof data.expected === 'string' ? data.expected.trim() : '';
  if (exitCode === null || expected === '') {
    return '      Pre-spawn verify: unavailable';
  }
  const missing = validMissingPaths(data.missingPaths);
  return `      Pre-spawn verify: ${formatPreSpawnStart(expected, exitCode, missing)}`;
}

/**
 * The recorded missing named paths of a pre-spawn event. Only a non-empty array
 * whose every entry is a non-empty string qualifies, so an empty, absent, or
 * malformed value contributes no path.
 */
export function validMissingPaths(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) return [];
  if (!value.every((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')) {
    return [];
  }
  return value.map((entry) => entry.trim());
}

/**
 * Counts a task's `retry` events split into total and automatic. Automatic
 * retries are exactly those whose event data carries `automatic: true`.
 * Returns null when the task recorded no retry, so every other task's output
 * stays unchanged.
 */
export function retryCounts(events: TimelineEvent[]): { total: number; automatic: number } | null {
  let total = 0;
  let automatic = 0;
  for (const event of events) {
    if (event.type !== 'retry') continue;
    total += 1;
    if (event.data?.automatic === true) automatic += 1;
  }
  return total > 0 ? { total, automatic } : null;
}

/** Projects a task's `retry` events into the `Retries:` line, or null. */
export function formatRetries(events: TimelineEvent[]): string | null {
  const counts = retryCounts(events);
  if (!counts) return null;
  return `      Retries: ${counts.total} (${counts.automatic} automatic)`;
}

/**
 * Projects the task's latest `stuck` event into the `Stuck:` line, but only
 * while it is still the task's current state. A later `retry` event means a
 * human already retried the task, so the line disappears. Returns null when
 * the task recorded no stuck event or is no longer stuck.
 */
export function formatStuck(events: TimelineEvent[]): string | null {
  let stuck: TimelineEvent | undefined;
  let stuckIndex = -1;
  let lastRetry = -1;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.type === 'retry') {
      lastRetry = index;
    } else if (event.type === 'stuck') {
      stuck = event;
      stuckIndex = index;
    }
  }
  if (!stuck || lastRetry > stuckIndex) return null;
  const fingerprint =
    typeof stuck.data?.fingerprint === 'string' && stuck.data.fingerprint.trim() !== ''
      ? stuck.data.fingerprint.trim()
      : 'unavailable';
  return `      Stuck: same failure twice (${fingerprint})`;
}

/**
 * Projects every `dependencies_added` event of a task into the
 * `Dependencies added:` show line, with distinct pairs sorted by file and then
 * name. Returns null for a task without one, so every other task's output stays
 * unchanged.
 */
export function formatDependenciesAdded(events: TimelineEvent[]): string | null {
  const pairs: DependencyPair[] = [];
  for (const event of events) {
    if (event.type !== 'dependencies_added') continue;
    pairs.push(...addedPairs(event.data?.added));
  }
  const distinct = distinctPairs(pairs);
  if (distinct.length === 0) return null;
  const rendered = distinct.map((pair) => `${pair.name} (${pair.file})`).join(', ');
  return `      Dependencies added: ${rendered}`;
}

/**
 * Projects the scenario pairs named by the scenario test files in a task's
 * resolved scope into the `Scenarios:` line. Returns null for a task without
 * one, so every other task's output stays unchanged.
 */
export function formatTaskScenarios(
  scenarios: readonly TaggedScenario[] | undefined,
): string | null {
  if (!scenarios || scenarios.length === 0) return null;
  const rendered = scenarios.map((pair) => `${pair.capability}: ${pair.name}`).join('; ');
  return `      Scenarios: ${rendered}`;
}

/**
 * Projects the task's latest `instructions_changed` event into the
 * `Instructions changed after approval:` line. Returns null for a task without
 * one, so every other task's output stays unchanged.
 */
export function formatInstructionsChanged(events: TimelineEvent[]): string | null {
  let latest: TimelineEvent | undefined;
  for (const event of events) {
    if (event.type === 'instructions_changed') latest = event;
  }
  if (!latest) return null;
  return `      Instructions changed after approval: ${stringList(latest.data?.changed).join(', ')}`;
}

/**
 * Projects the real disclosure sections of a task's result file into the
 * `Disclosures:` show line. Empty or `None`-only sections are absent, and a
 * task whose result holds no real disclosure prints no line. Returns null so
 * every other task's output stays unchanged.
 */
export function formatDisclosures(resultContent: string | undefined): string | null {
  if (!resultContent) return null;
  const sections = parseResultSections(resultContent);
  const names: string[] = [];
  if (sections.deviated !== null) names.push('deviated');
  if (sections.missingContext !== null) names.push('missing context');
  if (sections.outsideScope !== null) names.push('outside scope');
  if (names.length === 0) return null;
  return `      Disclosures: ${names.join(', ')}`;
}
