import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { asRecord } from '../harness/stream.js';

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

/** Run the verify command detached with timeout and process-group cleanup. */
export async function runVerificationGate(
  projectRoot: string,
  verifyCommand: string,
  verifyTimeoutSeconds: number,
): Promise<{ passed: boolean; timedOut: boolean; error?: string }> {
  const verifyTimeoutMs = verifyTimeoutSeconds * 1000;
  let timedOut = false;

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(verifyCommand, {
        cwd: projectRoot,
        shell: true,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let timer: NodeJS.Timeout | null = null;
      let killTimer: NodeJS.Timeout | null = null;
      const clearTimers = (): void => {
        if (timer) clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
      };

      if (verifyTimeoutMs > 0) {
        timer = setTimeout(() => {
          timedOut = true;
          const childPid = child.pid;
          if (!childPid) return;
          try {
            process.kill(-childPid, 'SIGTERM');
          } catch {
            try {
              child.kill('SIGTERM');
            } catch {}
          }
          killTimer = setTimeout(() => {
            try {
              process.kill(-childPid, 'SIGKILL');
            } catch {
              try {
                child.kill('SIGKILL');
              } catch {}
            }
          }, 5000);
        }, verifyTimeoutMs);
      }

      let stderr = '';
      let stdout = '';
      child.stderr?.on('data', (d) => {
        stderr += d.toString();
      });
      child.stdout?.on('data', (d) => {
        stdout += d.toString();
      });
      child.on('error', (err) => {
        clearTimers();
        reject(err);
      });
      child.on('close', (code) => {
        clearTimers();
        if (timedOut) {
          reject(new Error(`Verify command timed out after ${verifyTimeoutSeconds}s`));
        } else if (code !== 0) {
          reject(new Error(stderr || stdout || `Process exited with code ${code}`));
        } else {
          resolve();
        }
      });
    });
    return { passed: true, timedOut: false };
  } catch (err) {
    return {
      passed: false,
      timedOut,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
