/**
 * Derives the `task_outcomes` query rows of one archived change: the shape its
 * plan gave each task and what happened to it, from task files and streams.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import {
  type CapabilityOwnership,
  ownerCapabilities,
  readCapabilityOwnership,
} from '../spec/capability-impact.js';
import { parseFrontmatter, parseTaskMd, resolveChangeDoc } from '../spec/parser.js';
import type { ArchivedChangeRecord } from './archive-record.js';
import { asData, observeAttempts, observeTaskStream } from './report-events.js';
import { taskScopeSize } from './scope-size.js';
import { readEventStream } from './stream-reads.js';

/** The kind of verify a task declares. */
export type VerifyKind = 'one' | 'several' | 'suite' | 'other';

/** One row of the `task_outcomes` table. */
export interface TaskOutcomeRow {
  readonly change: string;
  readonly task: string;
  readonly capability: string | null;
  readonly scopeGlobs: number;
  readonly scopeFiles: number | null;
  readonly verifyKind: VerifyKind;
  readonly testsModify: number;
  readonly verifyStarts: string;
  readonly sharesScope: number;
  readonly position: number;
  readonly attempts: number;
  readonly firstAttempt: number;
  readonly deadReason: string | null;
  readonly filesTouched: number | null;
}

const TASKS_DIR = 'tasks';
const EVENTS_DIR = path.join('.run', 'events');
const TEST_NAME = /\.(?:test|spec)\./;

/** Strip one leading and one trailing quote from a command token. */
function stripQuotes(token: string): string {
  return token.replace(/^['"]|['"]$/g, '');
}

/**
 * The kind of verify a task command declares. A test file token is a
 * whitespace-separated token, quotes stripped, whose base name holds `.test.`
 * or `.spec.`; a token holding `*` counts as two. `one` is exactly one distinct
 * test file token, `several` more, `suite` none when the command equals the
 * change's own verify, and `other` otherwise.
 *
 * @scenario metrics-and-reporting: Verify kinds
 * @adr 008
 */
export function verifyKind(verify: string, changeVerify: string): VerifyKind {
  const tokens = verify
    .split(/\s+/)
    .map(stripQuotes)
    .filter((token) => token.length > 0);
  const distinct = new Set(tokens.filter((token) => TEST_NAME.test(path.basename(token))));
  let count = 0;
  for (const token of distinct) count += token.includes('*') ? 2 : 1;
  if (count === 1) return 'one';
  if (count > 1) return 'several';
  return verify === changeVerify ? 'suite' : 'other';
}

/** The frontmatter `verify` of a change's proposal, or empty text. */
async function readChangeVerify(folderPath: string): Promise<string> {
  const resolved = await resolveChangeDoc(folderPath);
  if (resolved === null) return '';
  const content = await fs.readFile(resolved.path, 'utf8').catch(() => null);
  if (content === null) return '';
  const { data } = parseFrontmatter(content);
  return typeof data.verify === 'string' ? data.verify.trim() : '';
}

/** Task file base names in numeric order. */
async function listTaskFiles(folderPath: string): Promise<string[]> {
  const entries = await fs.readdir(path.join(folderPath, TASKS_DIR)).catch(() => [] as string[]);
  return entries
    .filter((entry) => entry.endsWith('.md'))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
}

/** The first valid `measures` start event's `scopeFiles`, or null. */
function firstStartScopeFiles(events: readonly Record<string, unknown>[]): number | null {
  for (const event of events) {
    if (event.type !== 'measures') continue;
    const data = asData(event);
    if (data?.phase !== 'start') continue;
    const raw = data.scopeFiles;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;
  }
  return null;
}

/** The keys of the last `measures` end event carrying `scopeHashes`, or null. */
function lastScopeHashes(events: readonly Record<string, unknown>[]): string[] | null {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event.type !== 'measures') continue;
    const data = asData(event);
    if (data?.phase !== 'end') continue;
    const hashes = data.scopeHashes;
    if (hashes !== null && typeof hashes === 'object' && !Array.isArray(hashes)) {
      return Object.keys(hashes);
    }
  }
  return null;
}

