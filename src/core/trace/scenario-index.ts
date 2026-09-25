/**
 * The scenario index: every scenario call, every exported function with its
 * tags, and every unreadable form, built once from the import graph's files.
 * Nothing is persisted.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ImportGraph } from '../spec/import-graph.js';
import {
  type ScannedFunction,
  type ScenarioCall,
  type TaggedScenario,
  type UnreadableForm,
  scanSource,
} from './tag-scan.js';

/** The scanner's results across a project, with the lookups lint, report, and show need. */
export interface ScenarioIndex {
  readonly files: readonly string[];
  /** Files that import `@matteeh/osq/testing`. */
  readonly scenarioTestFiles: readonly string[];
  readonly functions: readonly ScannedFunction[];
  readonly calls: readonly ScenarioCall[];
  readonly unreadable: readonly UnreadableForm[];
  /** Distinct test files whose calls name the scenario, sorted. */
  testsNaming(capability: string, name: string): readonly string[];
  /** Distinct scenario pairs named by a file's calls, sorted by capability and name. */
  scenariosInFile(file: string): readonly TaggedScenario[];
  /** Test files directly importing `functionFile` with a call covering `name`, sorted. */
  coveringTests(functionFile: string, name: string): readonly string[];
  /** True when `testFile` imports `functionFile` directly and a call covers `name`. */
  covers(testFile: string, functionFile: string, name: string): boolean;
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function testsNaming(calls: readonly ScenarioCall[], capability: string, name: string): string[] {
  return sortedUnique(
    calls
      .filter((call) => call.capability === capability && call.name === name)
      .map((call) => call.file),
  );
}

function scenariosInFile(calls: readonly ScenarioCall[], file: string): TaggedScenario[] {
  const seen = new Set<string>();
  const scenarios: TaggedScenario[] = [];
  for (const call of calls) {
    if (call.file !== file) continue;
    const key = `${call.capability}\u0000${call.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    scenarios.push({ capability: call.capability, name: call.name });
  }
  return scenarios.sort(
    (a, b) => a.capability.localeCompare(b.capability) || a.name.localeCompare(b.name),
  );
}

function coveringTests(
  graph: ImportGraph,
  calls: readonly ScenarioCall[],
  functionFile: string,
  name: string,
): string[] {
  return sortedUnique(
    calls
      .filter((call) => call.covers === name && graph.importsOf(call.file).includes(functionFile))
      .map((call) => call.file),
  );
}

function covers(
  graph: ImportGraph,
  calls: readonly ScenarioCall[],
  testFile: string,
  functionFile: string,
  name: string,
): boolean {
  if (!graph.importsOf(testFile).includes(functionFile)) return false;
  return calls.some((call) => call.file === testFile && call.covers === name);
}

function readSource(projectRoot: string, file: string): string {
  try {
    return readFileSync(path.join(projectRoot, file), 'utf8');
  } catch {
    return '';
  }
}

/** Read each of `graph.files` once and index its tags, scenario calls, and unreadable forms. */
export function buildScenarioIndex(projectRoot: string, graph: ImportGraph): ScenarioIndex {
  const files = [...graph.files];
  const functions: ScannedFunction[] = [];
  const calls: ScenarioCall[] = [];
  const unreadable: UnreadableForm[] = [];
  const scenarioTestFiles: string[] = [];
  for (const file of files) {
    const scan = scanSource(file, readSource(projectRoot, file));
    functions.push(...scan.functions);
    calls.push(...scan.calls);
    unreadable.push(...scan.unreadable);
    if (scan.scenarioTestFile) scenarioTestFiles.push(file);
  }
  return {
    files,
    scenarioTestFiles,
    functions,
    calls,
    unreadable,
    testsNaming: (capability, name) => testsNaming(calls, capability, name),
    scenariosInFile: (file) => scenariosInFile(calls, file),
    coveringTests: (functionFile, name) => coveringTests(graph, calls, functionFile, name),
    covers: (testFile, functionFile, name) => covers(graph, calls, testFile, functionFile, name),
  };
}
