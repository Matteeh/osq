/** One archived change, read from its folder into a single record. */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { readManifestApprovedAt } from '../run/manifest-approval.js';
import { parseDelta } from '../spec/delta.js';
import { extractSection, parseFrontmatter, resolveChangeDoc } from '../spec/parser.js';
import { type LocatedChange, listChanges } from '../status/change-locations.js';
import {
  countTasks,
  listDeltaCapabilities,
  readBriefMetadata,
  readLandedAt,
  readManifestMetadata,
  readPlannerAttribution,
} from '../web/web-data-lifecycle.js';
import { type ArchivedDeadAttempt, readArchivedRunFields } from './archive-record-run.js';

/** One renamed requirement in a change's delta. */
export interface ArchivedRename {
  readonly from: string;
  readonly to: string;
}

/** One capability a change writes, with its delta requirement names. */
export interface ArchivedCapability {
  readonly name: string;
  readonly added: readonly string[];
  readonly modified: readonly string[];
  readonly removed: readonly string[];
  readonly renamed: readonly ArchivedRename[];
}

/** The task totals of an archived change. */
export interface ArchivedTasks {
  readonly count: number;
  readonly attempts: number | null;
  readonly dead: readonly ArchivedDeadAttempt[] | null;
  readonly halts: number | null;
}

/** Everything one archived change folder holds, with missing fields as null. */
export interface ArchivedChangeRecord {
  readonly id: string;
  readonly folder: string;
  readonly title: string | null;
  readonly archivedAt: string | null;
  readonly archivedOn: string | null;
  readonly goal: string | null;
  readonly capabilities: readonly ArchivedCapability[];
  readonly decisions: readonly string[] | null;
  readonly tasks: ArchivedTasks;
  readonly elapsedMs: number | null;
  readonly cost: number | null;
  readonly executorModels: readonly string[];
  readonly planner: string | null;
}

const DECISIONS_HEADING = /^##\s+Decisions\s*$/m;
const ADR_NUMBER = /ADR\s+(\d+)/g;

/** The folder's leading digits, as written, or an empty string. */
function leadingDigits(folderName: string): string {
  const match = /^(\d+)/.exec(folderName);
  return match ? match[1] : '';
}

/** A trimmed non-empty string, else null. */
function trimmedOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** A timestamp's UTC calendar day as `YYYY-MM-DD`, or null. */
function utcDay(timestamp: string | null): string | null {
  if (timestamp === null) return null;
  const ms = Date.parse(timestamp);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
}

/** Milliseconds between two timestamps, or null when missing or negative. */
function elapsedMs(from: string | null, to: string | null): number | null {
  if (from === null || to === null) return null;
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const delta = end - start;
  return delta >= 0 ? delta : null;
}

/** Distinct `ADR <n>` numbers in the `## Decisions` section, padded, or null. */
function readAdrNumbers(body: string): readonly string[] | null {
  if (!DECISIONS_HEADING.test(body)) return null;
  const numbers = new Set<number>();
  for (const match of extractSection(body, 'Decisions').matchAll(ADR_NUMBER)) {
    numbers.add(Number.parseInt(match[1], 10));
  }
  return [...numbers].sort((a, b) => a - b).map((number) => String(number).padStart(3, '0'));
}

interface ProposalFields {
  readonly title: string | null;
  readonly goal: string | null;
  readonly decisions: readonly string[] | null;
}

/** Reads the change document's title, Goal, and named ADR numbers. */
async function readProposal(folderPath: string): Promise<ProposalFields> {
  const empty = { title: null, goal: null, decisions: null };
  const resolved = await resolveChangeDoc(folderPath);
  if (resolved === null) return empty;
  const content = await fs.readFile(resolved.path, 'utf8').catch(() => null);
  if (content === null) return empty;
  const { data, body } = parseFrontmatter(content);
  const goal = extractSection(body, 'Goal');
  return {
    title: trimmedOrNull(data.title),
    goal: goal ? goal : null,
    decisions: readAdrNumbers(body),
  };
}

/** One `specs/<capability>/spec.md`, parsed into its delta requirement names. */
async function readCapability(
  folderPath: string,
  name: string,
): Promise<ArchivedCapability | null> {
  const filePath = path.join(folderPath, 'specs', name, 'spec.md');
  const content = await fs.readFile(filePath, 'utf8').catch(() => null);
  if (content === null) return null;
  const delta = parseDelta(content);
  return {
    name,
    added: delta.added.map((requirement) => requirement.name),
    modified: delta.modified.map((requirement) => requirement.name),
    removed: delta.removed.map((requirement) => requirement.name),
    renamed: delta.renamed.map((rename) => ({ from: rename.from, to: rename.to })),
  };
}

/** Every delta capability of a change, in capability name order. */
async function readCapabilities(folderPath: string): Promise<readonly ArchivedCapability[]> {
  const names = await listDeltaCapabilities(folderPath);
  const capabilities: ArchivedCapability[] = [];
  for (const name of names) {
    const capability = await readCapability(folderPath, name);
    if (capability) capabilities.push(capability);
  }
  return capabilities;
}

/** Reads one archived change folder into a record. Never throws. */
export async function readArchivedChange(change: LocatedChange): Promise<ArchivedChangeRecord> {
  const folderPath = change.folderPath;
  const [proposal, run, count, approvedAt, archivedAt, brief, manifest, capabilities] =
    await Promise.all([
      readProposal(folderPath),
      readArchivedRunFields(change),
      countTasks(folderPath),
      readManifestApprovedAt(folderPath),
      readLandedAt(folderPath),
      readBriefMetadata(folderPath),
      readManifestMetadata(folderPath),
      readCapabilities(folderPath),
    ]);

  return {
    id: leadingDigits(change.folderName),
    folder: change.folderName,
    title: proposal.title,
    archivedAt,
    archivedOn: utcDay(archivedAt),
    goal: proposal.goal,
    capabilities,
    decisions: proposal.decisions,
    tasks: {
      count,
      attempts: run.attempts,
      dead: run.dead,
      halts: run.halts,
    },
    elapsedMs: elapsedMs(approvedAt, archivedAt),
    cost: run.cost,
    executorModels: run.executorModels,
    planner: await readPlannerAttribution(brief, manifest),
  };
}

/** Every archived change `listChanges` finds, in folder order. */
export async function listArchivedChanges(
  projectRoot: string,
  config: OsqConfig,
): Promise<ArchivedChangeRecord[]> {
  const changes = await listChanges(projectRoot, config, ['archived']);
  return Promise.all(changes.map((change) => readArchivedChange(change)));
}
