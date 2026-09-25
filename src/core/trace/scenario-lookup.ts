import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  type CapabilitySpec,
  type DeltaScenario,
  type ScenarioOutcome,
  mergeDelta,
  parseCapabilitySpec,
  parseDelta,
} from '../spec/delta.js';
import { isActiveChangeFolderName } from '../status/layout.js';

/**
 * Effective scenario lookup: with `OSQ_CHANGE` set the effective spec is the
 * living spec merged with that change's delta; without it, every place that
 * defines the scenario must agree. Lookups take `cwd` and `env`, never
 * `process.env`.
 */

/** A parsed spec file, or one ADDED/MODIFIED requirement of a delta. */
interface ScenarioPlace {
  readonly relativePath: string;
  readonly scenarios: readonly DeltaScenario[];
}

interface SpecLocation {
  readonly openspecRoot: string;
  readonly changeFolder: string | null;
}
/** A scenario found in one place. */
interface ScenarioDefinition {
  readonly place: ScenarioPlace;
  readonly outcomes: readonly ScenarioOutcome[];
}

const placesCache = new Map<string, readonly ScenarioPlace[]>();
let specReads = 0;

/** Drop every cached spec and reset the read counter. */
export function clearScenarioLookupCache(): void {
  placesCache.clear();
  specReads = 0;
}

/** How many spec files have been read since the last cache clear. */
export function scenarioSpecReadCount(): number {
  return specReads;
}

function specFilePath(openspecRoot: string, capability: string): string {
  return path.join(openspecRoot, 'specs', capability, 'spec.md');
}
function deltaFilePath(changeFolder: string, capability: string): string {
  return path.join(changeFolder, 'specs', capability, 'spec.md');
}
function relativeToHolder(openspecRoot: string, filePath: string): string {
  return path.relative(path.dirname(openspecRoot), filePath);
}
function readSpec(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  specReads++;
  return readFileSync(filePath, 'utf8');
}
function scenarioList(spec: CapabilitySpec): readonly DeltaScenario[] {
  return spec.requirements.flatMap((requirement) => requirement.scenarios);
}

/** The living spec as a place list: one entry, or none when it is absent. */
function livingPlaces(
  openspecRoot: string,
  capability: string,
  content: string | null,
): ScenarioPlace[] {
  if (content === null) return [];
  return [
    {
      relativePath: relativeToHolder(openspecRoot, specFilePath(openspecRoot, capability)),
      scenarios: scenarioList(parseCapabilitySpec(content)),
    },
  ];
}

/** The living spec merged with one change's delta, when the delta exists. */
function loadEffectivePlaces(
  openspecRoot: string,
  changeFolder: string | null,
  capability: string,
): ScenarioPlace[] {
  const living = readSpec(specFilePath(openspecRoot, capability));
  if (changeFolder === null) return livingPlaces(openspecRoot, capability, living);
  const deltaRaw = readSpec(deltaFilePath(changeFolder, capability));
  if (deltaRaw === null) return livingPlaces(openspecRoot, capability, living);
  const merged = mergeDelta(living, capability, parseDelta(deltaRaw));
  return livingPlaces(openspecRoot, capability, merged);
}

/** The living spec plus every active change's ADDED/MODIFIED requirements. */
function loadAllPlaces(openspecRoot: string, capability: string): ScenarioPlace[] {
  const places = livingPlaces(
    openspecRoot,
    capability,
    readSpec(specFilePath(openspecRoot, capability)),
  );
  const changesDir = path.join(openspecRoot, 'changes');
  if (!existsSync(changesDir)) return places;
  const names = readdirSync(changesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isActiveChangeFolderName(entry.name))
    .map((entry) => entry.name)
    .sort();
  for (const name of names) {
    const filePath = deltaFilePath(path.join(changesDir, name), capability);
    const raw = readSpec(filePath);
    if (raw === null) continue;
    const delta = parseDelta(raw);
    const relativePath = relativeToHolder(openspecRoot, filePath);
    for (const requirement of [...delta.added, ...delta.modified]) {
      if (requirement.scenarios.length > 0) {
        places.push({ relativePath, scenarios: requirement.scenarios });
      }
    }
  }
  return places;
}

function cachedPlaces(key: string, produce: () => ScenarioPlace[]): readonly ScenarioPlace[] {
  const cached = placesCache.get(key);
  if (cached !== undefined) return cached;
  const places = produce();
  placesCache.set(key, places);
  return places;
}

