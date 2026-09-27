import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { buildSquashMessage, outcomeLine } from '../run/squash-message.js';
import { type ApprovalDigest, buildApprovalDigest } from '../spec/digest.js';
import { parseHumanSteps, readCheckCommand } from '../spec/human-steps.js';
import { parseFrontmatter, parseSpecMdFromFolder, parseTaskList } from '../spec/parser.js';
import type { DispatchItem } from './dispatch-items.js';
import {
  getChangeRunDir,
  getDeadMarkerPath,
  getEventsPath,
  getRegressedMarkerPath,
} from './layout.js';
import { readVerification } from './verification.js';

/** The approval evidence: the digest `osq approve` shows. */
export interface ApprovalCard {
  readonly kind: 'approval';
  readonly digest: ApprovalDigest;
}

/** The halt evidence for one dead or regressed task. */
export interface HaltTaskCard {
  readonly kind: 'halt';
  readonly target: 'task';
  readonly taskNumber: string;
  readonly title: string;
  readonly reason: string | null;
  readonly attempts: number;
  readonly output: readonly string[];
  readonly patch: string | null;
}

/** The halt evidence for a change-level regression. */
export interface HaltChangeCard {
  readonly kind: 'halt';
  readonly target: 'change';
  readonly reason: string | null;
  readonly output: readonly string[];
}

/** The halt card, for a task or a whole change. */
export type HaltCard = HaltTaskCard | HaltChangeCard;

/** The land evidence: what to land and the message to land it with. */
export interface LandCard {
  readonly kind: 'land';
  readonly goal: string;
  readonly outcomes: readonly string[];
  readonly squash: string | null;
}

/** The verification evidence: what to check and how it fared. */
export interface VerifyCard {
  readonly kind: 'verify';
  readonly check: string | null;
  readonly afterLanding: string;
  readonly outcome: string | null;
}

/** The card data for one dispatch item. */
export type DispatchCard = ApprovalCard | HaltCard | LandCard | VerifyCard;

/** A file's contents, or null when it does not exist. */
async function readText(target: string): Promise<string | null> {
  return fs.readFile(target, 'utf8').catch(() => null);
}

/** The last `limit` non-blank lines of a marker body. */
function lastLines(body: string, limit: number): string[] {
  const lines = body.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  return lines.slice(Math.max(0, lines.length - limit));
}

interface Marker {
  readonly reason: string | null;
  readonly output: string[];
}

/** The reason and trailing body lines of one marker file, or empty. */
async function readMarker(target: string, limit: number): Promise<Marker> {
  const content = await readText(target);
  if (content === null) return { reason: null, output: [] };
  const { data, body } = parseFrontmatter(content);
  return {
    reason: typeof data.reason === 'string' ? data.reason : null,
    output: lastLines(body, limit),
  };
}

/** How many `started` events a task's event stream holds. */
async function countStarted(folderPath: string, task: string): Promise<number> {
  const content = await readText(getEventsPath(folderPath, task));
  if (content === null) return 0;
  let count = 0;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      const parsed = JSON.parse(trimmed) as { type?: unknown };
      if (parsed.type === 'started') count += 1;
    } catch {}
  }
  return count;
}

/** The marker a dead or regressed task left, preferring the dead marker. */
async function taskMarkerPath(folderPath: string, task: string): Promise<string> {
  const dead = getDeadMarkerPath(folderPath, task);
  if (await fs.stat(dead).catch(() => null)) return dead;
  return getRegressedMarkerPath(folderPath, task);
}

/** The card for one dead or regressed task. */
async function haltTaskCard(
  projectRoot: string,
  config: OsqConfig,
  item: DispatchItem,
): Promise<HaltTaskCard> {
  const folderPath = item.change.folderPath;
  const number = item.task?.number ?? '';
  const marker = await readMarker(
    await taskMarkerPath(folderPath, number),
    config.limits.cardOutputLines,
  );
  const patchPath = path.join(getChangeRunDir(folderPath), 'dead', `${number}.patch`);
  const patch = (await fs.stat(patchPath).catch(() => null))
    ? path.relative(projectRoot, patchPath).split(path.sep).join('/')
    : null;
  return {
    kind: 'halt',
    target: 'task',
    taskNumber: number,
    title: item.task?.title ?? '',
    reason: marker.reason,
    attempts: await countStarted(folderPath, number),
    output: marker.output,
    patch,
  };
}

/** The card for a change-level regression. */
async function haltChangeCard(config: OsqConfig, item: DispatchItem): Promise<HaltChangeCard> {
  const marker = await readMarker(
    getRegressedMarkerPath(item.change.folderPath, 'change'),
    config.limits.cardOutputLines,
  );
  return { kind: 'halt', target: 'change', reason: marker.reason, output: marker.output };
}

/** One `osq message` outcome line per task in a change's tasks.md. */
async function outcomeLines(folderPath: string): Promise<string[]> {
  const tasks = parseTaskList((await readText(path.join(folderPath, 'tasks.md'))) ?? '');
  const lines: string[] = [];
  for (const [index, task] of tasks.entries()) {
    lines.push(await outcomeLine(folderPath, task.number ?? index + 1, task.title));
  }
  return lines;
}

/** The land evidence: the goal, each outcome line, and the squash message. */
async function landCard(
  projectRoot: string,
  config: OsqConfig,
  item: DispatchItem,
): Promise<LandCard> {
  const spec = await parseSpecMdFromFolder(item.change.folderPath).catch(() => null);
  let squash: string | null = null;
  if (config.vcs?.enabled === true) {
    squash = await buildSquashMessage(projectRoot, config, item.change.id)
      .then((built) => built.message)
      .catch((err: unknown) => (err instanceof Error ? err.message : String(err)));
  }
  return {
    kind: 'land',
    goal: spec?.goal ?? '',
    outcomes: await outcomeLines(item.change.folderPath),
    squash,
  };
}

/** The verification evidence: the check, the after-landing steps, the outcome. */
async function verifyCard(item: DispatchItem): Promise<VerifyCard> {
  const folderPath = item.change.folderPath;
  const spec = await parseSpecMdFromFolder(folderPath).catch(() => null);
  const { data, body } = parseFrontmatter(spec?.raw ?? '');
  const verification = await readVerification(folderPath);
  return {
    kind: 'verify',
    check: readCheckCommand(data) ?? verification.check,
    afterLanding: parseHumanSteps(body).afterLanding,
    outcome: verification.outcome,
  };
}

/**
 * Gather the evidence one dispatch item's kind needs, reading only files osq
 * already writes. Paths in the card stay relative to the project root.
 */
export async function readDispatchCard(
  projectRoot: string,
  config: OsqConfig,
  item: DispatchItem,
): Promise<DispatchCard> {
  switch (item.kind) {
    case 'approval':
      return {
        kind: 'approval',
        digest: await buildApprovalDigest(projectRoot, item.change.folderPath, config),
      };
    case 'halt':
      return item.task === null
        ? haltChangeCard(config, item)
        : haltTaskCard(projectRoot, config, item);
    case 'land':
      return landCard(projectRoot, config, item);
    case 'verify':
      return verifyCard(item);
  }
}