/** The last `measures` end event's `changedFiles`, or null. */
function lastChangedFiles(events: readonly Record<string, unknown>[]): number | null {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event.type !== 'measures') continue;
    const data = asData(event);
    if (data?.phase !== 'end') continue;
    const raw = data.changedFiles;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  }
  return null;
}

/** The last dead attempt's reason for one task, or null. */
function lastDeadReason(change: ArchivedChangeRecord, task: string): string | null {
  let reason: string | null = null;
  for (const entry of change.tasks.dead ?? []) {
    if (entry.task === task) reason = entry.reason;
  }
  return reason;
}

/** The capability covering the most resolved scope files, first by name on a tie. */
function dominantCapability(
  ownerships: readonly CapabilityOwnership[],
  files: readonly string[],
): string | null {
  const counts = new Map<string, number>();
  for (const file of files) {
    for (const capability of ownerCapabilities(ownerships, file)) {
      counts.set(capability, (counts.get(capability) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [capability, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && capability < best)) {
      best = capability;
      bestCount = count;
    }
  }
  return best;
}

/** The row fields one task file and its stream contribute. */
interface TaskFacts extends Omit<TaskOutcomeRow, 'change' | 'sharesScope' | 'position'> {
  readonly scopes: readonly string[];
}

/** Reads one task file and its stream into the facts a row needs. */
async function readTaskFacts(
  folderPath: string,
  fileName: string,
  change: ArchivedChangeRecord,
  ownerships: readonly CapabilityOwnership[],
  changeVerify: string,
): Promise<TaskFacts> {
  const task = fileName.replace(/\.md$/, '');
  const content = await fs
    .readFile(path.join(folderPath, TASKS_DIR, fileName), 'utf8')
    .catch(() => '');
  const parsed = parseTaskMd(content);
  const events = (await readEventStream(path.join(folderPath, EVENTS_DIR, `${task}.jsonl`))) ?? [];
  const startScopeFiles = firstStartScopeFiles(events);
  const hashes = lastScopeHashes(events);
  return {
    task,
    scopes: parsed.scope,
    capability: hashes === null ? null : dominantCapability(ownerships, hashes),
    scopeGlobs: parsed.scope.length,
    scopeFiles: startScopeFiles === null ? null : taskScopeSize(events, startScopeFiles),
    verifyKind: verifyKind(parsed.verify, changeVerify),
    testsModify: parsed.testsModify ? 1 : 0,
    verifyStarts: parsed.verifyStarts,
    attempts: observeTaskStream(events).attempts,
    firstAttempt: observeAttempts(events).firstAttemptPass ? 1 : 0,
    deadReason: lastDeadReason(change, task),
    filesTouched: lastChangedFiles(events),
  };
}

/**
 * Derives one archived change's `task_outcomes` rows, in numeric task order.
 * Living capability ownership is read once per call.
 *
 * @scenario metrics-and-reporting: Task outcomes of one archived change
 * @adr 008
 */
export async function deriveTaskOutcomes(options: {
  readonly projectRoot: string;
  readonly config: OsqConfig;
  readonly change: ArchivedChangeRecord;
  readonly folderPath: string;
}): Promise<TaskOutcomeRow[]> {
  const { projectRoot, config, change, folderPath } = options;
  const [changeVerify, ownerships] = await Promise.all([
    readChangeVerify(folderPath),
    readCapabilityOwnership(projectRoot, config.paths.openspecRoot),
  ]);
  const rows: TaskOutcomeRow[] = [];
  const seenScopes = new Set<string>();
  const files = await listTaskFiles(folderPath);
  for (const [index, fileName] of files.entries()) {
    const { scopes, ...facts } = await readTaskFacts(
      folderPath,
      fileName,
      change,
      ownerships,
      changeVerify,
    );
    const sharesScope = scopes.some((entry) => seenScopes.has(entry)) ? 1 : 0;
    for (const entry of scopes) seenScopes.add(entry);
    rows.push({ ...facts, change: change.folder, sharesScope, position: index + 1 });
  }
  return rows;
}
