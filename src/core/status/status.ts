import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import { parseFrontmatter, parseSpecMdFromFolder, resolveChangeDoc } from '../spec/parser.js';
import { getArchiveDir, getChangesDir, getRejectedDir, getRejectedMarkerPath } from './layout.js';
import { type SpecState, type TaskState, compareNumericPrefix, deriveSpecState } from './state.js';

/**
 * A change retained under `rejected/`. Rejection is a terminal location, not a
 * task state, so it is summarized separately from active {@link SpecState}
 * entries and never contributes to active or archived counts.
 */
export interface RejectedSpecSummary {
  readonly folderName: string;
  readonly title: string;
  readonly reason: string | null;
  readonly timestamp: string | null;
}

export interface StatusOverview {
  specs: SpecState[];
  rejected: RejectedSpecSummary[];
  archivedCount: number;
  archivedChangeFolders: number;
}

/** Reads rejection reason and timestamp from `.run/rejected.md`, tolerating absence. */
async function readRejectedSummary(
  folderPath: string,
  folderName: string,
): Promise<RejectedSpecSummary> {
  const spec = await parseSpecMdFromFolder(folderPath).catch(() => null);
  const title = spec?.title || folderName;

  const content = await fs.readFile(getRejectedMarkerPath(folderPath), 'utf8').catch(() => null);
  let reason: string | null = null;
  let timestamp: string | null = null;
  if (content !== null) {
    const { data } = parseFrontmatter(content);
    if (typeof data.reason === 'string' && data.reason.trim()) reason = data.reason.trim();
    if (typeof data.timestamp === 'string' && data.timestamp.trim()) {
      timestamp = data.timestamp.trim();
    }
  }
  return { folderName, title, reason, timestamp };
}

/** Discover rejected changes under the canonical rejected directory. */
async function readRejectedSummaries(
  projectRoot: string,
  config: OsqConfig,
): Promise<RejectedSpecSummary[]> {
  const rejectedDir = getRejectedDir(config.paths.openspecRoot, projectRoot);
  let entries: string[] = [];
  try {
    entries = await fs.readdir(rejectedDir);
  } catch {
    return [];
  }

  const folders: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith('.') || entry.startsWith('_')) continue;
    const fullPath = path.join(rejectedDir, entry);
    const stat = await fs.stat(fullPath).catch(() => null);
    if (stat?.isDirectory()) folders.push(entry);
  }
  folders.sort(compareNumericPrefix);

  const summaries: RejectedSpecSummary[] = [];
  for (const folder of folders) {
    summaries.push(await readRejectedSummary(path.join(rejectedDir, folder), folder));
  }
  return summaries;
}

export async function getStatusOverview(
  projectRoot: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<StatusOverview> {
  const specsDir = getChangesDir(config.paths.openspecRoot, projectRoot);
  let entries: string[] = [];
  try {
    entries = await fs.readdir(specsDir);
  } catch {
    entries = [];
  }

  const archiveDir = getArchiveDir(config.paths.openspecRoot, projectRoot);
  const archiveRel = path.relative(specsDir, archiveDir);
  const archiveFolder =
    !archiveRel.startsWith('..') && !path.isAbsolute(archiveRel)
      ? archiveRel.split(path.sep)[0]
      : 'archive';
  const rejectedDir = getRejectedDir(config.paths.openspecRoot, projectRoot);
  const rejectedRel = path.relative(specsDir, rejectedDir);
  const rejectedFolder =
    !rejectedRel.startsWith('..') && !path.isAbsolute(rejectedRel)
      ? rejectedRel.split(path.sep)[0]
      : 'rejected';

  const candidateFolders = entries.filter(
    (e) => !e.startsWith('_') && !e.startsWith('.') && e !== archiveFolder && e !== rejectedFolder,
  );

  const validFolders: string[] = [];
  const proposals = new Map<string, boolean>();
  for (const folder of candidateFolders) {
    const folderPath = path.join(specsDir, folder);
    const stat = await fs.stat(folderPath).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;

    const changeDoc = await resolveChangeDoc(folderPath);
    if (!changeDoc) continue;

    validFolders.push(folder);
    proposals.set(folder, changeDoc.kind === 'proposal');
  }

  validFolders.sort((a, b) => {
    const numA = Number.parseInt(a, 10);
    const numB = Number.parseInt(b, 10);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
      return numA - numB;
    }
    return a.localeCompare(b);
  });

  const specs: SpecState[] = [];
  for (const folder of validFolders) {
    const folderPath = path.join(specsDir, folder);
    const specState = await deriveSpecState(projectRoot, folderPath);
    specState.hasProposal = proposals.get(folder) ?? false;
    specs.push(specState);
  }

  let archivedCount = 0;
  try {
    const archiveEntries = await fs.readdir(archiveDir);
    for (const entry of archiveEntries) {
      if (entry.startsWith('.')) continue;
      const fullPath = path.join(archiveDir, entry);
      const stat = await fs.stat(fullPath).catch(() => null);
      if (stat?.isDirectory()) {
        archivedCount++;
      }
    }
  } catch {
    archivedCount = 0;
  }

  const rejected = await readRejectedSummaries(projectRoot, config);

  return {
    specs,
    rejected,
    archivedCount,
    archivedChangeFolders: archivedCount,
  };
}

export function formatStatusLine(task: TaskState): string {
  let indicator = '[ ]';
  if (task.status === 'done') {
    indicator = '[x]';
  } else if (task.status === 'running') {
    indicator = '[>]';
  } else if (task.status === 'dead' || task.status === 'regressed') {
    indicator = '[!]';
  }

  const title = task.title || task.fileName;
  const deadInfo = task.deadReason ? ` (reason: ${task.deadReason})` : '';
  return `  ${indicator} ${task.taskNumber}. ${title} [${task.status}]${deadInfo}`;
}

export function formatStatusOverview(overview: StatusOverview): string {
  const lines: string[] = [];

  lines.push('Active specs:');
  if (overview.specs.length === 0) {
    lines.push('  (none)');
  } else {
    for (const spec of overview.specs) {
      const approvalStatus = spec.approvedHash ? 'approved' : 'unapproved';
      lines.push(`${spec.folderName}: ${spec.title} [${spec.status}] (${approvalStatus})`);
      if (spec.tasks.length === 0) {
        lines.push('  (no tasks)');
      } else {
        for (const task of spec.tasks) {
          lines.push(formatStatusLine(task));
        }
      }
    }
  }

  lines.push('');
  lines.push(`Archived specs: ${overview.archivedCount}`);

  lines.push('');
  lines.push('Rejected specs:');
  if (overview.rejected.length === 0) {
    lines.push('  (none)');
  } else {
    for (const rejected of overview.rejected) {
      const reason = rejected.reason ?? 'unavailable';
      const timestamp = rejected.timestamp ?? 'unavailable';
      lines.push(
        `${rejected.folderName}: ${rejected.title} [rejected] (reason: ${reason}, at: ${timestamp})`,
      );
    }
  }

  return lines.join('\n');
}
