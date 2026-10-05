import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/foundation/config.js';
import type { Logger } from '../core/foundation/logger.js';
import { listCanonicalDoneNumbers } from '../core/run/scope-hash.js';
import { applyOpenSpecDeltas } from '../core/spec/apply-deltas.js';
import { readCheckCommand } from '../core/spec/human-steps.js';
import { parseFrontmatter, parseSpecMdFromFolder, parseTaskMd } from '../core/spec/parser.js';
import { getArchiveDir } from '../core/status/layout.js';
import { compareNumericPrefix, deriveSpecState } from '../core/status/state.js';
import { type HarnessAdapter, type HarnessEvent, appendHarnessEvent } from '../harness/types.js';
import { applyArchiveSidecars } from './archive-sidecars.js';
import { applyArchiveSpecs, archiveSpecsRecordPath, restoreArchiveSpecs } from './archive-specs.js';
import { verifyArchiveStep } from './archive-verify.js';
import { auditScopeRegressions } from './regression.js';
import { runValidator } from './validator.js';

/**
 * Payload of the change-level `archived` event. The event timestamp is the
 * authoritative archive time for cycle metrics. `archivePath` is relative to
 * the project root.
 */
export interface ArchivedEventData {
  readonly archivePath: string;
}

export { applyOpenSpecDeltas } from '../core/spec/apply-deltas.js';

/** Rewrite every unchecked `[ ]` checkbox to `[x]`. Pure; reads no `.run/` state. */
export function tickAllTaskCheckboxes(content: string): string {
  return content.replace(/^([ \t]*[-*][ \t]+\[)[ ](\])/gm, '$1x$2');
}

async function ensureArchivedTasksTicked(folderPath: string): Promise<void> {
  const stack: string[] = [folderPath];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      break;
    }

    const entries = await fs.readdir(current, { withFileTypes: true }).catch((): Dirent[] => []);
    for (const entry of entries) {
      if (entry.name === '.run' || entry.name === '.git' || entry.name === '.DS_Store') {
        continue;
      }

      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name === 'tasks.md') {
        const content = await fs.readFile(fullPath, 'utf8');
        const ticked = tickAllTaskCheckboxes(content);
        if (ticked !== content) {
          await fs.writeFile(fullPath, ticked, 'utf8');
        }
      }
    }
  }
}

/**
 * Delete the transient archive record, remove `plan-prompt.md`, move the
 * folder to the canonical archive, and tick every `tasks.md`. The caller has
 * already applied the change's deltas and sidecars.
 */
async function relocateArchivedSpec(
  projectRoot: string,
  specFolderPath: string,
  config: OsqConfig,
): Promise<string> {
  // The record is transient; drop it before the move so the archive never
  // holds it.
  await fs.rm(archiveSpecsRecordPath(specFolderPath), { force: true });

  // The planning prompt is transient local context, not authored content. Remove
  // it once deltas are applied and only after every verification gate has
  // already passed, idempotently, and before the archived folder is exposed.
  await fs.rm(path.join(specFolderPath, 'plan-prompt.md'), { force: true });

  const archiveDir = getArchiveDir(config.paths.openspecRoot, projectRoot);
  await fs.mkdir(archiveDir, { recursive: true });

  const folderName = path.basename(specFolderPath);
  let targetPath = path.join(archiveDir, folderName);

  let counter = 1;
  while (
    await fs
      .stat(targetPath)
      .then(() => true)
      .catch(() => false)
  ) {
    targetPath = path.join(archiveDir, `${folderName}-${counter}`);
    counter++;
  }

  await fs.rename(specFolderPath, targetPath);
  await ensureArchivedTasksTicked(targetPath);

  // The event carries the archive location relative to the project root so it
  // never records an absolute path.
  const archivePath = path.relative(projectRoot, targetPath).split(path.sep).join('/');

  // Only after the folder is relocated and its tasks are projected do we stamp
  // the authoritative archive time. The event is always change-level; it never
  // lands in a numbered task event file.
  const data: ArchivedEventData = { archivePath };
  await appendHarnessEvent(targetPath, 'change', {
    type: 'archived',
    timestamp: new Date().toISOString(),
    data,
  } as unknown as HarnessEvent);

  return targetPath;
}