function effectivePlaces(
  openspecRoot: string,
  changeFolder: string | null,
  capability: string,
): readonly ScenarioPlace[] {
  const key = `effective\u0000${openspecRoot}\u0000${changeFolder ?? ''}\u0000${capability}`;
  return cachedPlaces(key, () => loadEffectivePlaces(openspecRoot, changeFolder, capability));
}

function allPlaces(openspecRoot: string, capability: string): readonly ScenarioPlace[] {
  const key = `all\u0000${openspecRoot}\u0000\u0000${capability}`;
  return cachedPlaces(key, () => loadAllPlaces(openspecRoot, capability));
}

/** Every scenario of one capability's effective spec, for lint. */
export function effectiveScenarios(
  openspecRoot: string,
  changeFolder: string | null,
  capability: string,
): readonly DeltaScenario[] {
  const root = path.resolve(openspecRoot);
  const folder = changeFolder === null ? null : path.resolve(changeFolder);
  return effectivePlaces(root, folder, capability).flatMap((place) => place.scenarios);
}

/** The first scenario name that repeats, in document order, or null. */
function duplicateScenarioName(places: readonly ScenarioPlace[]): string | null {
  for (const place of places) {
    const seen = new Set<string>();
    for (const scenario of place.scenarios) {
      if (seen.has(scenario.name)) return scenario.name;
      seen.add(scenario.name);
    }
  }
  return null;
}

function definitionsOf(places: readonly ScenarioPlace[], name: string): ScenarioDefinition[] {
  const definitions: ScenarioDefinition[] = [];
  for (const place of places) {
    for (const scenario of place.scenarios) {
      if (scenario.name === name) definitions.push({ place, outcomes: scenario.outcomes });
    }
  }
  return definitions;
}

function sameOutcomes(a: readonly ScenarioOutcome[], b: readonly ScenarioOutcome[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function resolveDefinitions(
  capability: string,
  name: string,
  definitions: readonly ScenarioDefinition[],
): readonly ScenarioOutcome[] {
  const first = definitions[0];
  const conflict = definitions
    .slice(1)
    .find((definition) => !sameOutcomes(first.outcomes, definition.outcomes));
  if (conflict === undefined) return first.outcomes;
  throw new Error(
    `The ${capability} scenario "${name}" differs between ${first.place.relativePath} and ` +
      `${conflict.place.relativePath}; set OSQ_CHANGE to the change folder the test should prove`,
  );
}

/** The nearest ancestor of `cwd`, included, that holds `openspec/specs`. */
function findOpenspecRoot(cwd: string): string {
  const start = path.resolve(cwd);
  let dir = start;
  for (;;) {
    if (existsSync(path.join(dir, 'openspec', 'specs'))) return path.join(dir, 'openspec');
    const parent = path.dirname(dir);
    if (parent === dir) return path.join(start, 'openspec');
    dir = parent;
  }
}

function resolveLocation(cwd: string, env: Record<string, string | undefined>): SpecLocation {
  const raw = env.OSQ_CHANGE?.trim();
  if (raw) {
    const changeFolder = path.resolve(cwd, raw);
    return { openspecRoot: path.dirname(path.dirname(changeFolder)), changeFolder };
  }
  return { openspecRoot: findOpenspecRoot(cwd), changeFolder: null };
}

/**
 * The outcomes of one scenario, looked up by capability and exact name. Throws
 * with the exact message when the scenario is missing, duplicated, defined in
 * disagreeing places, or its delta cannot be merged.
 */
export function lookupScenario(
  capability: string,
  name: string,
  cwd: string,
  env: Record<string, string | undefined>,
): readonly ScenarioOutcome[] {
  const location = resolveLocation(cwd, env);
  const places =
    location.changeFolder === null
      ? allPlaces(location.openspecRoot, capability)
      : effectivePlaces(location.openspecRoot, location.changeFolder, capability);

  const duplicate = duplicateScenarioName(places);
  if (duplicate !== null) {
    throw new Error(`The ${capability} spec has two scenarios named "${duplicate}"`);
  }
  const definitions = definitionsOf(places, name);
  if (definitions.length === 0) {
    throw new Error(`The ${capability} spec has no scenario "${name}"`);
  }
  return resolveDefinitions(capability, name, definitions);
}
