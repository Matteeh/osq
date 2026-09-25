import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/foundation/config.js';
import { governingAdrs, readDecisions } from '../core/foundation/decisions.js';
import type { Logger } from '../core/foundation/logger.js';
import { hashFileContent } from '../core/run/manifest.js';
import { appendHarnessEvent } from '../harness/types.js';

export interface InstructionsDriftOptions {
  readonly projectRoot: string;
  readonly specFolderPath: string;
  readonly taskNumber: string;
  readonly config: OsqConfig;
  readonly logger?: Logger;
  /** Target-wide execution attempt; the check runs only for attempt 1. */
  readonly attempt: number;
}

interface ManifestShape {
  approvedAt?: unknown;
  hashes?: unknown;
  decisions?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readManifest(specFolderPath: string): Promise<ManifestShape | null> {
  const raw = await fs
    .readFile(path.join(specFolderPath, '.run', 'manifest.json'), 'utf8')
    .catch(() => null);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? (parsed as ManifestShape) : null;
  } catch {
    return null;
  }
}

/** True when the task stream already holds an event of `type`. */
async function hasEvent(
  specFolderPath: string,
  taskNumber: string,
  type: string,
): Promise<boolean> {
  const raw = await fs
    .readFile(path.join(specFolderPath, '.run', 'events', `${taskNumber}.jsonl`), 'utf8')
    .catch(() => '');
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isRecord(parsed) && parsed.type === type) return true;
    } catch {
      // Malformed lines never hide a later valid event.
    }
  }
  return false;
}

/** Accepted governing ADR number to content hash for the change's written capabilities. */
async function currentDecisions(
  projectRoot: string,
  config: OsqConfig,
  specFolderPath: string,
): Promise<Map<string, string>> {
  const entries = await fs
    .readdir(path.join(specFolderPath, 'specs'), { withFileTypes: true })
    .catch(() => []);
  const written = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const records = await readDecisions(projectRoot, config);
  const decisions = new Map<string, string>();
  for (const adr of governingAdrs(records, written)) {
    decisions.set(adr.number, adr.hash);
  }
  return decisions;
}

/** Recorded decisions as a number-to-string map, leaving out malformed entries. */
function recordedDecisions(value: Record<string, unknown>): Map<string, string> {
  const decisions = new Map<string, string>();
  for (const [number, hash] of Object.entries(value)) {
    if (/^\d+$/.test(number) && typeof hash === 'string') decisions.set(number, hash);
  }
  return decisions;
}

/** `ADR <n> added`, `changed`, or `removed` for every difference, in number order. */
function decisionDifferences(
  recorded: Map<string, string>,
  current: Map<string, string>,
): string[] {
  const numbers = [...new Set([...recorded.keys(), ...current.keys()])].sort(
    (a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10),
  );
  const differences: string[] = [];
  for (const number of numbers) {
    const before = recorded.get(number);
    const after = current.get(number);
    if (before === undefined && after !== undefined) differences.push(`ADR ${number} added`);
    else if (before !== undefined && after === undefined) differences.push(`ADR ${number} removed`);
    else if (before !== undefined && after !== undefined && before !== after) {
      differences.push(`ADR ${number} changed`);
    }
  }
  return differences;
}

/**
 * Before a task's first attempt, compares the instruction inputs pinned at
 * approval with the current tree: AGENTS.md and, when the manifest recorded
 * them, the governing ADRs. When anything differs it appends one
 * `instructions_changed` event and prints one warning. The task still runs.
 * Later attempts, an unapproved manifest, and a stream that already recorded
 * drift do nothing.
 */
export async function checkInstructionsDrift(opts: InstructionsDriftOptions): Promise<void> {
  if (opts.attempt !== 1) return;
  if (await hasEvent(opts.specFolderPath, opts.taskNumber, 'instructions_changed')) return;

  const manifest = await readManifest(opts.specFolderPath);
  if (typeof manifest?.approvedAt !== 'string' || manifest.approvedAt === '') return;

  const changed: string[] = [];
  const recordedHashes = isRecord(manifest.hashes) ? manifest.hashes : {};
  const currentAgents = await hashFileContent(path.join(opts.projectRoot, 'AGENTS.md'));
  if (currentAgents !== (recordedHashes['AGENTS.md'] ?? null)) changed.push('AGENTS.md');

  if (isRecord(manifest.decisions)) {
    const current = await currentDecisions(opts.projectRoot, opts.config, opts.specFolderPath);
    changed.push(...decisionDifferences(recordedDecisions(manifest.decisions), current));
  }

  if (changed.length === 0) return;

  await appendHarnessEvent(opts.specFolderPath, opts.taskNumber, {
    type: 'instructions_changed',
    timestamp: new Date().toISOString(),
    data: { changed },
  });
  opts.logger?.warn(
    `task ${opts.taskNumber}: instructions changed after approval: ${changed.join(', ')}`,
  );
}
