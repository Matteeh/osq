/**
 * The autopilot stop record: `<openspecRoot>/.run/autopilot-stop.md`. Autopilot
 * writes one file when a step needs a human, naming the reason, the queue item,
 * the change when the item has one, the one command that resumes the queue, and
 * when it stopped. `osq queue approve` removes it.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import { parseFrontmatter } from '../spec/parser.js';

/** Every reason autopilot stops. */
export type AutopilotStopReason =
  | 'queue_unreadable'
  | 'not_approved'
  | 'changed_since_approval'
  | 'rejected'
  | 'plan_refused'
  | 'planner_not_ready'
  | 'approve_refused'
  | 'halted'
  | 'land_stopped';

const REASONS: ReadonlySet<string> = new Set<AutopilotStopReason>([
  'queue_unreadable',
  'not_approved',
  'changed_since_approval',
  'rejected',
  'plan_refused',
  'planner_not_ready',
  'approve_refused',
  'halted',
  'land_stopped',
]);

/** One `.run/autopilot-stop.md` record. */
export interface AutopilotStop {
  readonly reason: AutopilotStopReason;
  readonly item: string;
  /** The change id, absent before the item has a change. */
  readonly change?: string;
  /** The one command that resumes the queue. */
  readonly command: string;
  readonly at: string;
  /** The body, absent when empty. */
  readonly detail?: string;
}

/** `<openspecRoot>/.run/autopilot-stop.md`. */
export function autopilotStopPath(projectRoot: string, config: OsqConfig = DEFAULT_CONFIG): string {
  return path.join(projectRoot, config.paths.openspecRoot, '.run', 'autopilot-stop.md');
}

/**
 * Write the autopilot stop record, creating the `.run` folder when needed.
 *
 * @scenario status-inspection: Stop record round trip
 * @adr 021
 */
export async function writeAutopilotStop(
  projectRoot: string,
  config: OsqConfig,
  stop: AutopilotStop,
): Promise<void> {
  const frontmatter = YAML.stringify({
    reason: stop.reason,
    item: stop.item,
    ...(stop.change !== undefined ? { change: stop.change } : {}),
    command: stop.command,
    at: stop.at,
  }).trimEnd();
  const detail = stop.detail ?? '';
  const body = detail.length > 0 && !detail.endsWith('\n') ? `${detail}\n` : detail;
  const target = autopilotStopPath(projectRoot, config);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `---\n${frontmatter}\n---\n${body}`, 'utf8');
}

function parseStop(content: string): AutopilotStop | null {
  const { data, body } = parseFrontmatter(content);
  const { reason, item, change, command, at } = data;
  if (typeof reason !== 'string' || !REASONS.has(reason)) return null;
  if (typeof item !== 'string' || typeof command !== 'string' || typeof at !== 'string') {
    return null;
  }
  if (change !== undefined && typeof change !== 'string') return null;
  const detail = body.trim().length > 0 ? body.replace(/\n$/, '') : undefined;
  return {
    reason: reason as AutopilotStopReason,
    item,
    ...(change !== undefined ? { change } : {}),
    command,
    at,
    ...(detail !== undefined ? { detail } : {}),
  };
}

/**
 * Read the autopilot stop record; null for a missing or unparsable file.
 *
 * @scenario status-inspection: Stop record round trip
 * @adr 021
 */
export async function readAutopilotStop(
  projectRoot: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<AutopilotStop | null> {
  const content = await fs
    .readFile(autopilotStopPath(projectRoot, config), 'utf8')
    .catch(() => null);
  return content === null ? null : parseStop(content);
}

/**
 * Remove the autopilot stop record; a missing file succeeds.
 *
 * @scenario status-inspection: Stop record round trip
 * @scenario cli-foundation: Queue approve clears a stop
 * @adr 021
 */
export async function clearAutopilotStop(
  projectRoot: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<void> {
  await fs.rm(autopilotStopPath(projectRoot, config), { force: true });
}
