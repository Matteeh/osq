/** Builds the deterministic digest document for `osq digest`. */

import type { OsqConfig } from '../foundation/config.js';
import { type Adr, readDecisions, sameAdrNumber } from '../foundation/decisions.js';
import { matchesFolder } from '../status/change-locations.js';
import {
  type ArchivedCapability,
  type ArchivedChangeRecord,
  listArchivedChanges,
} from './archive-record.js';
import { type DigestPeriod, buildDigestPeriod } from './change-digest-period.js';

export interface DigestRequest {
  readonly ids: readonly string[];
  readonly since: string | null;
  readonly until: string | null;
  readonly cost: boolean;
}

/** A refusal from the digest's selection rules. */
export class DigestSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DigestSelectionError';
  }
}

export interface DigestIdSelection {
  readonly kind: 'ids';
  readonly ids: readonly string[];
}

export interface DigestRangeSelection {
  readonly kind: 'range';
  readonly since: string;
  readonly until: string | null;
}

export type DigestSelection = DigestIdSelection | DigestRangeSelection;

export interface DigestRequirement {
  readonly id: string;
  readonly name: string;
}

export interface DigestRenamedRequirement extends DigestRequirement {
  readonly from: string;
}

export interface DigestCapability {
  readonly name: string;
  readonly added: readonly DigestRequirement[];
  readonly modified: readonly DigestRequirement[];
  readonly removed: readonly DigestRequirement[];
  readonly renamed: readonly DigestRenamedRequirement[];
}

export interface DigestAdrEntry {
  readonly id: string;
  readonly number: string;
  readonly rule: string | null;
}

export interface DigestTasks {
  readonly count: number;
  readonly attempts: number | null;
  readonly dead: readonly { readonly task: string; readonly reason: string }[] | null;
  readonly halts: number | null;
}

export interface DigestChange {
  readonly id: string;
  readonly title: string | null;
  readonly archivedAt: string | null;
  readonly archivedOn: string | null;
  readonly goal: string | null;
  readonly capabilities: readonly DigestCapability[];
  readonly decisions: readonly DigestAdrEntry[];
  readonly tasks: DigestTasks;
  readonly elapsedMs: number | null;
  readonly cost?: number | null;
  readonly executorModels?: readonly string[];
  readonly planner?: string | null;
}

/** The whole digest document, `schemaVersion: 1`. */
export interface ChangeDigest {
  readonly schemaVersion: 1;
  readonly selection: DigestSelection;
  readonly period: DigestPeriod | null;
  readonly changes: readonly DigestChange[];
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isDate(value: string): boolean {
  return DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

function validateRequest(request: DigestRequest): void {
  if (request.ids.length > 0 && request.since !== null) {
    throw new DigestSelectionError('Give change ids or --since, not both');
  }
  if (request.until !== null && request.since === null) {
    throw new DigestSelectionError('--until needs --since');
  }
  if (request.ids.length === 0 && request.since === null) {
    throw new DigestSelectionError('Give change ids or --since <date>');
  }
  if (request.since !== null && !isDate(request.since)) {
    throw new DigestSelectionError(`--since is not a YYYY-MM-DD date: ${request.since}`);
  }
  if (request.until !== null && !isDate(request.until)) {
    throw new DigestSelectionError(`--until is not a YYYY-MM-DD date: ${request.until}`);
  }
  if (request.since !== null && request.until !== null && request.until < request.since) {
    throw new DigestSelectionError('--until is before --since');
  }
}

function compareIds(a: string, b: string): number {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareChanges(a: ArchivedChangeRecord, b: ArchivedChangeRecord): number {
  if (a.archivedOn !== b.archivedOn) {
    if (a.archivedOn === null) return 1;
    if (b.archivedOn === null) return -1;
    return a.archivedOn < b.archivedOn ? -1 : 1;
  }
  return compareIds(a.id, b.id);
}

function selectByIds(
  records: readonly ArchivedChangeRecord[],
  ids: readonly string[],
): ArchivedChangeRecord[] {
  const selected = new Map<string, ArchivedChangeRecord>();
  const unmatched: string[] = [];
  for (const id of ids) {
    const matches = records.filter((record) => matchesFolder(record.folder, id));
    if (matches.length === 0) unmatched.push(id);
    for (const record of matches) selected.set(record.folder, record);
  }
  if (unmatched.length > 0) {
    throw new DigestSelectionError(`No archived change matches: ${unmatched.join(', ')}`);
  }
  return [...selected.values()].sort(compareChanges);
}

function selectByRange(
  records: readonly ArchivedChangeRecord[],
  since: string,
  until: string | null,
): ArchivedChangeRecord[] {
  return records
    .filter(
      (record) =>
        record.archivedOn !== null &&
        record.archivedOn >= since &&
        (until === null || record.archivedOn <= until),
    )
    .sort(compareChanges);
}

function requirementId(changeId: string, capability: string, kind: string, name: string): string {
  return `${changeId}/${capability}/${kind}/${name}`;
}

function namedEntries(
  changeId: string,
  capability: string,
  kind: string,
  names: readonly string[],
): DigestRequirement[] {
  return names.map((name) => ({ id: requirementId(changeId, capability, kind, name), name }));
}

function buildCapability(changeId: string, capability: ArchivedCapability): DigestCapability {
  return {
    name: capability.name,
    added: namedEntries(changeId, capability.name, 'added', capability.added),
    modified: namedEntries(changeId, capability.name, 'modified', capability.modified),
    removed: namedEntries(changeId, capability.name, 'removed', capability.removed),
    renamed: capability.renamed.map((rename) => ({
      id: requirementId(changeId, capability.name, 'renamed', rename.to),
      name: rename.to,
      from: rename.from,
    })),
  };
}

function buildDecisions(numbers: readonly string[] | null, adrs: readonly Adr[]): DigestAdrEntry[] {
  return (numbers ?? []).map((number) => {
    const adr = adrs.find((entry) => sameAdrNumber(entry.number, number));
    return { id: `ADR-${number}`, number, rule: adr ? adr.rule : null };
  });
}

function buildChange(
  record: ArchivedChangeRecord,
  adrs: readonly Adr[],
  cost: boolean,
): DigestChange {
  return {
    id: record.id,
    title: record.title,
    archivedAt: record.archivedAt,
    archivedOn: record.archivedOn,
    goal: record.goal,
    capabilities: record.capabilities.map((capability) => buildCapability(record.id, capability)),
    decisions: buildDecisions(record.decisions, adrs),
    tasks: record.tasks,
    elapsedMs: record.elapsedMs,
    ...(cost
      ? { cost: record.cost, executorModels: record.executorModels, planner: record.planner }
      : {}),
  };
}

export async function buildChangeDigest(
  projectRoot: string,
  config: OsqConfig,
  request: DigestRequest,
): Promise<ChangeDigest> {
  validateRequest(request);
  const [records, decisions] = await Promise.all([
    listArchivedChanges(projectRoot, config),
    readDecisions(projectRoot, config),
  ]);
  const adrs = decisions.adrs;
  const byIds = request.ids.length > 0;
  const since = request.since as string;
  const selected = byIds
    ? selectByIds(records, request.ids)
    : selectByRange(records, since, request.until);
  const changes = selected.map((record) => buildChange(record, adrs, request.cost));
  return {
    schemaVersion: 1,
    selection: byIds
      ? { kind: 'ids', ids: request.ids }
      : { kind: 'range', since, until: request.until },
    period: byIds ? null : buildDigestPeriod(changes, adrs, since, request.until, request.cost),
    changes,
  };
}
