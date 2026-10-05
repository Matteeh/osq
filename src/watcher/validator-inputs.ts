import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/foundation/config.js';
import {
  type DeltaRequirement,
  type DeltaScenario,
  normalizeRequirementName,
  parseCapabilitySpec,
  parseDelta,
} from '../core/spec/delta.js';
import { compareNumericPrefix } from '../core/status/state.js';
import { isTestPath } from '../core/trace/test-path.js';
import type { Vcs } from '../core/vcs/vcs.js';
import type { ValidatorNotRunReason } from '../harness/types.js';

/** One scenario the validator is asked to judge. */
export interface JudgedScenario {
  readonly capability: string;
  readonly requirement: string;
  readonly scenario: string;
  /** The scenario's block as the delta spec writes it, trimmed. */
  readonly text: string;
}

export interface ValidatorInputs {
  readonly base: string;
  readonly deltaPaths: readonly string[];
  readonly scenarios: readonly JudgedScenario[];
  readonly patch: string;
  readonly testPaths: readonly string[];
  readonly resultPaths: readonly string[];
}

const RESULT_FILE_REGEX = /^(\d+)\.md$/;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/** Read a UTF-8 file, or null when it is missing or unreadable. */
async function readTextOrNull(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

/** Names of the immediate subdirectories of `dir`, or an empty list. */
async function listDirectories(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** Names of the immediate files of `dir`, or an empty list. */
async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Whether the living requirement already holds the identical scenario text. */
function hasScenario(requirement: DeltaRequirement, scenario: DeltaScenario): boolean {
  return requirement.scenarios.some(
    (candidate) =>
      candidate.name.trim() === scenario.name.trim() &&
      candidate.raw.trim() === scenario.raw.trim(),
  );
}

/**
 * The scenarios a validator should judge: those under an ADDED or MODIFIED
 * requirement that the same-named living requirement at the base does not
 * already hold word for word. Capabilities come in name order, requirements
 * in document order, and each requirement's scenarios in document order.
 */
export function judgedScenarios(
  deltas: ReadonlyMap<string, string>,
  livingAtBase: ReadonlyMap<string, string | null>,
): JudgedScenario[] {
  const scenarios: JudgedScenario[] = [];
  for (const capability of [...deltas.keys()].sort()) {
    const delta = parseDelta(deltas.get(capability) as string);
    const livingContent = livingAtBase.get(capability);
    const livingByName = new Map<string, DeltaRequirement>();
    if (livingContent) {
      for (const requirement of parseCapabilitySpec(livingContent).requirements) {
        livingByName.set(normalizeRequirementName(requirement.name), requirement);
      }
    }
    for (const requirement of [...delta.added, ...delta.modified]) {
      const name = normalizeRequirementName(requirement.name);
      const living = livingByName.get(name);
      for (const scenario of requirement.scenarios) {
        if (living && hasScenario(living, scenario)) continue;
        scenarios.push({
          capability,
          requirement: name,
          scenario: scenario.name,
          text: scenario.raw.trim(),
        });
      }
    }
  }
  return scenarios;
}

/** Split a binary patch into its `diff --git` blocks, bytes preserved. */
function patchBlocks(patch: string): string[] {
  return patch.split(/(?=^diff --git a\/)/m).filter((block) => block.length > 0);
}

/** A block's project-relative path: its `b/` side, or `a/` when `b` is null. */
function blockPath(block: string): string | null {
  const end = block.indexOf('\n');
  const header = end === -1 ? block : block.slice(0, end);
  const match = header.match(/^diff --git a\/(.+) b\/(.+)$/);
  if (!match) return null;
  return match[2] === '/dev/null' ? match[1] : match[2];
}

/** Drop every patch block whose path sits under the OpenSpec root. */
function dropOpenSpecBlocks(patch: string, openspecRoot: string): string {
  const prefix = `${trimTrailingSlash(openspecRoot)}/`;
  return patchBlocks(patch)
    .filter((block) => {
      const blockPathValue = blockPath(block);
      return blockPathValue === null || !blockPathValue.startsWith(prefix);
    })
    .join('');
}

/** Patch paths that name an existing test file, sorted and deduplicated. */
async function existingTestPaths(projectRoot: string, patch: string): Promise<string[]> {
  const candidates = patchBlocks(patch)
    .map((block) => blockPath(block))
    .filter((value): value is string => value !== null && isTestPath(value));
  const kept: string[] = [];
  for (const candidate of candidates) {
    if (await exists(path.resolve(projectRoot, candidate))) kept.push(candidate);
  }
  return [...new Set(kept)].sort();
}

/** The change's existing result files, in task number order, project-relative. */
async function existingResultPaths(projectRoot: string, specFolderPath: string): Promise<string[]> {
  const resultsDir = path.join(specFolderPath, '.run', 'results');
  return (await listFiles(resultsDir))
    .filter((name) => RESULT_FILE_REGEX.test(name))
    .sort(compareNumericPrefix)
    .map((name) => path.relative(projectRoot, path.join(resultsDir, name)));
}

export function formatScenariosFile(scenarios: readonly JudgedScenario[]): string {
  const lines = ['# Scenarios to judge'];
  const groups = new Map<string, { heading: string; texts: string[] }>();
  for (const scenario of scenarios) {
    const key = `${scenario.capability}\u0000${scenario.requirement}`;
    let group = groups.get(key);
    if (!group) {
      group = { heading: `## ${scenario.capability}: ${scenario.requirement}`, texts: [] };
      groups.set(key, group);
    }
    group.texts.push(scenario.text);
  }
  for (const group of groups.values()) {
    lines.push('', group.heading);
    for (const text of group.texts) lines.push('', text);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Gather what osq gives the validator, or return why it should not run. A
 * missing base or disabled git is `no_base`; no judged scenario is
 * `no_scenarios`.
 */
export async function readValidatorInputs(
  projectRoot: string,
  specFolderPath: string,
  vcs: Vcs,
  config: OsqConfig,
): Promise<ValidatorInputs | { readonly notRun: ValidatorNotRunReason }> {
  if (vcs.kind === 'none') return { notRun: 'no_base' };
  const base = ((await readTextOrNull(path.join(specFolderPath, '.run', 'base'))) ?? '').trim();
  if (base === '') return { notRun: 'no_base' };

  const specsDir = path.join(specFolderPath, 'specs');
  const capabilities = (await listDirectories(specsDir)).sort();
  const deltas = new Map<string, string>();
  const deltaPaths: string[] = [];
  for (const capability of capabilities) {
    const absolute = path.join(specsDir, capability, 'spec.md');
    const content = await readTextOrNull(absolute);
    if (content === null) continue;
    deltas.set(capability, content);
    deltaPaths.push(path.relative(projectRoot, absolute));
  }

  const livingAtBase = new Map<string, string | null>();
  for (const capability of capabilities) {
    const livingPath = path.posix.join(config.paths.features, capability, 'spec.md');
    livingAtBase.set(capability, await vcs.show(base, livingPath));
  }

  const scenarios = judgedScenarios(deltas, livingAtBase);
  if (scenarios.length === 0) return { notRun: 'no_scenarios' };

  const patch = dropOpenSpecBlocks(await vcs.patch(base), config.paths.openspecRoot);
  const testPaths = await existingTestPaths(projectRoot, patch);
  const resultPaths = await existingResultPaths(projectRoot, specFolderPath);
  return { base, deltaPaths, scenarios, patch, testPaths, resultPaths };
}
