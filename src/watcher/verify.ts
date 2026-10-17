import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/foundation/config.js';
import { type VerificationResult, runVerificationCommand } from '../core/run/verification.js';
import { asRecord } from '../harness/stream.js';
import { recordVerifyRan } from './record-verify.js';

export {
  captureTestGate,
  findUndeclaredTestChanges,
  snapshotTestFiles,
} from '../core/run/test-snapshot.js';

/** Last first-class `text` event on the agent stream, or null when absent. */
export async function extractFinalTextFromStream(
  specFolderPath: string,
  taskNumber: string,
): Promise<string | null> {
  const eventFilePath = path.join(specFolderPath, '.run', 'events', `${taskNumber}.jsonl`);
  let content = '';
  try {
    content = await fs.readFile(eventFilePath, 'utf8');
  } catch {
    return null;
  }

  let finalText: string | null = null;
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const event = asRecord(parsed);
    if (event?.type !== 'text') continue;
    const text = asRecord(event.data)?.text;
    if (typeof text === 'string' && text.trim().length > 0) {
      finalText = text;
    }
  }

  return finalText?.trim() ? finalText : null;
}
/** Write a result file synthesized from the agent's final stream message. */
export async function synthesizeResultFile(
  resultsDir: string,
  taskNumber: string,
  finalText: string,
): Promise<string> {
  await fs.mkdir(resultsDir, { recursive: true });
  const resultPath = path.join(resultsDir, `${taskNumber}.md`);
  const body = finalText.endsWith('\n') ? finalText : `${finalText}\n`;
  const content = [
    '---',
    'synthesized: true',
    '---',
    "<!-- Synthesized by the osq watcher from the agent's final stream message.",
    '     The agent exited without writing a result file. -->',
    '',
    body,
  ].join('\n');

  await fs.writeFile(resultPath, content, 'utf8');
  return resultPath;
}
/** Full verification outcome plus the pass/fail projection callers branch on. */
export interface VerificationGateResult extends VerificationResult {
  passed: boolean;
  /** Change-folder-relative log of the whole output, or null without a context. */
  log: string | null;
}
/** Extra `verify_ran` data derived from the completed result (e.g. pre-spawn fields). */
export type VerifyEventDataFn = (result: VerificationResult) => Record<string, unknown>;
/** Run the verify command, then record one `verify_ran` event with its log and tail. */
export async function runVerificationGateResult(
  projectRoot: string,
  verifyCommand: string,
  verifyTimeoutSeconds: number,
  context?: { specFolderPath: string; taskNumber: string; extraData?: VerifyEventDataFn },
  config?: OsqConfig,
): Promise<VerificationGateResult> {
  const result = await runVerificationCommand(
    projectRoot,
    verifyCommand,
    verifyTimeoutSeconds,
    context?.specFolderPath ?? null,
    { config },
  );
  const error = result.timedOut
    ? `Verify command timed out after ${verifyTimeoutSeconds}s`
    : (result.error ??
      (result.exitCode !== 0
        ? result.output || `Process exited with code ${result.exitCode}`
        : undefined));
  let log: string | null = null;
  if (context) {
    log = await recordVerifyRan(
      context.specFolderPath,
      context.taskNumber,
      verifyCommand,
      result,
      config,
      context.extraData,
    );
  }
  return {
    ...result,
    passed: result.exitCode === 0 && !result.error,
    log,
    ...(error ? { error } : {}),
  };
}

/** Compatibility projection retaining the established `runVerificationGate` shape. */
export async function runVerificationGate(
  projectRoot: string,
  verifyCommand: string,
  verifyTimeoutSeconds: number,
  context?: { specFolderPath: string; taskNumber: string },
  config?: OsqConfig,
): Promise<{ passed: boolean; timedOut: boolean; log?: string | null; error?: string }> {
  const { passed, timedOut, error, log } = await runVerificationGateResult(
    projectRoot,
    verifyCommand,
    verifyTimeoutSeconds,
    context,
    config,
  );
  return { passed, timedOut, ...(log ? { log } : {}), ...(error ? { error } : {}) };
}
