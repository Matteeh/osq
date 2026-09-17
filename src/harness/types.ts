import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/config.js';

export type HarnessEventType =
  | 'started'
  | 'tokens'
  | 'file_changed'
  | 'verify_ran'
  | 'result_written'
  | 'exited';

export interface HarnessEvent {
  type: HarnessEventType;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface SpawnTaskOptions {
  projectRoot: string;
  specFolderPath: string;
  taskNumber: string;
  taskTitle: string;
  verifyCommand: string;
  scope: string[];
  entry: string[];
  skills: string[];
  tier: 'coding' | 'smart';
  timeoutSeconds?: number;
  config?: OsqConfig;
}

export interface SpawnResult {
  exitCode: number;
  error?: string;
  timedOut?: boolean;
  signal?: NodeJS.Signals | string | null;
}

export interface HarnessAdapter {
  readonly name: string;
  setup(projectRoot: string, config: OsqConfig): Promise<void>;
  spawn(options: SpawnTaskOptions): Promise<SpawnResult>;
}

export async function appendHarnessEvent(
  specFolderPath: string,
  taskNumber: string,
  event: HarnessEvent,
): Promise<void> {
  const eventsDir = path.join(specFolderPath, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });

  const eventFilePath = path.join(eventsDir, `${taskNumber}.jsonl`);
  const line = `${JSON.stringify(event)}\n`;
  await fs.appendFile(eventFilePath, line, 'utf8');
}
