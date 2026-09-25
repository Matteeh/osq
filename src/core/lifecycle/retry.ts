import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import {
  type ScopePathAttribution,
  computeTaskScopeHash,
  readDoneMarker,
} from '../run/scope-hash.js';
import { runVerificationCommand } from '../run/verification.js';
import { findSpecFolder } from '../spec/approve.js';
import { hashChangeFolder } from '../spec/hasher.js';
import { parseFrontmatter, parseTaskMd } from '../spec/parser.js';
import { getChangeRunDir, getChangesDir } from '../status/layout.js';
import { refreshRecertifiedDoneMarker } from './recertify.js';
import { appendTargetEvent, retainFailureMarkers } from './retry-transition.js';

// Retry renames active failure markers into attempt-suffixed history; a numeric
// scope regression with an automated done marker is recertified by re-running
// its verify without an agent.

const CHANGE_TARGET = 'change';
const NUMERIC_TARGET = /^\d+$/;
const SCOPE_REGRESSION = 'scope_regression';

export interface RetryResult {
  readonly specId: string;
  readonly folderName: string;
  readonly folderPath: string;
  readonly target: string;
  readonly reason: string;
  /** Following execution attempt; the next started event carries this number. */
  readonly attempt: number;
  readonly retainedMarkers: string[];
  readonly recertification?: 'passed' | 'requeued';
}

export interface RetryOptions {
  /** True when the watcher, rather than a human, requested this retry. */
  readonly automatic?: boolean;
}

async function pathExists(target: string): Promise<boolean> {
  return fs.stat(target).then(
    () => true,
    () => false,
  );
}

async function listDir(dir: string): Promise<string[]> {
  return fs.readdir(dir).catch(() => []);
}

