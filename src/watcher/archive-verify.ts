import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/foundation/config.js';
import { missingNamedPaths } from '../core/spec/verify-paths.js';
import { recordRegressedEvent, writeRegressedMarker } from './outcome.js';
import { runVerificationGate } from './verify.js';

/** Human label for the change-level target versus a numbered task. */
function archiveTargetLabel(target: string): string {
  return target === 'change' ? 'change-level' : `task ${target}`;
}

/**
 * Regressed marker for a verify whose command names a path the final tree does
 * not contain: the reason and quoted command in frontmatter, then one line per
 * missing path.
 */
function formatArchiveMissingPathMarker(
  target: string,
  command: string,
  missingPaths: readonly string[],
): string {
  return [
    '---',
    'reason: verify_path_missing',
    `command: ${JSON.stringify(command)}`,
    '---',
    `Archive-time ${archiveTargetLabel(target)} verification not run; verify names paths that do not exist:`,
    ...missingPaths.map((missing) => `- ${missing}`),
    '',
  ].join('\n');
}

/**
 * Re-run one archive-time command through the shared gate. A command naming a
 * missing path is recorded as a regression with reason `verify_path_missing`
 * without running; otherwise a failing or timed-out command records the
 * established `verify_red` regression.
 */
export async function verifyArchiveStep(
  projectRoot: string,
  specFolderPath: string,
  runDir: string,
  config: OsqConfig,
  target: string,
  command: string,
): Promise<boolean> {
  const missing = await missingNamedPaths(projectRoot, command);
  if (missing.length > 0) {
    await writeRegressedMarker(
      runDir,
      target,
      formatArchiveMissingPathMarker(target, command, missing),
    );
    await recordRegressedEvent(specFolderPath, target, {
      command,
      reason: 'verify_path_missing',
      differingPaths: [...missing],
    });
    return false;
  }

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

  const content = [
    '---',
    'reason: verify_red',
    `command: ${JSON.stringify(command)}`,
    `exit_code: ${exitCode}`,
    '---',
    `Archive-time ${archiveTargetLabel(target)} verification failed.`,
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
