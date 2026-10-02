import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import type { OsqConfig } from '../core/foundation/config.js';
import { type Logger, resolveSymbol } from '../core/foundation/logger.js';
import { retrySpec } from '../core/lifecycle/retry.js';
import { readManifestApprovedAt } from '../core/run/manifest-approval.js';
import { parseFrontmatter } from '../core/spec/parser.js';
import { appendHarnessEvent } from '../harness/types.js';
import { markerFingerprint } from './fingerprint.js';
import {
  PROVIDER_DEFAULTS,
  PROVIDER_REASON,
  automaticRetriesSince,
  decideProviderRetry,
  lastManualRetryAt,
  laterOf,
  readStream,
} from './provider-retry.js';

// Automatic retry spends one agent attempt on a dead task when a fresh run
// could plausibly fix it. The decision is re-derived from disk every cycle; the
// retry transition itself (renaming the active marker) is the commit point.

export const ELIGIBLE_AUTO_RETRY_REASONS = [
  'verify_red',
  'change_verify_red',
  'undeclared_test_change',
  'verify_path_missing',
  'denied_dependency',
  'vcs_violation',
  'scope_violation',
  'no_result',
  'crashed',
  'timeout',
  'provider_unavailable',
] as const;

export type EligibleAutoRetryReason = (typeof ELIGIBLE_AUTO_RETRY_REASONS)[number];

const ELIGIBLE: ReadonlySet<string> = new Set(ELIGIBLE_AUTO_RETRY_REASONS);
const ACTIVE_DEAD = /^\d+\.md$/;
const RETAINED_DEAD = /^(\d+)\.(\d+)\.md$/;

/** Stored fingerprint, falling back to a content-derived one for legacy markers. */
function fingerprintOf(content: string, projectRoot: string): string {
  const stored = parseFrontmatter(content).data.fingerprint;
  return typeof stored === 'string' && stored ? stored : markerFingerprint(content, projectRoot);
}

async function highestRetained(
  deadDir: string,
  taskNumber: string,
  projectRoot: string,
): Promise<string | undefined> {
  const entries = await fs.readdir(deadDir).catch(() => [] as string[]);
  let bestOrdinal = -1;
  let best: string | undefined;
  for (const entry of entries) {
    const match = entry.match(RETAINED_DEAD);
    if (!match || match[1] !== taskNumber) continue;
    const ordinal = Number.parseInt(match[2], 10);
    if (ordinal > bestOrdinal) {
      bestOrdinal = ordinal;
      best = entry;
    }
  }
  if (best === undefined) return undefined;
  const content = await fs.readFile(path.join(deadDir, best), 'utf8').catch(() => '');
  return fingerprintOf(content, projectRoot);
}

function shortFingerprint(fingerprint: string): string {
  const hex = fingerprint.startsWith('sha256:') ? fingerprint.slice(7) : fingerprint;
  return hex.slice(0, 12);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Mark the active marker stuck once, preserving the body after its frontmatter. */
async function markStuck(
  folderPath: string,
  specId: string,
  taskNumber: string,
  deadPath: string,
  fingerprint: string,
  logger?: Logger,
): Promise<void> {
  const content = await fs.readFile(deadPath, 'utf8');
  const { data, body } = parseFrontmatter(content);
  if (data.stuck === true) return;
  await fs.writeFile(
    deadPath,
    `---\n${YAML.stringify({ ...data, stuck: true })}---\n${body}`,
    'utf8',
  );
  await appendHarnessEvent(folderPath, taskNumber, {
    type: 'stuck',
    timestamp: new Date().toISOString(),
    data: { task: taskNumber, fingerprint },
  });
  logger?.info(
    `${resolveSymbol('■', '[stuck]', logger?.symbols === true)} task ${taskNumber} of ${specId} stuck: same failure twice (${shortFingerprint(fingerprint)})`,
  );
}

type Decision = 'retried' | 'stuck' | 'none';

async function decideDeadTask(
  projectRoot: string,
  folderPath: string,
  specId: string,
  taskNumber: string,
  deadPath: string,
  config: OsqConfig,
  limit: number,
  now: number,
  logger?: Logger,
): Promise<Decision> {
  const content = await fs.readFile(deadPath, 'utf8').catch(() => '');
  const reason = parseFrontmatter(content).data.reason;
  if (typeof reason !== 'string' || !ELIGIBLE.has(reason)) return 'none';
  const runDir = path.join(folderPath, '.run');
  const events = await readStream(folderPath, taskNumber);
  const fingerprint = fingerprintOf(content, projectRoot);
  const provider = reason === PROVIDER_REASON;
  // A provider outage is never the attempt's fault; it is never stuck.
  if (!provider) {
    const previous = await highestRetained(path.join(runDir, 'dead'), taskNumber, projectRoot);
    if (previous !== undefined && previous === fingerprint) {
      await markStuck(folderPath, specId, taskNumber, deadPath, fingerprint, logger);
      return 'stuck';
    }
  }
  const cutoff = laterOf(
    (await readManifestApprovedAt(folderPath)) ?? undefined,
    lastManualRetryAt(events),
  );
  if (provider) {
    const retry = decideProviderRetry({
      events,
      providerRetries: config.gates?.providerRetries ?? PROVIDER_DEFAULTS.retries,
      delaySeconds: config.gates?.providerRetryDelaySeconds ?? PROVIDER_DEFAULTS.delaySeconds,
      ...(cutoff !== undefined ? { cutoff } : {}),
      now,
    });
    if (!retry) return 'none';
  } else if (automaticRetriesSince(events, cutoff) >= limit) {
    return 'none';
  }
  try {
    const result = await retrySpec(projectRoot, specId, taskNumber, config, { automatic: true });
    logger?.info(
      `${resolveSymbol('↻', '[retry]', logger?.symbols === true)} task ${taskNumber} of ${specId} retried automatically after ${result.reason} (attempt ${result.attempt})`,
    );
    return 'retried';
  } catch (err) {
    logger?.warn(`task ${taskNumber} of ${specId} automatic retry failed: ${errorMessage(err)}`);
    return 'none';
  }
}

/**
 * Decide, per active dead task in an approved change, whether to retry it. Runs
 * from disk every cycle so a watcher restart between a death and its retry
 * neither loses nor repeats the action. Returns the number of retries made.
 */
export async function runAutomaticRetries(
  projectRoot: string,
  folderPath: string,
  config: OsqConfig,
  logger?: Logger,
  now: number = Date.now(),
): Promise<number> {
  const limit = config.gates?.autoRetries ?? 1;
  if (limit <= 0) return 0;
  const folderName = path.basename(folderPath);
  const specId = folderName.match(/^(\d+)/)?.[1] ?? folderName;
  const deadDir = path.join(folderPath, '.run', 'dead');
  const entries = (await fs.readdir(deadDir).catch(() => [] as string[]))
    .filter((entry) => ACTIVE_DEAD.test(entry))
    .sort();
  let retried = 0;
  for (const entry of entries) {
    const decision = await decideDeadTask(
      projectRoot,
      folderPath,
      specId,
      entry.replace(/\.md$/, ''),
      path.join(deadDir, entry),
      config,
      limit,
      now,
      logger,
    );
    if (decision === 'retried') retried += 1;
  }
  return retried;
}
