import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { findChange } from '../status/change-locations.js';
import { getChangeRunDir, getRejectedDir } from '../status/layout.js';
import { deriveSpecState, readChangeFolder } from '../status/state.js';

/**
 * Explicit rejection transition. An eligible active change is moved intact into
 * `openspec/changes/rejected/<folder>/`; the rejection reason and timestamp are
 * then recorded beside the preserved diagnostics. Eligibility is decided before
 * the single filesystem rename, so a refusal never moves or overwrites anything.
 */

export interface RejectResult {
  readonly specId: string;
  readonly folderName: string;
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly reason: string;
  readonly timestamp: string;
}

async function pathExists(target: string): Promise<boolean> {
  return fs.stat(target).then(
    () => true,
    () => false,
  );
}

/** JSON strings are valid YAML double-quoted scalars, so reasons round-trip safely. */
function yamlString(value: string): string {
  return JSON.stringify(value);
}

/**
 * Append the typed `rejected` event directly rather than through the harness
 * layer so `src/core` stays free of cross-tier imports, mirroring `done_manual`.
 */
async function appendRejectedEvent(
  folderPath: string,
  reason: string,
  timestamp: string,
): Promise<void> {
  const eventsDir = path.join(folderPath, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  const event = { type: 'rejected', timestamp, data: { reason } };
  await fs.appendFile(path.join(eventsDir, 'change.jsonl'), `${JSON.stringify(event)}\n`, 'utf8');
}

/** Write `.run/rejected.md` carrying the same reason and timestamp as the event. */
async function writeRejectedMarker(
  folderPath: string,
  reason: string,
  timestamp: string,
): Promise<void> {
  const runDir = getChangeRunDir(folderPath);
  await fs.mkdir(runDir, { recursive: true });
  const content = `---\nreason: ${yamlString(reason)}\ntimestamp: ${yamlString(timestamp)}\n---\n`;
  await fs.writeFile(path.join(runDir, 'rejected.md'), content, 'utf8');
}

/**
 * Move an eligible active change into rejected history.
 *
 * An unapproved active change is eligible. An approved change is eligible only
 * while it has an active failure (a numeric dead or regressed marker, or a
 * change-level regression) and no task is running. Healthy approved, complete,
 * running, archived, already rejected, missing, and destination-colliding
 * changes are refused before the first mutation.
 */
export async function rejectSpec(
  projectRoot: string,
  specIdOrPrefix: string,
  reason: string,
  config: OsqConfig,
): Promise<RejectResult> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new Error('a non-empty rejection reason is required');
  }

  // Resolve only beneath the active changes directory. Archived and rejected
  // folders live elsewhere and therefore never match.
  const { folderPath: sourcePath } = await findChange(projectRoot, config, specIdOrPrefix);
  const folderName = path.basename(sourcePath);
  const specId = folderName.match(/^(\d+)/)?.[1] ?? folderName;

  const rejectedDir = getRejectedDir(config.paths.openspecRoot, projectRoot);
  const destinationPath = path.join(rejectedDir, folderName);
  if (await pathExists(destinationPath)) {
    throw new Error(
      `Cannot reject ${folderName}: destination "${path.relative(projectRoot, destinationPath) || destinationPath}" already exists.`,
    );
  }

  // Read running markers and approval directly so no state-precedence result
  // can hide a live lock, and so a historical suffixed marker never reads as an
  // active failure.
  const snapshot = await readChangeFolder(projectRoot, sourcePath);
  if (snapshot.runningPids.size > 0) {
    throw new Error(`Change ${folderName} has a running task; rejection is refused.`);
  }
  if (snapshot.approvedHash) {
    const state = deriveSpecState(snapshot);
    if (state.status !== 'dead' && state.status !== 'regressed') {
      throw new Error(
        `Change ${folderName} is approved and healthy; only a failed change may be rejected.`,
      );
    }
  }

  // One ISO timestamp is shared by the marker and the event.
  const timestamp = new Date().toISOString();
  await fs.mkdir(rejectedDir, { recursive: true });
  await fs.rename(sourcePath, destinationPath);

  await writeRejectedMarker(destinationPath, trimmedReason, timestamp);
  await appendRejectedEvent(destinationPath, trimmedReason, timestamp);

  return {
    specId,
    folderName,
    sourcePath,
    destinationPath,
    reason: trimmedReason,
    timestamp,
  };
}
