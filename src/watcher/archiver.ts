import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/foundation/config.js';
import { listCanonicalDoneNumbers } from '../core/run/scope-hash.js';
import { mergeDelta, parseDelta } from '../core/spec/delta.js';
import { parseSpecMdFromFolder, parseTaskMd } from '../core/spec/parser.js';
import { getArchiveDir } from '../core/status/layout.js';
import { compareNumericPrefix, deriveSpecState } from '../core/status/state.js';
import { type HarnessEvent, appendHarnessEvent } from '../harness/types.js';
import { recordRegressedEvent, writeRegressedMarker } from './outcome.js';
import { auditScopeRegressions } from './regression.js';
import { runVerificationGate } from './verify.js';

/**
 * Payload of the change-level `archived` event. The event timestamp is the
 * authoritative archive time for cycle metrics.
 */
export interface ArchivedEventData {
  readonly archivePath: string;
}

function resolveOpenSpecRoot(config: OsqConfig): string {
  const paths = config.paths as OsqConfig['paths'] & { readonly openspecRoot?: string };
  return paths.openspecRoot ?? 'openspec';
}

/** Merge every delta spec into `openspec/specs/`. */
export async function applyOpenSpecDeltas(
  projectRoot: string,
  specFolderPath: string,
  config: OsqConfig,
): Promise<void> {
  const deltasDir = path.join(specFolderPath, 'specs');
  const entries = await fs.readdir(deltasDir, { withFileTypes: true }).catch((): Dirent[] => []);
  const capabilities = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (capabilities.length === 0) {
    return;
  }

  const specsRoot = path.join(projectRoot, resolveOpenSpecRoot(config), 'specs');

  for (const capability of capabilities) {
    const deltaPath = path.join(deltasDir, capability, 'spec.md');
    const deltaContent = await fs.readFile(deltaPath, 'utf8').catch(() => null);
    if (deltaContent === null) {
      continue;
    }

    const delta = parseDelta(deltaContent);
    const targetDir = path.join(specsRoot, capability);
    const targetPath = path.join(targetDir, 'spec.md');
    const baseContent = await fs.readFile(targetPath, 'utf8').catch(() => null);
    const merged = mergeDelta(baseContent, capability, delta);

    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(targetPath, merged, 'utf8');
  }
}

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

/** Apply deltas, move the folder to the canonical archive, and tick every `tasks.md`. */
export async function archiveSpecFolder(
  projectRoot: string,
  specFolderPath: string,
  config: OsqConfig,
): Promise<string> {
  await applyOpenSpecDeltas(projectRoot, specFolderPath, config);

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

  // Only after the folder is relocated and its tasks are projected do we stamp
  // the authoritative archive time. The event is always change-level; it never
  // lands in a numbered task event file.
  await appendHarnessEvent(targetPath, 'change', {
    type: 'archived',
    timestamp: new Date().toISOString(),
    data: { archivePath: targetPath } satisfies ArchivedEventData,
  } as unknown as HarnessEvent);

  return targetPath;
}

/** Re-run one command through the shared gate; record a regressed marker/event on failure. */
async function verifyArchiveStep(
  projectRoot: string,
  specFolderPath: string,
  runDir: string,
  config: OsqConfig,
  target: string,
  command: string,
): Promise<boolean> {
  const gate = await runVerificationGate(
    projectRoot,
    command,
    config.timeouts.verifyTimeoutSeconds ?? 600,
    { specFolderPath, taskNumber: target },
  );
  if (gate.passed) return true;

  // The shared gate is the sole `verify_ran` writer; recover its payload.
  const raw = await fs
    .readFile(path.join(specFolderPath, '.run', 'events', `${target}.jsonl`), 'utf8')
    .catch(() => '');
  let exitCode = 1;
  let duration = 0;
  let output = '';
  for (const line of raw.split('\n')) {
    if (!line.includes('"verify_ran"')) continue;
    const data = (JSON.parse(line) as { data?: Record<string, unknown> }).data ?? {};
    exitCode = typeof data.exitCode === 'number' ? data.exitCode : 1;
    duration = typeof data.duration === 'number' ? data.duration : 0;
    output = typeof data.output === 'string' ? data.output : '';
  }

  const label = target === 'change' ? 'change-level' : `task ${target}`;
  const content = [
    '---',
    'reason: verify_red',
    `command: ${JSON.stringify(command)}`,
    `exit_code: ${exitCode}`,
    '---',
    `Archive-time ${label} verification failed.`,
    output.trim() || '(no output)',
    '',
  ].join('\n');
  await writeRegressedMarker(runDir, target, content);
  await recordRegressedEvent(specFolderPath, target, {
    exitCode,
    duration,
    command,
    reason: 'verify_red',
  });
  return false;
}

/** Re-run every task verify, then the change-level verify, before archiving. */
export async function checkAndArchiveSpec(
  projectRoot: string,
  specFolderPath: string,
  config: OsqConfig,
): Promise<boolean> {
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
  if (
    changeCommand &&
    !(await verifyArchiveStep(projectRoot, specFolderPath, runDir, config, 'change', changeCommand))
  ) {
    return false;
  }

  await archiveSpecFolder(projectRoot, specFolderPath, config);
  return true;
}
