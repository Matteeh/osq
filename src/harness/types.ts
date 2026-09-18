import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/config.js';
import type { Logger } from '../core/logger.js';

export type HarnessEventType =
  | 'started'
  | 'tokens'
  | 'tool'
  | 'text'
  | 'file_changed'
  | 'verify_ran'
  | 'result_written'
  | 'exited'
  | 'done'
  | 'dead';

export interface ToolEventData {
  tool: string;
  summary: string;
}

export interface TextEventData {
  readonly text: string;
}

export interface DoneEventData {
  readonly task: string;
}

export interface DeadEventData {
  readonly task: string;
  readonly reason: string;
}

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
  logger?: Logger;
  onSpawn?: (pid: number) => Promise<void> | void;
}

export interface SpawnResult {
  exitCode: number;
  error?: string;
  timedOut?: boolean;
  signal?: NodeJS.Signals | string | null;
  pid?: number;
  elapsedMs?: number;
}

export interface HarnessAdapter {
  readonly name: string;
  setup(projectRoot: string, config: OsqConfig): Promise<void>;
  spawn(options: SpawnTaskOptions): Promise<SpawnResult>;
  preflight?(projectRoot: string, config: OsqConfig): Promise<void>;
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
