import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveScope } from '../core/run/scope.js';
import { type VerificationResult, runVerificationCommand } from '../core/run/verification.js';
import { asRecord } from '../harness/stream.js';
import { appendHarnessEvent } from '../harness/types.js';

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

const TEST_DIR_NAME = 'tests';

function hashFileContent(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Snapshot preexisting `tests/` files as path -> content hash. */
export async function snapshotTestFiles(projectRoot: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();
  const walk = async (dir: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const relative = path.relative(projectRoot, full).split(path.sep).join('/');
        snapshot.set(relative, hashFileContent(await fs.readFile(full)));
      }
    }
  };

  await walk(path.join(projectRoot, TEST_DIR_NAME));
  return snapshot;
}

/** Pre-spawn test gate: preexisting `tests/**` hashes plus resolved scope authorization. */
export async function captureTestGate(
  projectRoot: string,
  scope: readonly string[],
  testsModify: boolean,
): Promise<{ snapshot: Map<string, string>; testsModify: boolean; authorized: Set<string> }> {
  const snapshot = await snapshotTestFiles(projectRoot);
  const authorized = new Set<string>();
  for (const entry of await resolveScope(projectRoot, scope)) {
    if (entry.absolutePath !== null) authorized.add(entry.relativePath);
  }
  return { snapshot, testsModify, authorized };
}

/** Diagnostics for preexisting test files changed or deleted since `snapshot`. */
export async function findUndeclaredTestChanges(
  projectRoot: string,
  snapshot: Map<string, string>,
  options?: { readonly testsModify: boolean; readonly authorized: ReadonlySet<string> },
): Promise<string[]> {
  const changes: string[] = [];
  for (const [relative, expectedHash] of snapshot) {
    let state: 'modified' | 'deleted' | null = null;
    try {
      const hash = hashFileContent(await fs.readFile(path.join(projectRoot, relative)));
      if (hash !== expectedHash) state = 'modified';
    } catch {
      state = 'deleted';
    }
    const authorized = options?.testsModify === true && options.authorized.has(relative);
    if (state === null || authorized) continue;
    changes.push(
      options ? `${relative} (${state}); authorizing scope: ${relative}` : `${relative} (${state})`,
    );
  }
  return changes.sort();
}

/** Full verification outcome plus the pass/fail projection callers branch on. */
export interface VerificationGateResult extends VerificationResult {
  passed: boolean;
}
/** Extra `verify_ran` data derived from the completed result (e.g. pre-spawn fields). */
export type VerifyEventDataFn = (result: VerificationResult) => Record<string, unknown>;
/** Run the verify command, then append one `verify_ran` event from that one path. */
export async function runVerificationGateResult(
  projectRoot: string,
  verifyCommand: string,
  verifyTimeoutSeconds: number,
  context?: { specFolderPath: string; taskNumber: string; extraData?: VerifyEventDataFn },
): Promise<VerificationGateResult> {
  const result = await runVerificationCommand(
    projectRoot,
    verifyCommand,
    verifyTimeoutSeconds,
    context?.specFolderPath ?? null,
  );
  const error = result.timedOut
    ? `Verify command timed out after ${verifyTimeoutSeconds}s`
    : (result.error ??
      (result.exitCode !== 0
        ? result.output || `Process exited with code ${result.exitCode}`
        : undefined));
  if (context) {
    await appendHarnessEvent(context.specFolderPath, context.taskNumber, {
      type: 'verify_ran',
      timestamp: new Date().toISOString(),
      data: {
        command: verifyCommand,
        exitCode: result.exitCode,
        duration: result.duration,
        ...(result.output.trim() ? { output: result.output } : {}),
        ...(context.extraData ? context.extraData(result) : {}),
      },
    });
  }
  return {
    ...result,
    passed: result.exitCode === 0 && !result.error,
    ...(error ? { error } : {}),
  };
}

/** Compatibility projection retaining the established `runVerificationGate` shape. */
export async function runVerificationGate(
  projectRoot: string,
  verifyCommand: string,
  verifyTimeoutSeconds: number,
  context?: { specFolderPath: string; taskNumber: string },
): Promise<{ passed: boolean; timedOut: boolean; error?: string }> {
  const result = await runVerificationGateResult(
    projectRoot,
    verifyCommand,
    verifyTimeoutSeconds,
    context,
  );
  return {
    passed: result.passed,
    timedOut: result.timedOut,
    ...(result.error ? { error: result.error } : {}),
  };
}