/** Apply deltas, move the folder to the canonical archive, and tick every `tasks.md`. */
export async function archiveSpecFolder(
  projectRoot: string,
  specFolderPath: string,
  config: OsqConfig,
): Promise<string> {
  await applyOpenSpecDeltas(projectRoot, specFolderPath, config);
  await applyArchiveSidecars(projectRoot, specFolderPath, config);
  return relocateArchivedSpec(projectRoot, specFolderPath, config);
}

/** Optional roles a caller supplies for the validator run at archive. */
export interface CheckAndArchiveOptions {
  readonly validatorAdapter?: HarnessAdapter;
  readonly logger?: Logger;
}

/** Re-run every task verify, then the change-level verify, before archiving. */
export async function checkAndArchiveSpec(
  projectRoot: string,
  specFolderPath: string,
  config: OsqConfig,
  options?: CheckAndArchiveOptions,
): Promise<boolean> {
  // A stopped archive leaves the living specs modified and a record behind.
  // Put them back before the done check, so a fresh attempt starts clean.
  await restoreArchiveSpecs(projectRoot, specFolderPath);

  const specState = await deriveSpecState(projectRoot, specFolderPath);
  if (specState.status !== 'done') {
    return false;
  }

  const runDir = path.join(specFolderPath, '.run');

  // Archive scope recertification gate: audit every automated canonical done
  // task in one pass before any archive-time verification runs. The shared
  // pre-dispatch audit owns detection verification, markers, events, and
  // attribution; any stale task halts archival and leaves the folder active.
  const audit = await auditScopeRegressions({
    projectRoot,
    specFolderPath,
    eligibleTaskNumbers: await listCanonicalDoneNumbers(runDir),
    verifyTimeoutSeconds: config.timeouts.verifyTimeoutSeconds ?? 600,
    limits: config.limits,
  });
  if (audit.stale.length > 0) {
    return false;
  }

  const tasksDir = path.join(specFolderPath, 'tasks');
  const taskFiles = (await fs.readdir(tasksDir).catch((): string[] => []))
    .filter((entry) => entry.endsWith('.md'))
    .sort(compareNumericPrefix);

  for (const entry of taskFiles) {
    const target = entry.replace(/\.md$/, '');
    const command = parseTaskMd(await fs.readFile(path.join(tasksDir, entry), 'utf8')).verify;
    if (!command) continue;
    if (!(await verifyArchiveStep(projectRoot, specFolderPath, runDir, config, target, command))) {
      return false;
    }
  }

  const specData = await parseSpecMdFromFolder(specFolderPath);
  const changeCommand = specData?.verify ?? '';
  const checkCommand = specData ? readCheckCommand(parseFrontmatter(specData.raw).data) : null;

  // The change-level verify must see the tree the archive is about to seal, so
  // the deltas and sidecars go in first.
  await applyArchiveSpecs(projectRoot, specFolderPath, config);

  if (
    changeCommand &&
    !(await verifyArchiveStep(projectRoot, specFolderPath, runDir, config, 'change', changeCommand))
  ) {
    await restoreArchiveSpecs(projectRoot, specFolderPath);
    return false;
  }

  // The check is a second change-level gate next to the proposal's verify.
  if (
    checkCommand &&
    !(await verifyArchiveStep(projectRoot, specFolderPath, runDir, config, 'change', checkCommand))
  ) {
    await restoreArchiveSpecs(projectRoot, specFolderPath);
    return false;
  }

  await runValidator(projectRoot, specFolderPath, config, {
    adapter: options?.validatorAdapter,
    logger: options?.logger,
  });
  await relocateArchivedSpec(projectRoot, specFolderPath, config);
  return true;
}
