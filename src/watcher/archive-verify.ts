import type { OsqConfig } from '../core/foundation/config.js';
import { excerptVerifyOutput } from '../core/run/verify-excerpt.js';
import { missingNamedPaths } from '../core/spec/verify-paths.js';
import { recordRegressedEvent, writeRegressedMarker } from './outcome.js';
import { runVerificationGateResult } from './verify.js';

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
      missingPaths: [...missing],
    });
    return false;
  }

  const gate = await runVerificationGateResult(
    projectRoot,
    command,
    config.timeouts.verifyTimeoutSeconds ?? 600,
    { specFolderPath, taskNumber: target },
    config,
  );
  if (gate.passed) return true;

  const content = [
    '---',
    'reason: verify_red',
    `command: ${JSON.stringify(command)}`,
    `exit_code: ${gate.exitCode}`,
    '---',
    `Archive-time ${archiveTargetLabel(target)} verification failed.`,
    excerptVerifyOutput(
      gate.output,
      gate.log ?? `the verify_ran event in .run/events/${target}.jsonl`,
      config.limits,
    ),
    '',
  ].join('\n');
  await writeRegressedMarker(runDir, target, content);
  await recordRegressedEvent(specFolderPath, target, {
    exitCode: gate.exitCode,
    duration: gate.duration,
    command,
    reason: 'verify_red',
  });
  return false;
}
