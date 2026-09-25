import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_TRACEABILITY_CONFIG,
  type TraceabilityConfig,
  type TraceabilityMode,
} from '../foundation/config-traceability.js';
import type { OsqConfig } from '../foundation/config.js';
import { readDecisions } from '../foundation/decisions.js';
import { type ScenarioIndex, buildScenarioIndex } from '../trace/scenario-index.js';
import { effectiveScenarios } from '../trace/scenario-lookup.js';
import { readCapabilityOwnership } from './capability-impact.js';
import { parseCapabilitySpec } from './delta.js';
import type { ImportGraph } from './import-graph.js';
import { type LintFinding, makeFinding } from './lint-findings.js';
import { extractSection, parseFrontmatter } from './parser.js';
import {
  type CapabilityChange,
  blastScenarios,
  readCapabilityChanges,
  readDeltaCapabilities,
  scenarioImpactFindings,
  specDirectories,
} from './scenario-impact.js';
import {
  type CapabilityLinkInfo,
  linkFindings,
  plannedCoversFunction,
  scenarioKey,
  traceabilitySeverity,
} from './traceability-links.js';

/**
 * Scenario traceability lint: one entrypoint that reads the effective spec,
 * the scenario index built from the import graph, and each task's planned
 * scenarios, then returns the link findings and the blast radius of changed
 * scenarios. It is computed in one call from `lintChangeFolder`.
 */

/** One task's resolved scope, for planning and blast-radius checks. */
export interface TraceabilityTask {
  readonly taskNumber: string;
  readonly taskPath: string;
  /** Every resolved scope path, existing or not. */
  readonly resolvedPaths: readonly string[];
  readonly testsModify: boolean;
}

export interface TraceabilityInput {
  readonly projectRoot: string;
  readonly folderPath: string;
  readonly config: OsqConfig;
  /** Repository-relative `proposal.md`; kept for the entry contract. */
  readonly proposalPath: string;
  readonly tasks: readonly TraceabilityTask[];
  readonly importGraph: ImportGraph;
}

/** The opted-in capability set; `'all'` expands to living specs and deltas. */
async function readOptedIn(
  input: TraceabilityInput,
  deltas: readonly string[],
  traceability: TraceabilityConfig,
): Promise<Set<string>> {
  const configured = traceability.capabilities;
  if (configured === 'all') {
    const specsDir = path.join(input.projectRoot, input.config.paths.openspecRoot, 'specs');
    return new Set([...(await specDirectories(specsDir)), ...deltas]);
  }
  return new Set(configured);
}

/** Effective scenario names, tolerating a delta the merge engine refuses. */
async function effectiveNamesFor(
  openspecRoot: string,
  folderPath: string,
  capability: string,
  change: CapabilityChange | undefined,
): Promise<readonly string[]> {
  try {
    return effectiveScenarios(openspecRoot, folderPath, capability).map(
      (scenario) => scenario.name,
    );
  } catch {
    const living = await fs
      .readFile(path.join(openspecRoot, 'specs', capability, 'spec.md'), 'utf8')
      .catch(() => null);
    if (living !== null) {
      return parseCapabilitySpec(living).requirements.flatMap((requirement) =>
        requirement.scenarios.map((scenario) => scenario.name),
      );
    }
    return change === undefined ? [] : [...change.addedNames, ...change.modifiedNames];
  }
}

/** Build the opted-in capability link info, effective scenarios included. */
async function readLinkCapabilities(
  input: TraceabilityInput,
  openspecRoot: string,
  changes: ReadonlyMap<string, CapabilityChange>,
  optedIn: ReadonlySet<string>,
): Promise<CapabilityLinkInfo[]> {
  const capabilities: CapabilityLinkInfo[] = [];
  for (const capability of [...optedIn].sort()) {
    const change = changes.get(capability);
    capabilities.push({
      capability,
      deltaPath: change?.deltaPath ?? null,
      effectiveNames: await effectiveNamesFor(openspecRoot, input.folderPath, capability, change),
      alteredNames: change === undefined ? [] : [...change.addedNames, ...change.modifiedNames],
    });
  }
  return capabilities;
}

/** A test path is under `tests/`, or its file name holds `.test.` or `.spec.`. */
function isTestPath(relativePath: string): boolean {
  if (relativePath === 'tests' || relativePath.startsWith('tests/')) return true;
  const base = relativePath.slice(relativePath.lastIndexOf('/') + 1);
  return base.includes('.test.') || base.includes('.spec.');
}

