import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import {
  type DeltaRequirement,
  type ParsedDelta,
  normalizeRequirementName,
  parseCapabilitySpec,
  parseDelta,
} from '../spec/delta.js';
import { formatApprovalDigest } from '../spec/digest.js';
import { getSpecsDir } from '../status/layout.js';
import type { SpecDetails } from '../status/show-types.js';
import type { WebDeltaCapability, WebDeltaRequirement, WebReview } from './web-data-types.js';

/** Plain code-unit comparison, matching the digest's capability ordering. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Trim one proposal section and drop the planner template's HTML comments. */
function sectionText(text: string | undefined): string {
  return (text ?? '').replace(/<!--[\s\S]*?-->/g, '').trim();
}

/** The living requirement block named by `name`, or null when none matches. */
function livingRequirement(requirements: readonly DeltaRequirement[], name: string): string | null {
  const wanted = normalizeRequirementName(name);
  const found = requirements.find((entry) => normalizeRequirementName(entry.name) === wanted);
  return found ? found.raw : null;
}

/** The delta's requirements in added, modified, removed, renamed order. */
function buildRequirements(
  delta: ParsedDelta,
  living: readonly DeltaRequirement[],
): WebDeltaRequirement[] {
  const entries: WebDeltaRequirement[] = [];
  for (const requirement of delta.added) {
    entries.push({
      operation: 'added',
      name: requirement.name,
      from: null,
      proposed: requirement.raw,
      living: null,
    });
  }
  for (const requirement of delta.modified) {
    entries.push({
      operation: 'modified',
      name: requirement.name,
      from: null,
      proposed: requirement.raw,
      living: livingRequirement(living, requirement.name),
    });
  }
  for (const requirement of delta.removed) {
    entries.push({
      operation: 'removed',
      name: requirement.name,
      from: null,
      proposed: null,
      living: livingRequirement(living, requirement.name),
    });
  }
  for (const rename of delta.renamed) {
    entries.push({
      operation: 'renamed',
      name: rename.to,
      from: rename.from,
      proposed: null,
      living: livingRequirement(living, rename.from),
    });
  }
  return entries;
}

/** The living requirements of one capability, empty when its spec is absent. */
async function readLivingRequirements(
  specsDir: string,
  capability: string,
): Promise<readonly DeltaRequirement[]> {
  const content = await fs
    .readFile(path.join(specsDir, capability, 'spec.md'), 'utf8')
    .catch(() => null);
  return content === null ? [] : parseCapabilitySpec(content).requirements;
}

/** One entry per capability folder with a delta spec, sorted by name. */
async function readDeltas(changeFolder: string, specsDir: string): Promise<WebDeltaCapability[]> {
  const deltasDir = path.join(changeFolder, 'specs');
  const entries = await fs.readdir(deltasDir, { withFileTypes: true }).catch(() => []);
  const names = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareText);
  const capabilities: WebDeltaCapability[] = [];
  for (const name of names) {
    const content = await fs
      .readFile(path.join(deltasDir, name, 'spec.md'), 'utf8')
      .catch(() => null);
    if (content === null) continue;
    const living = await readLivingRequirements(specsDir, name);
    capabilities.push({
      capability: name,
      requirements: buildRequirements(parseDelta(content), living),
    });
  }
  return capabilities;
}

/**
 * The approve review for an active change without `.run/approved`; null for
 * every other change. Every text is verbatim and trimmed; nothing is diffed.
 */
export async function readWebReview(
  projectRoot: string,
  details: SpecDetails,
  config: OsqConfig,
): Promise<WebReview | null> {
  const digest = details.digest;
  if (details.location !== 'active' || details.approvedHash !== null || !digest) return null;

  const specsDir = getSpecsDir(config.paths.openspecRoot, projectRoot);
  return {
    goal: sectionText(details.goal),
    nonGoals: sectionText(details.nonGoals),
    surface: sectionText(details.surface),
    decisions: sectionText(details.decisions),
    humanSteps: sectionText(digest.humanSteps),
    contract: sectionText(details.contract),
    deltas: await readDeltas(details.folderPath, specsDir),
    digest,
    digestText: formatApprovalDigest(digest),
  };
}
