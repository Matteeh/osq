/**
 * `osq manual`: keep the checkout's uncommitted edits as one manual change,
 * with the human's comment, a commit, and a record under
 * `<openspecRoot>/manual/` naming what they touched. It refuses, writing
 * nothing, when the mode is `block`, git is off, the comment is empty, a named
 * path belongs to a change, a named path has no uncommitted edits, or nothing
 * is left to keep.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { ownerCapabilities, readCapabilityOwnership } from '../spec/capability-impact.js';
import {
  type ManualRecordFields,
  manualRecordFileName,
  manualRecordsDir,
  renderManualEditRecord,
} from './manual-records.js';
import { selectVcs } from './select.js';
import type { Vcs, VcsStatusEntry } from './vcs.js';

/** The advice the approve and land refusals carry when edits block them. */
export const MANUAL_KEEP_ADVICE = 'keep them with osq manual "<why>"';

/** Inputs to one keep run. `now` sets the record's `kept_at`. */
export interface KeepManualEditsOptions {
  readonly comment: string;
  /** Named paths; empty keeps every non-untracked entry. */
  readonly paths?: readonly string[];
  readonly now?: Date | number | string;
}

function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

/** The changes folder relative to the project root, as the refusals name it. */
function changesLabel(config: OsqConfig): string {
  return `${toPosix(config.paths.openspecRoot).replace(/\/+$/, '')}/changes`;
}

/** Whether `candidate` is the changes folder or lies under it. */
function isUnderChanges(candidate: string, config: OsqConfig): boolean {
  const label = changesLabel(config);
  const normalized = path.posix.normalize(toPosix(candidate)).replace(/\/+$/, '');
  return normalized === label || normalized.startsWith(`${label}/`);
}

function isUntracked(entry: VcsStatusEntry): boolean {
  return entry.code === '??';
}

/** Whether a named path names an entry exactly or as a folder prefix. */
function namesEntry(named: string, entry: VcsStatusEntry): boolean {
  const target = path.posix.normalize(toPosix(named)).replace(/\/+$/, '');
  return entry.path === target || entry.path.startsWith(`${target}/`);
}

/** The first named path that belongs to a change, or null. */
function refusedNamedPath(named: readonly string[], config: OsqConfig): string | null {
  for (const candidate of named) {
    if (isUnderChanges(candidate, config)) {
      return `${candidate} belongs to a change; osq manual keeps edits outside ${changesLabel(config)}`;
    }
  }
  return null;
}

/** The entries a keep would touch: the named ones, or every non-untracked one. */
function selectEntries(
  status: readonly VcsStatusEntry[],
  named: readonly string[],
): VcsStatusEntry[] {
  if (named.length === 0) return status.filter((entry) => !isUntracked(entry));
  return status.filter((entry) => named.some((candidate) => namesEntry(candidate, entry)));
}

/** The commit message: subject with the first comment line, the rest as body. */
function commitMessage(comment: string): string {
  const [first, ...rest] = comment.split('\n');
  const subject = `osq: manual ${first}`;
  return rest.length > 0 ? `${subject}\n\n${rest.join('\n')}` : subject;
}

/** The commit author from git config, or `vcs.author` when either is unset. */
async function resolveAuthor(vcs: Vcs, config: OsqConfig): Promise<string> {
  const [name, email] = await Promise.all([
    vcs.configValue('user.name'),
    vcs.configValue('user.email'),
  ]);
  if (name !== null && email !== null) return `${name} <${email}>`;
  return config.vcs?.author ?? '';
}

/** Write the record and commit it with the kept paths; remove it on failure. */
async function writeRecordAndCommit(
  projectRoot: string,
  config: OsqConfig,
  vcs: Vcs,
  fields: ManualRecordFields,
): Promise<string> {
  const recordPath = path.join(
    manualRecordsDir(projectRoot, config),
    manualRecordFileName(fields.keptAt),
  );
  await fs.mkdir(path.dirname(recordPath), { recursive: true });
  await fs.writeFile(recordPath, renderManualEditRecord(fields), 'utf8');

  const author = await resolveAuthor(vcs, config);
  try {
    return await vcs.commit(
      [...fields.paths, toPosix(path.relative(projectRoot, recordPath))],
      commitMessage(fields.comment),
      author,
    );
  } catch (error) {
    await fs.rm(recordPath, { force: true });
    throw error;
  }
}

/** The untracked status entries a keep leaves out, sorted and distinct. */
function leftOutUntracked(
  status: readonly VcsStatusEntry[],
  config: OsqConfig,
  kept: readonly VcsStatusEntry[],
): string[] {
  const names = status
    .filter((entry) => isUntracked(entry) && !isUnderChanges(entry.path, config))
    .filter((entry) => !kept.includes(entry))
    .map((entry) => entry.path);
  return [...new Set(names)].sort();
}

/**
 * Keep the checkout's uncommitted edits, returning the lines to print.
 *
 * @scenario version-control: Named untracked file
 * @scenario version-control: Change folders are never kept
 * @scenario version-control: Manual edit refusals
 * @scenario version-control: Keep tracked edits
 * @scenario version-control: Record of a kept edit
 * @scenario version-control: Edit no capability owns
 * @adr 003
 */
export async function keepManualEdits(
  projectRoot: string,
  config: OsqConfig,
  options: KeepManualEditsOptions,
): Promise<string[]> {
  if (config.vcs?.manualEdits === 'block') {
    throw new Error(
      'vcs.manualEdits is "block" in osq.config.ts; plan a change for these edits instead',
    );
  }

  const vcs = await selectVcs(projectRoot, config);
  if (config.vcs?.enabled !== true || vcs.kind !== 'git') {
    throw new Error('osq manual needs vcs.enabled and a git checkout');
  }

  const comment = options.comment.trim();
  if (comment === '') throw new Error('osq manual needs a comment: osq manual "<why>"');

  const named = options.paths ?? [];
  const underChanges = refusedNamedPath(named, config);
  if (underChanges !== null) throw new Error(underChanges);

  const status = await vcs.status();
  for (const candidate of named) {
    if (!status.some((entry) => namesEntry(candidate, entry))) {
      throw new Error(`${candidate} has no uncommitted edits`);
    }
  }

  const kept = selectEntries(status, named).filter((entry) => !isUnderChanges(entry.path, config));
  if (kept.length === 0) {
    throw new Error(
      `nothing to keep: the checkout has no uncommitted edits outside ${changesLabel(config)}`,
    );
  }

  const paths = new Set<string>();
  for (const entry of kept) {
    paths.add(entry.path);
    if (entry.from !== undefined) paths.add(entry.from);
  }
  const recordPaths = [...paths].sort();
  const keptAt = (options.now === undefined ? new Date() : new Date(options.now)).toISOString();
  const ownerships = await readCapabilityOwnership(projectRoot, config.paths.openspecRoot);
  const capabilities = [
    ...new Set(recordPaths.flatMap((entry) => ownerCapabilities(ownerships, entry))),
  ].sort();

  const commit = await writeRecordAndCommit(projectRoot, config, vcs, {
    keptAt,
    paths: recordPaths,
    capabilities,
    comment,
  });

  const lines = [`Kept ${recordPaths.join(', ')} as ${commit.slice(0, 7)}`];
  const leftOut = leftOutUntracked(status, config, kept);
  if (leftOut.length > 0) {
    lines.push(`Left out untracked: ${leftOut.join(', ')}; name them to keep them`);
  }
  return lines;
}
