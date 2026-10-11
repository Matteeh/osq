/**
 * The capability page model: one page per living capability, holding its
 * requirements, the accepted ADRs that bind it, its Code ownership, a code map
 * from the system graph when it is opted in to traceability, and the archived
 * changes that touched it. Everything is read from existing osq readers and
 * nothing is written.
 */

import { isCapabilityOptedIn } from '../core/foundation/config-traceability.js';
import type { OsqConfig } from '../core/foundation/config.js';
import { type Adr, governingAdrs, readDecisions } from '../core/foundation/decisions.js';
import { readCapabilityOwnership } from '../core/spec/capability-impact.js';
import { readLivingSidecar } from '../core/spec/capability-sidecar.js';
import {
  type CapabilitySpec,
  type DeltaRequirement,
  parseCapabilitySpec,
} from '../core/spec/delta.js';
import { collapseWhitespace } from '../core/spec/digest.js';
import { listCapabilityFolders, readCapabilitySpec } from '../core/web/web-data-folders.js';
import { buildCodeMaps } from './code-map.js';
import { docsConfig } from './docs-config.js';
import type {
  CapabilityPage,
  CapabilityPageDecision,
  CapabilityPageRequirement,
  CodeMapEntry,
} from './docs-types.js';
import { loadArchivedRecords, recentChangesFor } from './recent-changes.js';

/** One living capability read once for its page. */
interface LivingEntry {
  readonly name: string;
  readonly group: string | null;
  readonly spec: CapabilitySpec;
}

/** The `traceability.capabilities` value of a config, defaulting to none. */
function traceabilityCapabilities(config: OsqConfig): 'all' | readonly string[] {
  return config.traceability?.capabilities ?? [];
}

/** HTML comments removed, replaced by a space. */
function stripComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, ' ');
}

/** The sentences of `text`, whitespace collapsed. */
function sentences(text: string): string[] {
  const collapsed = collapseWhitespace(text);
  if (collapsed === '') return [];
  return collapsed.split(/(?<=[.!?])\s+/).filter((sentence) => sentence !== '');
}

/** The first sentence that holds `SHALL`, else the first sentence. */
function shallSentence(body: string): string {
  const found = sentences(stripComments(body));
  return found.find((sentence) => sentence.includes('SHALL')) ?? found[0] ?? '';
}

function mapRequirement(requirement: DeltaRequirement): CapabilityPageRequirement {
  return {
    name: requirement.name,
    scenarios: requirement.scenarios.map((scenario) => scenario.name),
    shall: shallSentence(requirement.body),
  };
}

function mapDecision(adr: Adr): CapabilityPageDecision {
  return {
    number: adr.number,
    title: adr.title,
    rule: adr.rule,
    appliesToAll: adr.appliesTo === 'all',
  };
}

/** Read every living capability's spec, sidecar, and purpose. */
async function readLivingEntries(projectRoot: string, config: OsqConfig): Promise<LivingEntry[]> {
  const folders = await listCapabilityFolders(projectRoot, config);
  const entries: LivingEntry[] = [];
  for (const folder of folders) {
    const content = await readCapabilitySpec(folder.folderPath);
    if (content === null) continue;
    const sidecar = await readLivingSidecar(projectRoot, config.paths.openspecRoot, folder.id);
    entries.push({
      name: folder.id,
      group: sidecar?.group ?? null,
      spec: parseCapabilitySpec(content),
    });
  }
  return entries;
}

/**
 * Build one page per living capability, in name order, with its requirements,
 * decisions, ownership, code map, and recent changes.
 *
 * @scenario docs: Pages of the docs fixture
 * @scenario docs: Recent change limit
 * @adr 016
 */
export async function buildCapabilityPages(
  projectRoot: string,
  config: OsqConfig,
): Promise<CapabilityPage[]> {
  const living = await readLivingEntries(projectRoot, config);
  const [records, ownerships, decisions] = await Promise.all([
    loadArchivedRecords(projectRoot, config),
    readCapabilityOwnership(projectRoot, config.paths.openspecRoot),
    readDecisions(projectRoot, config),
  ]);
  const limit = docsConfig(config).recentChanges;
  const capabilities = traceabilityCapabilities(config);
  const optedIn = new Set(
    living
      .filter((entry) => isCapabilityOptedIn(capabilities, entry.name))
      .map((entry) => entry.name),
  );
  const codeMaps =
    optedIn.size > 0
      ? await buildCodeMaps(
          projectRoot,
          config,
          living
            .filter((entry) => optedIn.has(entry.name))
            .map((entry) => ({ name: entry.name, requirements: entry.spec.requirements })),
        )
      : new Map<string, CodeMapEntry[]>();

  return living.map((entry) => ({
    name: entry.name,
    group: entry.group,
    purpose: entry.spec.purpose,
    requirements: entry.spec.requirements.map(mapRequirement),
    decisions: governingAdrs(decisions, [entry.name]).map(mapDecision),
    ownership: ownerships.find((o) => o.capability === entry.name)?.globs ?? [],
    codeMap: optedIn.has(entry.name) ? (codeMaps.get(entry.name) ?? []) : null,
    recentChanges: recentChangesFor(records, entry.name, limit),
  }));
}
