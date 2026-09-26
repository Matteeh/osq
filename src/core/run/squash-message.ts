import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { parseFrontmatter, parseSpecMdFromFolder, parseTaskList } from '../spec/parser.js';
import { awaitedDependencies } from '../spec/stack-dependencies.js';
import { type LocatedChange, listChanges } from '../status/change-locations.js';
import { getChangeRunDir, getDoneMarkerPath } from '../status/layout.js';
import { selectVcs } from '../vcs/select.js';
import type { Vcs } from '../vcs/vcs.js';
import { worktreeBranch } from '../vcs/worktree.js';
import { type CommitTrailer, readCommitTrailers } from './commit-message.js';

/** The squash message plus the archived folder it names. */
export interface SquashMessage {
  readonly message: string;
  readonly folder: string;
}

const NO_VCS = 'osq message needs vcs.enabled and git';

/** The folder's numeric prefix and the rest with each dash as a space. */
function subjectParts(folder: string): { id: string; words: string } {
  const dash = folder.indexOf('-');
  const id = dash === -1 ? folder : folder.slice(0, dash);
  const rest = dash === -1 ? '' : folder.slice(dash + 1);
  return { id, words: rest.replace(/-/g, ' ') };
}

/** Whether a folder name matches a query as `findChange` matches ids. */
function matchesFolder(folderName: string, query: string): boolean {
  const trimmed = query.trim();
  const num = Number.parseInt(trimmed, 10);
  const padded = !Number.isNaN(num) ? String(num).padStart(3, '0') : trimmed;
  return (
    folderName === trimmed ||
    folderName === padded ||
    folderName.startsWith(`${trimmed}-`) ||
    folderName.startsWith(`${padded}-`)
  );
}

/** A file's trimmed contents, or null when absent or blank. */
async function readTrimmed(target: string): Promise<string | null> {
  const content = await fs.readFile(target, 'utf8').catch(() => null);
  if (content === null) return null;
  const trimmed = content.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** One `[verified]`/`[manual] task <n>: <title>` line for a tasks.md entry. */
async function outcomeLine(folderPath: string, taskNumber: number, title: string): Promise<string> {
  const marker = await fs
    .readFile(getDoneMarkerPath(folderPath, String(taskNumber)), 'utf8')
    .catch(() => '');
  const manual = parseFrontmatter(marker).data.manual === true;
  return `[${manual ? 'manual' : 'verified'}] task ${taskNumber}: ${title}`;
}

/** Distinct `Osq-Model` and `Osq-Version` values, in task order. */
async function modelVersionTrailers(
  folderPath: string,
  taskNumbers: readonly number[],
): Promise<CommitTrailer[]> {
  const models: string[] = [];
  const versions: string[] = [];
  for (const taskNumber of taskNumbers) {
    for (const trailer of await readCommitTrailers(folderPath, String(taskNumber))) {
      if (trailer.key === 'Osq-Model' && !models.includes(trailer.value)) {
        models.push(trailer.value);
      } else if (trailer.key === 'Osq-Version' && !versions.includes(trailer.value)) {
        versions.push(trailer.value);
      }
    }
  }
  return [
    ...models.map((value) => ({ key: 'Osq-Model', value })),
    ...versions.map((value) => ({ key: 'Osq-Version', value })),
  ];
}

/** The head `worktreeList` reports for the worktree holding `archived`. */
async function worktreeHead(vcs: Vcs, archived: LocatedChange): Promise<string | null> {
  const entries = await vcs.worktreeList();
  const branch = worktreeBranch(archived.folderName);
  const entry =
    entries.find((candidate) => candidate.path === archived.tree.root) ??
    entries.find((candidate) => candidate.branch === branch);
  const head = entry?.head?.trim();
  return head !== undefined && head.length > 0 ? head : null;
}

/** The trailer block, minus the model and version lines. */
async function fileTrailers(vcs: Vcs, archived: LocatedChange): Promise<CommitTrailer[]> {
  const runDir = getChangeRunDir(archived.folderPath);
  const trailers: CommitTrailer[] = [{ key: 'Osq-Change', value: archived.folderName }];
  const base = await readTrimmed(path.join(runDir, 'base'));
  if (base !== null) trailers.push({ key: 'Osq-Base', value: base });
  const head = await worktreeHead(vcs, archived);
  if (head !== null) trailers.push({ key: 'Osq-Head', value: head });
  const approved = await readTrimmed(path.join(runDir, 'approved'));
  if (approved !== null) trailers.push({ key: 'Osq-Approved', value: approved });
  const approver = await readTrimmed(path.join(runDir, 'approver'));
  if (approver !== null) trailers.push({ key: 'Osq-Approved-By', value: approver });
  return trailers;
}

/** Assemble the full squash message for one archived change folder. */
async function formatSquashMessage(vcs: Vcs, archived: LocatedChange): Promise<string> {
  const folderPath = archived.folderPath;
  const { id, words } = subjectParts(archived.folderName);
  const proposal = await parseSpecMdFromFolder(folderPath);
  const tasksPath = path.join(folderPath, 'tasks.md');
  const tasks = parseTaskList(await fs.readFile(tasksPath, 'utf8').catch(() => ''));
  const taskNumbers = tasks.map((task, index) => task.number ?? index + 1);

  const outcomes: string[] = [];
  for (const [index, task] of tasks.entries()) {
    outcomes.push(await outcomeLine(folderPath, taskNumbers[index] as number, task.title));
  }

  const trailers = await fileTrailers(vcs, archived);
  trailers.push(...(await modelVersionTrailers(folderPath, taskNumbers)));

  return [
    `osq: ${id} ${words}`,
    '',
    proposal?.goal ?? '',
    '',
    ...outcomes,
    '',
    ...trailers.map((trailer) => `${trailer.key}: ${trailer.value}`),
    '',
  ].join('\n');
}

/**
 * Build the squash commit message for the archived change an osq worktree
 * holds, matching `idOrPrefix` as `findChange` does. Writes nothing; every
 * refusal is an `Error` with the message the spec names.
 */
export async function buildSquashMessage(
  projectRoot: string,
  config: OsqConfig,
  idOrPrefix: string,
): Promise<SquashMessage> {
  if (config.vcs?.enabled !== true) throw new Error(NO_VCS);
  const vcs = await selectVcs(projectRoot, config);
  if (vcs.kind !== 'git') throw new Error(NO_VCS);

  const matches = (await listChanges(projectRoot, config)).filter(
    (change) =>
      change.tree.worktreeFolder !== undefined && matchesFolder(change.folderName, idOrPrefix),
  );
  const active = matches.find((change) => change.location === 'active');
  if (active !== undefined) {
    throw new Error(
      `${active.folderName} has not archived on ${worktreeBranch(active.folderName)}`,
    );
  }
  const archived = matches.find((change) => change.location === 'archived');
  if (archived === undefined) {
    throw new Error(`No archived change "${idOrPrefix}" in an osq worktree`);
  }

  const awaited = await awaitedDependencies(projectRoot, config, vcs, archived.folderPath);
  if (awaited.length > 0) {
    const folders = awaited.map((entry) => entry.folder).join(', ');
    throw new Error(
      `${archived.folderName} is stacked on ${folders}, which has not landed; land it first`,
    );
  }

  return { message: await formatSquashMessage(vcs, archived), folder: archived.folderName };
}
