import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { type VerificationResult, runVerificationCommand } from '../run/verification.js';
import { resolveSpecFolder } from '../status/show.js';
import {
  type VerificationOutcome,
  type VerificationState,
  readVerification,
} from '../status/verification.js';

/**
 * Human verification records for archived changes. Like the `rejected` event,
 * the `check_ran` and `verification_recorded` events are appended directly to
 * the change-level stream so `src/core` stays free of cross-tier imports.
 */

/** Data of one `check_ran` event recorded for an archived change. */
export interface CheckRanEventData {
  readonly command: string;
  readonly exitCode: number;
  readonly duration: number;
  readonly timedOut: boolean;
  readonly output: string;
}

/** Data of one human `verification_recorded` event. */
export interface VerificationRecordedEventData {
  readonly outcome: VerificationOutcome;
  readonly note: string | null;
}

/** The archived change a verification event was appended to. */
export interface VerificationTarget {
  readonly id: string;
  readonly folderName: string;
  readonly folderPath: string;
}

/** Result of running an archived change's recorded `check` command. */
export interface CheckRunResult extends VerificationTarget {
  readonly check: VerificationResult;
}

interface PendingTarget extends VerificationTarget {
  readonly verification: VerificationState;
}

function changeId(folderPath: string): string {
  const name = path.basename(folderPath);
  return name.match(/^(\d+)/)?.[1] ?? name;
}

/** Append one typed change-level event, mirroring `appendRejectedEvent`. */
async function appendChangeEvent(folderPath: string, type: string, data: unknown): Promise<void> {
  const eventsDir = path.join(folderPath, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  const event = { type, timestamp: new Date().toISOString(), data };
  await fs.appendFile(path.join(eventsDir, 'change.jsonl'), `${JSON.stringify(event)}\n`, 'utf8');
}

/**
 * Resolve an archived change that records a verification requirement, or
 * throw before any append. A non-archived change and an archived change with
 * no recorded requirement are both refused.
 */
async function resolvePending(
  projectRoot: string,
  id: string,
  config: OsqConfig,
): Promise<PendingTarget> {
  const { folderPath, location } = await resolveSpecFolder(projectRoot, id, config);
  const folderName = path.basename(folderPath);
  if (location !== 'archived') {
    throw new Error(
      `Change ${folderName} is not archived; verification applies only to archived changes.`,
    );
  }

  const verification = await readVerification(folderPath);
  if (!verification.required) {
    throw new Error(`Change ${folderName} does not require after-landing verification.`);
  }

  return { id: changeId(folderPath), folderName, folderPath, verification };
}

/**
 * Record one human verification outcome for an archived change that requires
 * verification. Exactly one `verification_recorded` event is appended.
 */
export async function recordVerification(
  projectRoot: string,
  id: string,
  outcome: VerificationOutcome,
  note: string | null,
  config: OsqConfig,
): Promise<VerificationTarget> {
  const target = await resolvePending(projectRoot, id, config);
  const trimmedNote = (note ?? '').trim();
  const data: VerificationRecordedEventData = {
    outcome,
    note: trimmedNote === '' ? null : trimmedNote,
  };
  await appendChangeEvent(target.folderPath, 'verification_recorded', data);
  return { id: target.id, folderName: target.folderName, folderPath: target.folderPath };
}

/**
 * Run an archived change's recorded `check` command from the project root
 * under the verify timeout and append exactly one `check_ran` event.
 */
export async function runCheck(
  projectRoot: string,
  id: string,
  config: OsqConfig,
): Promise<CheckRunResult> {
  const target = await resolvePending(projectRoot, id, config);
  const check = target.verification.check;
  if (check === null) {
    throw new Error(`Change ${target.folderName} has no recorded check command.`);
  }

  // An archived change's check runs with no OSQ_CHANGE: its deltas are already
  // in the living spec, so the command should not resolve against the change.
  const result = await runVerificationCommand(
    projectRoot,
    check,
    config.timeouts.verifyTimeoutSeconds,
    null,
  );
  const data: CheckRanEventData = {
    command: result.command,
    exitCode: result.exitCode,
    duration: result.duration,
    timedOut: result.timedOut,
    output: result.output,
  };
  await appendChangeEvent(target.folderPath, 'check_ran', data);
  return {
    id: target.id,
    folderName: target.folderName,
    folderPath: target.folderPath,
    check: result,
  };
}
