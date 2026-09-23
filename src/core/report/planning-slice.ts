import path from 'node:path';
import type { PlanningPrice } from '../foundation/config-planning.js';
import type { PlanningUsage } from './planning-records.js';
import {
  activeMinutes,
  combineCache,
  lastEditTimestamp,
  resolveSliceCost,
  sumTokens,
} from './planning-slice-measures.js';

/** One model response read from a native planning transcript. */
export interface PlanningTurn {
  readonly timestamp: string;
  readonly model: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly cacheReadTokens: number | null;
  readonly cacheWriteTokens: number | null;
  readonly reasoningTokens: number | null;
  readonly cost: number | null;
  /** Raw paths exactly as reported, resolved like today's edits. */
  readonly edits: readonly string[];
}

/** Origin of a slice's cost: a harness report, the price table, or nothing. */
export type PlanningCostSource = 'harness' | 'price_table' | null;

/** Per-kind token totals of one owned slice. */
export interface PlanningTokens {
  readonly input: number | null;
  readonly output: number | null;
  readonly cacheRead: number | null;
  readonly cacheWrite: number | null;
  readonly reasoning: number | null;
}

/** The measured slice of one session that one change owns. */
export interface PlanningSlice {
  readonly start: string;
  readonly end: string;
  readonly approvedAt: string;
  readonly lastEditAt: string | null;
  readonly turns: number;
  readonly activeMinutes: number;
  readonly tokens: PlanningTokens;
  readonly costSource: PlanningCostSource;
}

export interface SliceRequest {
  readonly changeFolder: string;
  readonly changesDir: string | null;
  readonly sessionId: string;
  readonly sessionDir: string | null;
  readonly approvedAt: string;
  readonly turns: readonly PlanningTurn[];
  readonly sessionCost: number | null;
  readonly idleGapMinutes: number;
  readonly prices?: Readonly<Record<string, PlanningPrice>>;
  readonly resolveApproval: (changeFolder: string, sessionId: string) => Promise<string | null>;
}

export interface SliceResult {
  readonly slice: PlanningSlice;
  readonly usage: PlanningUsage;
  readonly ownedTurns: readonly PlanningTurn[];
}

/** Segment-aware containment: a sibling prefix or `..` escape is never inside. */
export function isSegmentContained(folder: string, target: string): boolean {
  const relative = path.relative(path.resolve(folder), path.resolve(target));
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

/** Resolve one raw tool path against its recorded session directory. */
export function resolveEditPath(raw: string, sessionDir: string | null): string | null {
  if (!raw) return null;
  if (path.isAbsolute(raw)) return path.resolve(raw);
  return sessionDir ? path.resolve(sessionDir, raw) : null;
}

/**
 * Resolve one raw tool path against its recorded session directory, then
 * require segment containment by the change folder.
 */
export function normalizeObservedTarget(
  raw: string,
  sessionDir: string | null,
  changeFolder: string,
): string | null {
  const resolved = resolveEditPath(raw, sessionDir);
  if (!resolved) return null;
  return isSegmentContained(changeFolder, resolved) ? resolved : null;
}

/**
 * The change folder a normalized path belongs to, recognized by name directly
 * under the changes directory or under its `archive/`.
 */
export function changeFolderForPath(changesDir: string, target: string): string | null {
  const root = path.resolve(changesDir);
  const relative = path.relative(root, path.resolve(target));
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return null;
  }
  const segments = relative.split(path.sep);
  if (segments[0] === 'archive') {
    return segments.length >= 3 ? path.join(root, 'archive', segments[1]) : null;
  }
  if (segments[0] === 'rejected' || segments.length < 2) return null;
  return path.join(root, segments[0]);
}

function sortTurns(turns: readonly PlanningTurn[]): PlanningTurn[] {
  return [...turns].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function turnOwner(request: SliceRequest, turn: PlanningTurn): string | null {
  for (const raw of turn.edits) {
    const resolved = resolveEditPath(raw, request.sessionDir);
    if (!resolved) continue;
    if (request.changesDir) {
      const folder = changeFolderForPath(request.changesDir, resolved);
      if (folder) return folder;
    }
    if (isSegmentContained(request.changeFolder, resolved)) return request.changeFolder;
  }
  return null;
}

interface Boundary {
  readonly time: string;
  readonly change: string;
}

async function collectBoundaries(
  request: SliceRequest,
  owners: readonly (string | null)[],
): Promise<Boundary[]> {
  const changes = new Set<string>([request.changeFolder]);
  for (const owner of owners) {
    if (owner) changes.add(owner);
  }
  const boundaries: Boundary[] = [];
  for (const change of changes) {
    if (change === request.changeFolder) {
      boundaries.push({ time: request.approvedAt, change });
      continue;
    }
    const time = await request.resolveApproval(change, request.sessionId);
    if (time !== null) boundaries.push({ time, change });
  }
  return boundaries.sort(
    (a, b) => a.time.localeCompare(b.time) || a.change.localeCompare(b.change),
  );
}

/** Assign every turn to at most one change under planning turn attribution. */
function assignOwnership(
  turns: readonly PlanningTurn[],
  owners: readonly (string | null)[],
  boundaries: readonly Boundary[],
): (string | null)[] {
  const assigned = [...owners];
  for (let index = 0; index < turns.length; index++) {
    if (owners[index] !== null) continue;
    const closing =
      boundaries.find((boundary) => boundary.time >= turns[index].timestamp) ??
      boundaries[boundaries.length - 1];
    if (!closing) continue;
    let owner: string | null = null;
    for (let next = index + 1; next < turns.length; next++) {
      if (turns[next].timestamp > closing.time) break;
      if (owners[next] !== null) {
        owner = owners[next];
        break;
      }
    }
    assigned[index] = owner ?? closing.change;
  }
  return assigned;
}

function buildUsage(tokens: PlanningTokens, cost: number | null): PlanningUsage {
  return {
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    cachedTokens: combineCache(tokens.cacheRead, tokens.cacheWrite),
    reasoningTokens: tokens.reasoning,
    cost,
  };
}

/** Cut one session to the turns a change owns and measure that slice. */
export async function sliceChangeOwnership(request: SliceRequest): Promise<SliceResult | null> {
  const turns = sortTurns(request.turns);
  if (turns.length === 0) return null;
  const owners = turns.map((turn) => turnOwner(request, turn));
  const boundaries = await collectBoundaries(request, owners);
  const assigned = assignOwnership(turns, owners, boundaries);
  const owned = turns.filter((_, index) => assigned[index] === request.changeFolder);
  if (owned.length === 0) return null;

  const tokens = sumTokens(owned);
  const complete = owned.length === turns.length;
  const { cost, costSource } = resolveSliceCost(
    owned,
    complete,
    request.sessionCost,
    request.prices,
  );
  return {
    slice: {
      start: owned[0].timestamp,
      end: owned[owned.length - 1].timestamp,
      approvedAt: request.approvedAt,
      lastEditAt: lastEditTimestamp(owned),
      turns: owned.length,
      activeMinutes: activeMinutes(owned, request.idleGapMinutes),
      tokens,
      costSource,
    },
    usage: buildUsage(tokens, cost),
    ownedTurns: owned,
  };
}
