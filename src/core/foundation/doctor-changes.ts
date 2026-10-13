import fs from 'node:fs/promises';
import path from 'node:path';
import { isPidRunning } from '../run/lock.js';
import { parseFrontmatter } from '../spec/parser.js';
import { listChanges } from '../status/change-locations.js';
import type { OsqConfig } from './config.js';
import type { DoctorCheckResult } from './doctor.js';

/** Build one check result. */
export function make(name: string, ok: boolean, message: string): DoctorCheckResult {
  return { name, ok, message };
}

/** Whether `target` exists. */
export const exists = (target: string): Promise<boolean> =>
  fs.stat(target).then(
    () => true,
    () => false,
  );

export async function checkLocks(
  projectRoot: string,
  config: OsqConfig,
): Promise<DoctorCheckResult> {
  const orphaned: string[] = [];
  for (const change of await listChanges(projectRoot, config, ['active'])) {
    for (const lockDirName of ['running', 'locks']) {
      const lockDir = path.join(change.folderPath, '.run', lockDirName);
      for (const file of await fs.readdir(lockDir).catch(() => [])) {
        if (!file.endsWith('.pid')) continue;
        const lockPath = path.join(lockDir, file);
        let pid = 0;
        try {
          pid = Number((JSON.parse(await fs.readFile(lockPath, 'utf8')) as { pid?: number }).pid);
        } catch {}
        if (!isPidRunning(pid)) orphaned.push(path.relative(projectRoot, lockPath));
      }
    }
  }
  return orphaned.length > 0
    ? make('locks', false, `orphaned lock(s): ${orphaned.join(', ')}`)
    : make('locks', true, 'no orphaned locks');
}

export async function checkArchives(
  projectRoot: string,
  config: OsqConfig,
): Promise<DoctorCheckResult> {
  const corrupt: string[] = [];
  for (const change of await listChanges(projectRoot, config, ['archived'])) {
    const hasProposal =
      (await exists(path.join(change.folderPath, 'proposal.md'))) ||
      (await exists(path.join(change.folderPath, 'spec.md')));
    const hasTasks =
      (await exists(path.join(change.folderPath, 'tasks'))) ||
      (await exists(path.join(change.folderPath, 'tasks.md')));
    if (!hasProposal || !hasTasks) corrupt.push(path.relative(projectRoot, change.folderPath));
  }
  return corrupt.length > 0
    ? make('archives', false, `invalid archive(s): ${corrupt.join(', ')}`)
    : make('archives', true, 'all archives valid');
}

/** Active change done markers must be automated (`scope_hash`) or manual. */
export async function checkDoneMarkers(
  projectRoot: string,
  config: OsqConfig,
): Promise<DoctorCheckResult> {
  const invalid: string[] = [];
  for (const change of await listChanges(projectRoot, config, ['active'])) {
    const doneDir = path.join(change.folderPath, '.run', 'done');
    for (const marker of await fs.readdir(doneDir).catch(() => [])) {
      const markerPath = path.join(doneDir, marker);
      const { data } = parseFrontmatter(await fs.readFile(markerPath, 'utf8').catch(() => ''));
      const automated = typeof data.scope_hash === 'string';
      const manual = data.manual === true && typeof data.reason === 'string';
      if (!automated && !manual) invalid.push(path.relative(projectRoot, markerPath));
    }
  }
  if (invalid.length === 0) return make('done-markers', true, 'all done markers verified');
  return make(
    'done-markers',
    false,
    `unverified done marker placed by hand: ${invalid.join(', ')}`,
  );
}
