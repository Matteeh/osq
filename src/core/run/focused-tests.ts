/**
 * Focused scenario tests: collect the scenario test files that name a task's
 * opted-in scenarios and run only those files, classifying the TAP result. The
 * full verify still decides completion; this only buys fast feedback.
 *
 * The scenario index is the only source of tests. Nothing is persisted.
 */

import {
  DEFAULT_TRACEABILITY_CONFIG,
  type TraceabilityConfig,
} from '../foundation/config-traceability.js';
import type { OsqConfig } from '../foundation/config.js';
import { buildImportGraph } from '../spec/import-graph.js';
import { buildScenarioIndex } from '../trace/scenario-index.js';
import type { TaggedScenario } from '../trace/tag-scan.js';
import { resolveScope } from './scope.js';
import { runVerificationCommand } from './verification.js';

/** How a focused run ended. */
export type FocusedOutcome = 'passed' | 'problem' | 'failed';

/** The scenarios and test files a task's focused run covers. */
export interface FocusedCollection {
  readonly scenarios: readonly TaggedScenario[];
  readonly files: readonly string[];
}

/** One focused run's command, inputs, and classified outcome. */
export interface FocusedRunResult {
  readonly command: string;
  readonly files: readonly string[];
  readonly scenarios: readonly string[];
  readonly outcome: FocusedOutcome;
  readonly exitCode: number;
  readonly duration: number;
  readonly timedOut: boolean;
  readonly output: string;
}

const EMPTY_COLLECTION: FocusedCollection = { scenarios: [], files: [] };

/** True when the configuration opts a capability into traceability. */
function isOptedIn(traceability: TraceabilityConfig, capability: string): boolean {
  return traceability.capabilities === 'all' || traceability.capabilities.includes(capability);
}

/** Scenario pairs sorted by capability and then name. */
function sortScenarios(scenarios: Iterable<TaggedScenario>): TaggedScenario[] {
  return [...scenarios].sort(
    (a, b) => a.capability.localeCompare(b.capability) || a.name.localeCompare(b.name),
  );
}

/** One TAP failure line, at any indentation. */
const NOT_OK_LINE = /^\s*not ok \d+ - (.*)$/;
/** A trailing TAP directive, such as ` # TODO`. */
const DIRECTIVE = / # .*$/;
/** The title prefix every scenario test carries. */
const SCENARIO_PREFIX = 'Scenario: ';

/** The title with a trailing directive removed and TAP escaping undone. */
function scenarioTitle(raw: string): string {
  const directive = DIRECTIVE.exec(raw);
  const stripped = directive === null ? raw : raw.slice(0, directive.index);
  return stripped.replace(/\\([#\\])/g, '$1');
}

/** True when the output fails a test titled `Scenario: <name>` for `names`. */
function hasFailedScenario(output: string, names: ReadonlySet<string>): boolean {
  for (const line of output.split('\n')) {
    const raw = NOT_OK_LINE.exec(line)?.[1];
    if (raw === undefined) continue;
    const title = scenarioTitle(raw);
    if (!title.startsWith(SCENARIO_PREFIX)) continue;
    if (names.has(title.slice(SCENARIO_PREFIX.length))) return true;
  }
  return false;
}

/**
 * Collect the task's focused scenarios and files. The scenarios are the
 * opted-in capability and name pairs named by `scenario(...)` calls in scenario
 * test files inside the resolved scope, and the files are every scenario test
 * file in the repository naming one of them. With the focused command unset, no
 * capability opted in, or no collected scenario, the collection is empty.
 */
export async function collectFocusedTests(
  projectRoot: string,
  config: OsqConfig,
  scope: readonly string[],
): Promise<FocusedCollection> {
  const traceability = config.traceability ?? DEFAULT_TRACEABILITY_CONFIG;
  if (traceability.focusedTests === undefined) return EMPTY_COLLECTION;

  const resolved = await resolveScope(projectRoot, scope);
  const scoped = new Set(resolved.map((entry) => entry.relativePath));
  const graph = await buildImportGraph(projectRoot, { skip: [config.paths.openspecRoot] });
  const index = buildScenarioIndex(projectRoot, graph);

  const collected = new Map<string, TaggedScenario>();
  for (const file of index.scenarioTestFiles) {
    if (!scoped.has(file)) continue;
    for (const scenario of index.scenariosInFile(file)) {
      if (!isOptedIn(traceability, scenario.capability)) continue;
      collected.set(`${scenario.capability}\u0000${scenario.name}`, scenario);
    }
  }
  if (collected.size === 0) return EMPTY_COLLECTION;

  const files = new Set<string>();
  for (const scenario of collected.values()) {
    for (const file of index.testsNaming(scenario.capability, scenario.name)) {
      files.add(file);
    }
  }
  return { scenarios: sortScenarios(collected.values()), files: [...files].sort() };
}

/** Classify a run as `failed`, `problem`, or `passed`, in that precedence. */
function classify(
  result: Awaited<ReturnType<typeof runVerificationCommand>>,
  names: ReadonlySet<string>,
): FocusedOutcome {
  if (hasFailedScenario(result.output, names)) return 'failed';
  if (result.exitCode !== 0 || result.timedOut || result.error !== undefined) return 'problem';
  return 'passed';
}

/**
 * Run the focused command with `{files}` replaced by the collected files, each
 * single-quoted for the shell. It runs through `runVerificationCommand` with
 * the task's change folder and the verify timeout, so it inherits the verify
 * environment, `OSQ_CHANGE` included. Returns null when there is nothing to run.
 */
export async function runFocusedTests(
  collection: FocusedCollection,
  projectRoot: string,
  changeFolder: string,
  config: OsqConfig,
): Promise<FocusedRunResult | null> {
  const command = config.traceability?.focusedTests;
  if (command === undefined || collection.files.length === 0) return null;

  const files = [...collection.files];
  const resolvedCommand = command.replace(/\{files\}/g, files.map((file) => `'${file}'`).join(' '));
  const result = await runVerificationCommand(
    projectRoot,
    resolvedCommand,
    config.timeouts.verifyTimeoutSeconds,
    changeFolder,
  );
  const names = new Set(collection.scenarios.map((scenario) => scenario.name));
  return {
    command: resolvedCommand,
    files,
    scenarios: collection.scenarios.map((scenario) => `${scenario.capability}: ${scenario.name}`),
    outcome: classify(result, names),
    exitCode: result.exitCode,
    duration: result.duration,
    timedOut: result.timedOut,
    output: result.output,
  };
}
