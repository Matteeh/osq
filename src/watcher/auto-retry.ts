import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import type { OsqConfig } from '../core/foundation/config.js';
import { type Logger, resolveSymbol } from '../core/foundation/logger.js';
import { retrySpec } from '../core/lifecycle/retry.js';
import { parseFrontmatter } from '../core/spec/parser.js';
import { appendHarnessEvent } from '../harness/types.js';
import { markerFingerprint } from './fingerprint.js';

// Automatic retry spends one agent attempt on a dead task when a fresh run
// could plausibly fix it. The decision is re-derived from disk every cycle; the
// retry transition itself (renaming the active marker) is the commit point.

export const ELIGIBLE_AUTO_RETRY_REASONS = [
  'verify_red',
  'change_verify_red',
  'undeclared_test_change',
  'no_result',
  'crashed',
  'timeout',
] as const;

export type EligibleAutoRetryReason = (typeof ELIGIBLE_AUTO_RETRY_REASONS)[number];

const ELIGIBLE: ReadonlySet<string> = new Set(ELIGIBLE_AUTO_RETRY_REASONS);
const ACTIVE_DEAD = /^\d+\.md$/;
const RETAINED_DEAD = /^(\d+)\.(\d+)\.md$/;

interface StreamEvent {
  readonly type?: unknown;
  readonly timestamp?: unknown;
  readonly data?: unknown;
}

async function readStream(folderPath: string, taskNumber: string): Promise<StreamEvent[]> {
  const raw = await fs
    .readFile(path.join(folderPath, '.run', 'events', `${taskNumber}.jsonl`), 'utf8')
    .catch(() => '');
  const events: StreamEvent[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as StreamEvent);
    } catch {
      // A malformed line never blocks the decision.
    }
  }
  return events;
}

function dataOf(event: StreamEvent): Record<string, unknown> {
  return event.data !== null && typeof event.data === 'object'
    ? (event.data as Record<string, unknown>)
    : {};
}

function laterOf(a: string | undefined, b: string | undefined): string | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a > b ? a : b;
}

function lastManualRetryAt(events: readonly StreamEvent[]): string | undefined {
  let latest: string | undefined;
  for (const event of events) {
    if (event.type !== 'retry' || dataOf(event).automatic === true) continue;
    if (typeof event.timestamp !== 'string') continue;
    latest = laterOf(latest, event.timestamp);
  }
  return latest;
}

function automaticRetriesSince(events: readonly StreamEvent[], cutoff?: string): number {
  let count = 0;
  for (const event of events) {
    if (event.type !== 'retry' || dataOf(event).automatic !== true) continue;
    if (cutoff !== undefined && typeof event.timestamp === 'string' && event.timestamp < cutoff) {
      continue;
    }
    count += 1;
  }
  return count;
}

async function readApprovedAt(runDir: string): Promise<string | undefined> {
  const raw = await fs.readFile(path.join(runDir, 'manifest.json'), 'utf8').catch(() => '');
  try {
    const parsed = JSON.parse(raw) as { approvedAt?: unknown };
    return typeof parsed.approvedAt === 'string' ? parsed.approvedAt : undefined;
  } catch {
    return undefined;
  }
}

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
  logger?: Logger,
): Promise<Decision> {
  const content = await fs.readFile(deadPath, 'utf8').catch(() => '');
  const reason = parseFrontmatter(content).data.reason;
  if (typeof reason !== 'string' || !ELIGIBLE.has(reason)) return 'none';
  const runDir = path.join(folderPath, '.run');
  const events = await readStream(folderPath, taskNumber);
  const fingerprint = fingerprintOf(content, projectRoot);
  const previous = await highestRetained(path.join(runDir, 'dead'), taskNumber, projectRoot);
  if (previous !== undefined && previous === fingerprint) {
    await markStuck(folderPath, specId, taskNumber, deadPath, fingerprint, logger);
    return 'stuck';
  }
  const cutoff = laterOf(await readApprovedAt(runDir), lastManualRetryAt(events));
  if (automaticRetriesSince(events, cutoff) >= limit) return 'none';
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
      logger,
    );
    if (decision === 'retried') retried += 1;
  }
  return retried;
}
