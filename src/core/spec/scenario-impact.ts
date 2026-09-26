import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { TraceabilityMode } from '../foundation/config-traceability.js';
import type { ScenarioIndex } from '../trace/scenario-index.js';
import { parseCapabilitySpec, parseDelta } from './delta.js';
import { type LintFinding, makeFinding } from './lint-findings.js';

/**
 * The blast radius of a scenario the change alters: a MODIFIED scenario whose
 * block differs from the living spec's, or a scenario in a REMOVED requirement.
 * Each test naming it is listed, and each test no task scopes for modification
 * is reported. This module also reads what each delta changes.
 */

/** One delta capability's added, differing modified, and removed scenarios. */
export interface CapabilityChange {
  readonly capability: string;
  readonly deltaPath: string;
  readonly addedNames: readonly string[];
  readonly modifiedNames: readonly string[];
  readonly removedNames: readonly string[];
}

/** One scenario the change alters, with the delta that alters it. */
export interface BlastScenario {
  readonly capability: string;
  readonly name: string;
  readonly deltaPath: string;
}

/** One task's modification authority for the blast-radius check. */
export interface ScenarioImpactTask {
  readonly resolvedPaths: readonly string[];
  readonly testsModify: boolean;
}

/** Everything the blast-radius rules read, already collected by the entry module. */
export interface ScenarioImpactInput {
  readonly mode: TraceabilityMode;
  readonly index: ScenarioIndex;
  readonly optedIn: ReadonlySet<string>;
  readonly tasks: readonly ScenarioImpactTask[];
  readonly scenarios: readonly BlastScenario[];
}

/** Repository-relative POSIX path. */
function repositoryPath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
}

function statExists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

/** Capability directories under a `specs` root that hold a `spec.md`. */
export async function specDirectories(specsDir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(specsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (await statExists(path.join(specsDir, entry.name, 'spec.md'))) names.push(entry.name);
  }
  return names.sort();
}

/** Capability names with a delta spec file in the change folder. */
export function readDeltaCapabilities(folderPath: string): Promise<string[]> {
  return specDirectories(path.join(folderPath, 'specs'));
}

/** Requirement name to scenario name to its verbatim block. */
function requirementScenarios(content: string): Map<string, Map<string, string>> {
  const requirements = new Map<string, Map<string, string>>();
  for (const requirement of parseCapabilitySpec(content).requirements) {
    const scenarios = new Map<string, string>();
    for (const scenario of requirement.scenarios) scenarios.set(scenario.name, scenario.raw);
    requirements.set(requirement.name, scenarios);
  }
  return requirements;
}

function sameScenarioBlock(left: string, right: string): boolean {
  return left.replace(/\r\n?/g, '\n').trim() === right.replace(/\r\n?/g, '\n').trim();
}

/** Read each delta capability's added, differing modified, and removed scenarios. */
export async function readCapabilityChanges(
  projectRoot: string,
  folderPath: string,
  openspecRoot: string,
  deltas: readonly string[],
): Promise<Map<string, CapabilityChange>> {
  const changes = new Map<string, CapabilityChange>();
  for (const capability of deltas) {
    const deltaAbs = path.join(folderPath, 'specs', capability, 'spec.md');
    const deltaContent = await fs.readFile(deltaAbs, 'utf8').catch(() => null);
    if (deltaContent === null) continue;
    const delta = parseDelta(deltaContent);
    const livingContent = await fs
      .readFile(path.join(openspecRoot, 'specs', capability, 'spec.md'), 'utf8')
      .catch(() => null);
    const living =
      livingContent === null
        ? new Map<string, Map<string, string>>()
        : requirementScenarios(livingContent);

    const addedNames: string[] = [];
    for (const requirement of delta.added) {
      for (const scenario of requirement.scenarios) addedNames.push(scenario.name);
    }
    const modifiedNames: string[] = [];
    for (const requirement of delta.modified) {
      const existing = living.get(requirement.name);
      for (const scenario of requirement.scenarios) {
        const raw = existing?.get(scenario.name);
        if (raw === undefined || !sameScenarioBlock(raw, scenario.raw)) {
          modifiedNames.push(scenario.name);
        }
      }
    }
    const removedNames: string[] = [];
    for (const requirement of delta.removed) {
      const existing = living.get(requirement.name);
      if (existing !== undefined) removedNames.push(...existing.keys());
    }

    changes.set(capability, {
      capability,
      deltaPath: repositoryPath(projectRoot, deltaAbs),
      addedNames,
      modifiedNames,
      removedNames,
    });
  }
  return changes;
}

/** Every scenario the change alters, in capability and delta order. */
export function blastScenarios(changes: ReadonlyMap<string, CapabilityChange>): BlastScenario[] {
  const scenarios: BlastScenario[] = [];
  for (const change of changes.values()) {
    for (const name of [...change.modifiedNames, ...change.removedNames]) {
      scenarios.push({ capability: change.capability, name, deltaPath: change.deltaPath });
    }
  }
  return scenarios;
}

/** True when a task holds the test in its resolved scope with tests.modify. */
function scopedForModification(tasks: readonly ScenarioImpactTask[], test: string): boolean {
  return tasks.some((task) => task.testsModify && task.resolvedPaths.includes(test));
}

/** The scenario listing and modification warnings for the altered scenarios. */
export function scenarioImpactFindings(input: ScenarioImpactInput): LintFinding[] {
  if (input.index.scenarioTestFiles.length === 0) return [];

  const findings: LintFinding[] = [];
  for (const scenario of input.scenarios) {
    const tests = input.index.testsNaming(scenario.capability, scenario.name);
    if (tests.length === 0) continue;

    const severity =
      input.mode === 'require' && input.optedIn.has(scenario.capability) ? 'error' : 'warning';
    findings.push(
      makeFinding(
        severity,
        { file: scenario.deltaPath },
        `Scenario "${scenario.name}" in ${scenario.capability} changes; tests naming it: ${tests.join(', ')}`,
      ),
    );

    for (const test of tests) {
      if (scopedForModification(input.tasks, test)) continue;
      findings.push(
        makeFinding(
          severity,
          { file: test },
          `${test} names changed scenario "${scenario.name}" but no task scopes it with tests.modify: true`,
        ),
      );
    }
  }

  return findings;
}