function retainedOrdinal(entries: readonly string[], target: string): number {
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}\\.(\\d+)\\.md$`);
  let highest = 0;
  for (const entry of entries) {
    const match = entry.match(pattern);
    if (!match) continue;
    const ordinal = Number.parseInt(match[1], 10);
    if (ordinal > highest) highest = ordinal;
  }
  return highest;
}

function markerReason(content: string, fallback: string): string {
  const { data } = parseFrontmatter(content);
  const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
  return reason || fallback;
}

// Validate approval, running state, and active failure before verification or
// mutation, then either recertify a scope regression or preserve the failure.
export async function retrySpec(
  projectRoot: string,
  specIdOrPrefix: string,
  target: string,
  config: OsqConfig,
  options: RetryOptions = {},
): Promise<RetryResult> {
  const rawTarget = target.trim();
  if (rawTarget !== CHANGE_TARGET && !NUMERIC_TARGET.test(rawTarget)) {
    throw new Error(`Invalid retry target "${target}": expected a numeric task or "change".`);
  }

  const specsDir = getChangesDir(config.paths.openspecRoot, projectRoot);
  const folderPath = await findSpecFolder(specsDir, specIdOrPrefix);
  const folderName = path.basename(folderPath);
  const specId = folderName.match(/^(\d+)/)?.[1] ?? folderName;
  const runDir = getChangeRunDir(folderPath);

  // Approval integrity is checked before any marker or event is touched.
  const approvedHash = await fs
    .readFile(path.join(runDir, 'approved'), 'utf8')
    .then((value) => value.trim())
    .catch(() => '');
  if (!approvedHash) {
    throw new Error(
      `Change ${specId} is not approved. Run \`osq approve ${specId}\` before retrying.`,
    );
  }
  if ((await hashChangeFolder(folderPath)) !== approvedHash) {
    throw new Error(
      `Change ${specId} no longer matches its approved hash. Run \`osq approve ${specId}\` before retrying.`,
    );
  }

  // A running target is never retried; never mutate under a live lock.
  const runningDir = path.join(runDir, 'running');
  if (rawTarget === CHANGE_TARGET) {
    const running = (await listDir(runningDir)).filter((entry) => entry.endsWith('.pid'));
    if (running.length > 0) {
      throw new Error(`Change ${specId} has a running task; retry is refused.`);
    }
  } else if (await pathExists(path.join(runningDir, `${rawTarget}.pid`))) {
    throw new Error(`Task ${rawTarget} is running; retry is refused.`);
  }

  const deadDir = path.join(runDir, 'dead');
  const regressedDir = path.join(runDir, 'regressed');
  const deadEntries = await listDir(deadDir);
  const regressedEntries = await listDir(regressedDir);
  const deadPath = path.join(deadDir, `${rawTarget}.md`);
  const regressedPath = path.join(regressedDir, `${rawTarget}.md`);
  // Only a task can be dead; the change target accepts a change-level regression.
  const hasDead = rawTarget !== CHANGE_TARGET && (await pathExists(deadPath));
  const hasRegressed = await pathExists(regressedPath);
  if (!hasDead && !hasRegressed) {
    const label = rawTarget === CHANGE_TARGET ? 'change-level regression' : `task ${rawTarget}`;
    throw new Error(`No active failure marker for ${label} in ${folderName}; retry is refused.`);
  }

  // Regression takes state precedence over dead for retry context.
  const reason = hasRegressed
    ? markerReason(await fs.readFile(regressedPath, 'utf8'), 'regressed')
    : markerReason(await fs.readFile(deadPath, 'utf8'), 'dead');
  const ordinal =
    Math.max(
      retainedOrdinal(deadEntries, rawTarget),
      retainedOrdinal(regressedEntries, rawTarget),
    ) + 1;

  // A scope regression with an automated done marker is recertified from core
  // rather than handing the trusted completion back to an agent.
  const done =
    rawTarget !== CHANGE_TARGET && hasRegressed && !hasDead && reason === SCOPE_REGRESSION
      ? await readDoneMarker(runDir, rawTarget)
      : null;
  let recertification: 'passed' | 'requeued' | undefined;
  let recertificationEvent: Record<string, unknown> | undefined;
  if (done) {
    const taskData = parseTaskMd(
      await fs.readFile(path.join(folderPath, 'tasks', `${rawTarget}.md`), 'utf8'),
    );
    const marker = parseFrontmatter(await fs.readFile(regressedPath, 'utf8'));
    const attribution = Array.isArray(marker.data.attribution)
      ? (marker.data.attribution as ScopePathAttribution[])
      : [];
    const differingPaths = marker.body
      .split('\n\n')[0]
      .split('\n')
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2).trim());
    const gate = await runVerificationCommand(
      projectRoot,
      taskData.verify,
      config.timeouts.verifyTimeoutSeconds,
      folderPath,
    );
    const current = await computeTaskScopeHash(projectRoot, taskData.scope);
    recertification = gate.exitCode === 0 && !gate.error ? 'passed' : 'requeued';
    recertificationEvent = {
      task: rawTarget,
      outcome: recertification,
      differingPaths,
      attribution,
      command: taskData.verify,
      exitCode: gate.exitCode,
      output: gate.output,
      timedOut: gate.timedOut,
      recordedHash: done.scopeHash,
      currentHash: current.hash,
      ...(recertification === 'passed' ? {} : { attempt: ordinal + 1, reason: SCOPE_REGRESSION }),
    };
    if (recertification === 'passed') {
      await refreshRecertifiedDoneMarker(runDir, rawTarget, done.scopeHash, current);
    }
  }

  const retainedMarkers = await retainFailureMarkers({
    runDir,
    folderPath,
    target: rawTarget,
    ordinal,
    hasDead,
    hasRegressed,
    // A regressed completion is retained unless a pass recertified it in place.
    retainDone: hasRegressed && rawTarget !== CHANGE_TARGET && recertification !== 'passed',
  });

  const attempt = recertification === 'passed' ? ordinal : ordinal + 1;
  const retryData: { target: string; reason: string; attempt: number; automatic?: boolean } = {
    target: rawTarget,
    reason,
    attempt,
  };
  // Only the watcher's automatic retry carries the marker; a human retry
  // leaves the event without the key, and recertification never carries it.
  if (options.automatic) retryData.automatic = true;
  await appendTargetEvent(
    folderPath,
    rawTarget,
    recertificationEvent
      ? { type: 'recertification', data: recertificationEvent }
      : { type: 'retry', data: retryData },
  );

  return {
    specId,
    folderName,
    folderPath,
    target: rawTarget,
    reason,
    attempt,
    retainedMarkers,
    ...(recertification ? { recertification } : {}),
  };
}
