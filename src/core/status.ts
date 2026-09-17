import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from './config.js';
import { type SpecState, type TaskState, deriveSpecState } from './state.js';

export interface StatusOverview {
  specs: SpecState[];
  archivedCount: number;
  archivedChangeFolders: number;
}

export async function getStatusOverview(
  projectRoot: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<StatusOverview> {
  const specsDir = path.join(projectRoot, config.paths.specs);
  let entries: string[] = [];
  try {
    entries = await fs.readdir(specsDir);
  } catch {
    return { specs: [], archivedCount: 0, archivedChangeFolders: 0 };
  }

  const archiveDir = path.join(projectRoot, config.paths.archive);
  const archiveRel = path.relative(specsDir, archiveDir);
  const archiveFolder =
    !archiveRel.startsWith('..') && !path.isAbsolute(archiveRel)
      ? archiveRel.split(path.sep)[0]
      : 'archive';

  const candidateFolders = entries.filter(
    (e) => !e.startsWith('_') && !e.startsWith('.') && e !== archiveFolder,
  );

  const validFolders: string[] = [];
  for (const folder of candidateFolders) {
    const folderPath = path.join(specsDir, folder);
    const stat = await fs.stat(folderPath).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;

    const specMdStat = await fs.stat(path.join(folderPath, 'spec.md')).catch(() => null);
    if (!specMdStat || !specMdStat.isFile()) continue;

    validFolders.push(folder);
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

  return {
    specs,
    archivedCount,
    archivedChangeFolders: archivedCount,
  };
}

function formatTaskLine(task: TaskState): string {
  let indicator = '[ ]';
  if (task.status === 'done') {
    indicator = '[x]';
  } else if (task.status === 'running') {
    indicator = '[>]';
  } else if (task.status === 'dead') {
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
          lines.push(formatTaskLine(task));
        }
      }
    }
  }

  lines.push('');
  lines.push(`Archived specs: ${overview.archivedCount}`);

  return lines.join('\n');
}
