/**
 * Traceability gaps in the report: for each opted-in capability with a living
 * spec, the scenarios no scenario test file names and the exported functions no
 * `@scenario` tag claims. Derived from the living specs, the scenario index,
 * and each capability's Code ownership. Nothing is persisted.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_TRACEABILITY_CONFIG,
  type TraceabilityConfig,
} from '../foundation/config-traceability.js';
import type { OsqConfig } from '../foundation/config.js';
import { scopeCoversPath } from '../run/scope.js';
import { type CapabilityOwnership, readCapabilityOwnership } from '../spec/capability-impact.js';
import { parseCapabilitySpec } from '../spec/delta.js';
import { buildImportGraph } from '../spec/import-graph.js';
import { specDirectories } from '../spec/scenario-impact.js';
import { getSpecsDir } from '../status/layout.js';
import { type ScenarioIndex, buildScenarioIndex } from '../trace/scenario-index.js';

/** One exported function no `@scenario` tag claims. */
export interface UnclaimedFunction {
  readonly file: string;
  readonly name: string;
}

/** Traceability gaps of one opted-in capability with a living spec. */
export interface CapabilityTraceabilityGaps {
  readonly capability: string;
  /** Living-spec scenarios no scenario test file names, in spec order. */
  readonly untestedScenarios: readonly string[];
  /** Exported functions no tag claims, sorted by file and then line. */
  readonly unclaimedFunctions: readonly UnclaimedFunction[];
}

/** A test path is under `tests/`, or its file name holds `.test.` or `.spec.`. */
function isTestPath(relativePath: string): boolean {
  if (relativePath === 'tests' || relativePath.startsWith('tests/')) return true;
  const base = relativePath.slice(relativePath.lastIndexOf('/') + 1);
  return base.includes('.test.') || base.includes('.spec.');
}

/** The opted-in capability names: the configured list, or every living spec. */
async function optedInCapabilities(
  projectRoot: string,
  openspecRoot: string,
  traceability: TraceabilityConfig,
): Promise<string[]> {
  if (traceability.capabilities !== 'all') {
    return [...new Set(traceability.capabilities)].sort();
  }
  return specDirectories(getSpecsDir(openspecRoot, projectRoot));
}

/** Every scenario name of a living spec in document order, or null when absent. */
async function livingScenarioNames(specsDir: string, capability: string): Promise<string[] | null> {
  const content = await fs
    .readFile(path.join(specsDir, capability, 'spec.md'), 'utf8')
    .catch(() => null);
  if (content === null) return null;
  return parseCapabilitySpec(content).requirements.flatMap((requirement) =>
    requirement.scenarios.map((scenario) => scenario.name),
  );
}

/** True when one capability's Code ownership globs cover a file. */
function ownedBy(
  ownerships: readonly CapabilityOwnership[],
  capability: string,
  file: string,
): boolean {
  return ownerships.some(
    (entry) => entry.capability === capability && scopeCoversPath(entry.globs, file),
  );
}

/** Exported functions in owned, non-test files that no `@scenario` tag claims. */
function unclaimedFunctionsFor(
  capability: string,
  index: ScenarioIndex,
  ownerships: readonly CapabilityOwnership[],
): UnclaimedFunction[] {
  const scenarioFiles = new Set(index.scenarioTestFiles);
  return [...index.functions]
    .filter(
      (fn) =>
        fn.scenarios.length === 0 &&
        !scenarioFiles.has(fn.file) &&
        !isTestPath(fn.file) &&
        ownedBy(ownerships, capability, fn.file),
    )
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
    .map((fn) => ({ file: fn.file, name: fn.name }));
}

/**
 * Traceability gaps for every opted-in capability with a living spec, in name
 * order. Returns undefined when no capability is opted in, so the report holds
 * no `traceability` key and projects that don't opt in see no change.
 */
export async function collectTraceabilityGaps(
  projectRoot: string,
  config: OsqConfig,
): Promise<CapabilityTraceabilityGaps[] | undefined> {
  const traceability = config.traceability ?? DEFAULT_TRACEABILITY_CONFIG;
  const capabilities = await optedInCapabilities(
    projectRoot,
    config.paths.openspecRoot,
    traceability,
  );
  if (capabilities.length === 0) return undefined;

  const graph = await buildImportGraph(projectRoot, { skip: [config.paths.openspecRoot] });
  const index = buildScenarioIndex(projectRoot, graph);
  const ownerships = await readCapabilityOwnership(projectRoot, config.paths.openspecRoot);
  const specsDir = getSpecsDir(config.paths.openspecRoot, projectRoot);

  const gaps: CapabilityTraceabilityGaps[] = [];
  for (const capability of capabilities) {
    const names = await livingScenarioNames(specsDir, capability);
    if (names === null) continue;
    gaps.push({
      capability,
      untestedScenarios: names.filter((name) => index.testsNaming(capability, name).length === 0),
      unclaimedFunctions: unclaimedFunctionsFor(capability, index, ownerships),
    });
  }
  return gaps;
}

/** Render the `Traceability:` section body, one entry per capability. */
export function formatTraceability(gaps: readonly CapabilityTraceabilityGaps[]): string[] {
  const lines = ['Traceability:'];
  for (const gap of gaps) {
    lines.push(
      `  ${gap.capability}: ${gap.untestedScenarios.length} untested scenarios, ${gap.unclaimedFunctions.length} unclaimed functions`,
    );
    for (const name of gap.untestedScenarios) lines.push(`    untested: ${name}`);
    for (const fn of gap.unclaimedFunctions) lines.push(`    unclaimed: ${fn.file}#${fn.name}`);
  }
  return lines;
}