/** The `## Scenarios` keys each task with a test path lists, by task number. */
async function readPlannedScenarios(
  projectRoot: string,
  tasks: readonly TraceabilityTask[],
): Promise<Map<string, Set<string>>> {
  const planned = new Map<string, Set<string>>();
  for (const task of tasks) {
    if (!task.resolvedPaths.some(isTestPath)) continue;
    const content = await fs
      .readFile(path.join(projectRoot, task.taskPath), 'utf8')
      .catch(() => null);
    if (content === null) continue;
    const section = extractSection(parseFrontmatter(content).body, 'Scenarios');
    const keys = new Set<string>();
    for (const line of section.split('\n')) {
      const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
      if (bullet === null) continue;
      const colon = bullet[1].indexOf(':');
      if (colon === -1) continue;
      const capability = bullet[1].slice(0, colon).trim();
      const name = bullet[1].slice(colon + 1).trim();
      if (capability !== '' && name !== '') keys.add(scenarioKey(capability, name));
    }
    if (keys.size > 0) planned.set(task.taskNumber, keys);
  }
  return planned;
}

/** Every unreadable tag or scenario call the index holds in a resolved scope. */
function unreadableFindings(input: {
  readonly index: ScenarioIndex;
  readonly scopedFiles: ReadonlySet<string>;
  readonly optedIn: ReadonlySet<string>;
  readonly mode: TraceabilityMode;
}): LintFinding[] {
  const severity = traceabilitySeverity(input.mode);
  const findings: LintFinding[] = [];
  for (const form of input.index.unreadable) {
    if (!input.scopedFiles.has(form.file)) continue;
    if (form.capability !== undefined && !input.optedIn.has(form.capability)) continue;
    findings.push(
      makeFinding(severity, { file: form.file }, `${form.file}:${form.line}: ${form.reason}`),
    );
  }
  return findings;
}

/** Collect the traceability findings for one change folder. */
export async function collectTraceabilityFindings(
  input: TraceabilityInput,
): Promise<LintFinding[]> {
  const traceability = input.config.traceability ?? DEFAULT_TRACEABILITY_CONFIG;
  const mode = traceability.mode;
  const openspecRoot = path.join(input.projectRoot, input.config.paths.openspecRoot);
  const deltas = await readDeltaCapabilities(input.folderPath);
  const optedIn = await readOptedIn(input, deltas, traceability);
  const changes = await readCapabilityChanges(
    input.projectRoot,
    input.folderPath,
    openspecRoot,
    deltas,
  );
  const index = buildScenarioIndex(input.projectRoot, input.importGraph);
  const findings: LintFinding[] = [];

  if (optedIn.size > 0) {
    const scopedFiles = new Set(input.tasks.flatMap((task) => [...task.resolvedPaths]));
    const scopedTests = new Set(index.scenarioTestFiles.filter((file) => scopedFiles.has(file)));
    const plannedByTask = await readPlannedScenarios(input.projectRoot, input.tasks);
    const planned = new Set([...plannedByTask.values()].flatMap((keys) => [...keys]));
    const namedByScopedTest = (capability: string, name: string): boolean =>
      index.testsNaming(capability, name).some((file) => scopedTests.has(file));
    const capabilities = await readLinkCapabilities(input, openspecRoot, changes, optedIn);
    const adrs = (await readDecisions(input.projectRoot, input.config)).adrs;
    const ownerships = await readCapabilityOwnership(
      input.projectRoot,
      input.config.paths.openspecRoot,
    );
    findings.push(
      ...linkFindings({
        mode,
        index,
        scopedFiles,
        optedIn,
        capabilities,
        planned,
        namedByScopedTest,
        plannedCoversFunction: (file, capability, name) =>
          plannedCoversFunction(
            input.tasks,
            plannedByTask,
            file,
            capability,
            name,
            namedByScopedTest,
          ),
        adrs,
        ownerships,
      }),
    );
    findings.push(...unreadableFindings({ index, scopedFiles, optedIn, mode }));
  }

  findings.push(
    ...scenarioImpactFindings({
      mode,
      index,
      optedIn,
      tasks: input.tasks,
      scenarios: blastScenarios(changes),
    }),
  );

  return findings;
}
