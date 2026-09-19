import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
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

/** Diagnostics for preexisting test files changed or deleted since `snapshot`. */
export async function findUndeclaredTestChanges(
  projectRoot: string,
  snapshot: Map<string, string>,
): Promise<string[]> {
  const changes: string[] = [];
  for (const [relative, expectedHash] of snapshot) {
    let currentHash: string;
    try {
      currentHash = hashFileContent(await fs.readFile(path.join(projectRoot, relative)));
    } catch {
      changes.push(`${relative} (deleted)`);
      continue;
    }
    if (currentHash !== expectedHash) {
      changes.push(`${relative} (modified)`);
    }
  }
  return changes.sort();
}

function killTree(child: ReturnType<typeof spawn>, signal: NodeJS.Signals): void {
  const pid = child.pid ?? Number.NaN;
  try {
    process.kill(-pid, signal);
  } catch {
    child.kill(signal);
  }
}

/** Run the verify command, capture its outcome, and emit `verify_ran`. */
export async function runVerificationGate(
  projectRoot: string,
  verifyCommand: string,
  verifyTimeoutSeconds: number,
  context?: { specFolderPath: string; taskNumber: string },
): Promise<{ passed: boolean; timedOut: boolean; error?: string }> {
  const startMs = Date.now();
  const verifyTimeoutMs = verifyTimeoutSeconds * 1000;
  let timedOut = false;
  let exitCode = 1;
  let output = '';

  const outcome = await new Promise<{ passed: boolean; error?: string }>((resolve) => {
    const child = spawn(verifyCommand, {
      cwd: projectRoot,
      shell: true,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let timer: NodeJS.Timeout | null = null;
    let killTimer: NodeJS.Timeout | null = null;

    if (verifyTimeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        killTree(child, 'SIGTERM');
        killTimer = setTimeout(() => killTree(child, 'SIGKILL'), 5000);
      }, verifyTimeoutMs);
    }

    child.stderr?.on('data', (d) => {
      output += d.toString();
    });
    child.stdout?.on('data', (d) => {
      output += d.toString();
    });
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({ passed: false, error: err.message });
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      exitCode = timedOut ? 1 : (code ?? 1);
      if (timedOut) {
        resolve({
          passed: false,
          error: `Verify command timed out after ${verifyTimeoutSeconds}s`,
        });
      } else if (code !== 0) {
        resolve({ passed: false, error: output || `Process exited with code ${code}` });
      } else {
        resolve({ passed: true });
      }
    });
  });
  if (context) {
    await appendHarnessEvent(context.specFolderPath, context.taskNumber, {
      type: 'verify_ran',
      timestamp: new Date().toISOString(),
      data: {
        command: verifyCommand,
        exitCode,
        duration: Number(((Date.now() - startMs) / 1000).toFixed(2)),
        ...(output.trim() ? { output } : {}),
      },
    });
  }
  return { passed: outcome.passed, timedOut, ...(outcome.error ? { error: outcome.error } : {}) };
}
