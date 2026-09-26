/**
 * Mutation picks: the covered functions a passing task changed or newly tested.
 * Built from the scenario index, the function ranges, and the task's latest
 * start and end `measures` event data that the caller passes in. Nothing is
 * persisted.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { TraceabilityConfig } from '../foundation/config-traceability.js';
import { resolveScope } from '../run/scope.js';
import { hashFunctionRange, mutationRanges } from './function-ranges.js';
import type { ScenarioIndex } from './scenario-index.js';
import type { ScannedFunction, TaggedScenario } from './tag-scan.js';

/**
 * The `measures` event fields a pick reads. It is structural so core needs no
 * harness type import.
 */
export interface MeasuresView {
  readonly functionHashes?: Record<string, string | null>;
  readonly scopeHashes?: Record<string, { before: string | null; after: string | null }>;
}

/** One covered function picked for a mutation run. */
export interface MutationPick {
  readonly file: string;
  readonly function: string;
  /** 1-based declaration line; picks order by file and then this line. */
  readonly line: number;
  /** The mutation ranges, or null when any is unknown. */
  readonly ranges: readonly string[] | null;
  /** The tagged opted-in scenarios as `<capability>: <name>`, sorted. */
  readonly scenarios: readonly string[];
  /** The sorted, distinct scenario test files naming those scenarios. */
  readonly tests: readonly string[];
}

/** Inputs for `pickMutations`. */
export interface MutationPickOptions {
  readonly projectRoot: string;
  readonly index: ScenarioIndex;
  readonly traceability: TraceabilityConfig;
  /** The task's raw scope entries; this resolves them exactly as the runner does. */
  readonly scope: readonly string[];
  /** The task's latest start `measures` data, or null. */
  readonly start: MeasuresView | null;
  /** The task's latest end `measures` data, or null. */
  readonly end: MeasuresView | null;
}

/** True when the configuration opts a capability into traceability. */
function isOptedIn(traceability: TraceabilityConfig, capability: string): boolean {
  return traceability.capabilities === 'all' || traceability.capabilities.includes(capability);
}

/** A function's `@scenario` tags whose capability is opted in, sorted. */
function optedScenarios(fn: ScannedFunction, traceability: TraceabilityConfig): TaggedScenario[] {
  return fn.scenarios
    .filter((scenario) => isOptedIn(traceability, scenario.capability))
    .sort((a, b) => a.capability.localeCompare(b.capability) || a.name.localeCompare(b.name));
}

/** The scenarios as `<capability>: <name>` strings. */
function scenarioLabels(scenarios: readonly TaggedScenario[]): string[] {
  return scenarios.map((scenario) => `${scenario.capability}: ${scenario.name}`);
}

/** The sorted, distinct scenario test files naming any of `scenarios`. */
function pickTests(index: ScenarioIndex, scenarios: readonly TaggedScenario[]): string[] {
  const tests = new Set<string>();
  for (const scenario of scenarios) {
    for (const file of index.testsNaming(scenario.capability, scenario.name)) tests.add(file);
  }
  return [...tests].sort();
}

/** True when a scoped function's own range hash differs from the stored baseline. */
function rangeChanged(
  file: string,
  name: string,
  text: string,
  start: MeasuresView | null,
  scoped: boolean,
): boolean {
  if (!scoped) return false;
  const stored = start?.functionHashes?.[`${file}#${name}`];
  return stored === undefined || stored !== hashFunctionRange(file, text, name);
}

/** True when a test file naming a tagged scenario changed and covers the function. */
function testChanged(
  index: ScenarioIndex,
  fn: ScannedFunction,
  tests: readonly string[],
  end: MeasuresView | null,
): boolean {
  const hashes = end?.scopeHashes;
  if (hashes === undefined) return false;
  return tests.some((test) => {
    const entry = hashes[test];
    return (
      entry !== undefined && entry.before !== entry.after && index.covers(test, fn.file, fn.name)
    );
  });
}

/** Read a source file once, caching the text across functions in the same file. */
async function sourceText(
  projectRoot: string,
  file: string,
  cache: Map<string, string>,
): Promise<string> {
  const cached = cache.get(file);
  if (cached !== undefined) return cached;
  const text = await fs.readFile(path.join(projectRoot, file), 'utf8').catch(() => '');
  cache.set(file, text);
  return text;
}

/**
 * Pick every covered function the task changed or newly tested. A covered
 * function is an exported function with a `@scenario` tag naming an opted-in
 * capability and at least one scenario test file naming that tagged scenario.
 * It is picked when its scoped own range hash differs from the start event's
 * `functionHashes` entry, a missing entry counting as different, or when a
 * scenario test file the end event shows with a different before and after hash
 * covers it. Picks order by file, then start line.
 */
export async function pickMutations(options: MutationPickOptions): Promise<MutationPick[]> {
  const scoped = new Set(
    (await resolveScope(options.projectRoot, options.scope)).map((entry) => entry.relativePath),
  );
  const cache = new Map<string, string>();
  const picks: MutationPick[] = [];
  for (const fn of options.index.functions) {
    const scenarios = optedScenarios(fn, options.traceability);
    if (scenarios.length === 0) continue;
    const tests = pickTests(options.index, scenarios);
    if (tests.length === 0) continue;
    const text = await sourceText(options.projectRoot, fn.file, cache);
    const changed =
      rangeChanged(fn.file, fn.name, text, options.start, scoped.has(fn.file)) ||
      testChanged(options.index, fn, tests, options.end);
    if (!changed) continue;
    picks.push({
      file: fn.file,
      function: fn.name,
      line: fn.line,
      ranges: mutationRanges(fn.file, text, fn.name),
      scenarios: scenarioLabels(scenarios),
      tests,
    });
  }
  return picks.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}
