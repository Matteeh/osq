/**
 * The autopilot view: everything `autopilotStep` needs, read from files only.
 * It answers whether the queue file exists and parses (with its error), whether
 * any active change is paused on a usage limit, which active changes are
 * approved, and the first queue row that has not landed together with its
 * approval and, when it has an active or archived change, that change's
 * marker, planner run and next step.
 */

import fs from 'node:fs/promises';
import type { OsqConfig } from '../foundation/config.js';
import { type PlanRunView, currentPlanRun } from '../run/plan-run-record.js';
import { readActivePause } from '../run/usage-pause.js';
import { type AutopilotMarker, readAutopilotMarker } from './autopilot-marker.js';
import { type ChangeLocation, listChanges } from './change-locations.js';
import { type NextStep, readNextStep } from './next-step.js';
import { type ItemApproval, itemApproval, readQueueApproval } from './queue-approval.js';
import { type QueueItem, getQueuePath, parseQueue } from './queue-parser.js';
import {
  type QueueAssociation,
  type QueueAssociationGroups,
  type QueueRow,
  type QueueStateSnapshot,
  readQueueState,
} from './queue-state.js';
import { deriveSpecState } from './state.js';

/** Whether the queue file exists and parses. */
export interface AutopilotQueueView {
  readonly exists: boolean;
  /** The parse error, or null when the queue parses or does not exist. */
  readonly error: string | null;
}

/** One queue item's change, when the row has an active or archived change. */
export interface AutopilotChangeView {
  readonly id: string;
  readonly folderName: string;
  readonly folderPath: string;
  readonly location: ChangeLocation;
  readonly approved: boolean;
  readonly marker: AutopilotMarker | null;
  readonly planRun: PlanRunView | null;
  readonly nextStep: NextStep;
}

/** The first queue row that has not landed, with everything the step reads. */
export interface AutopilotItemView {
  readonly item: QueueItem;
  readonly row: QueueRow;
  readonly approval: ItemApproval;
  readonly change: AutopilotChangeView | null;
}

/** The whole view `autopilotStep` turns into one step. */
export interface AutopilotView {
  readonly queue: AutopilotQueueView;
  /** Whether any active change holds a pause `readActivePause` reports. */
  readonly pauseActive: boolean;
  /** The ids of active approved changes. */
  readonly approvedChangeIds: readonly string[];
  readonly firstOpenItem: AutopilotItemView | null;
}

/** Read the queue file's existence and parse error, without throwing. */
async function readQueueFile(projectRoot: string, config: OsqConfig): Promise<AutopilotQueueView> {
  const queuePath = getQueuePath(projectRoot, config);
  const content = await fs.readFile(queuePath, 'utf8').catch(() => null);
  if (content === null) return { exists: false, error: null };
  try {
    parseQueue(content, queuePath);
    return { exists: true, error: null };
  } catch (error) {
    return { exists: true, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Active approved change ids, and whether any active change is paused. */
async function scanActiveChanges(
  projectRoot: string,
  config: OsqConfig,
  now: number,
): Promise<{ approvedChangeIds: string[]; pauseActive: boolean }> {
  const approvedChangeIds: string[] = [];
  let pauseActive = false;
  for (const change of await listChanges(projectRoot, config, ['active'])) {
    const state = await deriveSpecState(projectRoot, change.folderPath).catch(() => null);
    if (state !== null && state.approvedHash !== null) approvedChangeIds.push(state.id);
    if (!pauseActive && (await readActivePause(change.folderPath, now)) !== null) {
      pauseActive = true;
    }
  }
  return { approvedChangeIds, pauseActive };
}

/** Build one change's marker, planner run and next step. */
async function readChangeView(
  projectRoot: string,
  config: OsqConfig,
  association: QueueAssociation,
  location: ChangeLocation,
): Promise<AutopilotChangeView> {
  const state = await deriveSpecState(projectRoot, association.folderPath);
  const marker = await readAutopilotMarker(association.folderPath);
  const planRun = await currentPlanRun(state);
  const nextStep = await readNextStep(projectRoot, association.folderPath, config);
  return {
    id: association.id,
    folderName: association.folderName,
    folderPath: association.folderPath,
    location,
    approved: state.approvedHash !== null,
    marker,
    planRun,
    nextStep,
  };
}

/** The selected row's active or archived association and location, or null. */
function findAssociation(
  groups: QueueAssociationGroups | undefined,
  changeId: string | null,
): { association: QueueAssociation; location: ChangeLocation } | null {
  if (groups === undefined || changeId === null) return null;
  const active = groups.active.find((entry) => entry.id === changeId);
  if (active !== undefined) return { association: active, location: 'active' };
  const archived = groups.archived.find((entry) => entry.id === changeId);
  return archived === undefined ? null : { association: archived, location: 'archived' };
}

/** Turn the first open row into its item, approval and change view. */
async function buildItemView(
  projectRoot: string,
  config: OsqConfig,
  snapshot: QueueStateSnapshot,
  row: QueueRow,
  approvalRecord: Awaited<ReturnType<typeof readQueueApproval>>,
): Promise<AutopilotItemView> {
  const item = snapshot.items.find((candidate) => candidate.slug === row.slug);
  if (item === undefined) throw new Error(`Queue item "${row.slug}" is missing from the queue`);
  const approval = itemApproval(approvalRecord, { slug: item.slug, hash: item.hash });
  const found = findAssociation(snapshot.groups.get(row.slug), row.changeId);
  const change =
    found === null
      ? null
      : await readChangeView(projectRoot, config, found.association, found.location);
  return { item, row, approval, change };
}

/**
 * Read everything autopilot's next step needs from the project's files.
 *
 * @scenario status-inspection: Autopilot steps
 * @adr 021
 */
export async function readAutopilotView(
  projectRoot: string,
  config: OsqConfig,
): Promise<AutopilotView> {
  const queue = await readQueueFile(projectRoot, config);
  const { approvedChangeIds, pauseActive } = await scanActiveChanges(
    projectRoot,
    config,
    Date.now(),
  );
  if (!queue.exists || queue.error !== null) {
    return { queue, pauseActive, approvedChangeIds, firstOpenItem: null };
  }
  const snapshot = await readQueueState(projectRoot, config);
  const approvalRecord = await readQueueApproval(projectRoot, config);
  const row = snapshot.rows.find((candidate) => candidate.state !== 'landed');
  const firstOpenItem =
    row === undefined
      ? null
      : await buildItemView(projectRoot, config, snapshot, row, approvalRecord);
  return { queue, pauseActive, approvedChangeIds, firstOpenItem };
}
