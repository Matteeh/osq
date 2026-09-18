import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { OsqConfig } from '../core/config.js';
import type { Logger } from '../core/logger.js';
import { spawnWithTimeout } from './process.js';
import {
  type HarnessAdapter,
  type SpawnResult,
  type SpawnTaskOptions,
  type ToolEventData,
  appendHarnessEvent,
} from './types.js';

export async function resolveAgyBinary(): Promise<string> {
  if (process.env.AGY_PATH) {
    return process.env.AGY_PATH;
  }

  const home = os.homedir();
  const candidates = [path.join(home, '.local', 'bin', 'agy'), '/usr/local/bin/agy', 'agy'];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }

  return 'agy';
}

export function buildAgyPrompt(options: SpawnTaskOptions): string {
  const { projectRoot, specFolderPath, taskNumber, taskTitle, scope, entry, verifyCommand } =
    options;

  const taskRelPath = path.relative(
    projectRoot,
    path.join(specFolderPath, 'tasks', `${taskNumber}.md`),
  );
  const specRelPath = path.relative(projectRoot, path.join(specFolderPath, 'spec.md'));
  const resultRelPath = path.relative(
    projectRoot,
    path.join(specFolderPath, '.run', 'results', `${taskNumber}.md`),
  );

  return [
    'You are a coding agent working autonomously on an osq task. Follow AGENTS.md strictly.',
    `Task File: ${taskRelPath}`,
    `Parent Spec: ${specRelPath}`,
    `Task Title: ${taskTitle}`,
    `Scope: ${scope.join(', ')}`,
    `Entry: ${entry.join(', ')}`,
    `Verify Command: ${verifyCommand}`,
    '',
    'Rules:',
    `1. Read ${taskRelPath}, ${specRelPath}, and features docs referenced in ${specRelPath}.`,
    '2. Write tests for each acceptance line before implementing.',
    '3. Keep all edits strictly inside scope.',
    `4. Verify your work by running: ${verifyCommand}`,
    `5. CRITICAL: Before exiting, you MUST write ${resultRelPath} documenting: changed, deviated, drift against features/, missing context, and next steps.`,
    `6. Do not modify tasks.md, spec.md, or any file outside your scope and ${resultRelPath}.`,
    `7. When done, write ${resultRelPath} and exit cleanly.`,
  ].join('\n');
}

export function buildAgyArgs(options: SpawnTaskOptions): string[] {
  const { config } = options;

  const taskPrompt = buildAgyPrompt(options);
  const model = config?.agy?.model || process.env.OSQ_MODEL || 'gemini-3.8-flash-high';
  const dangerouslySkipPermissions = config?.agy?.dangerouslySkipPermissions ?? true;

  const args = [
    '-p',
    taskPrompt,
    '--model',
    model,
    '--mode',
    'accept-edits',
    '--output-format',
    'stream-json',
  ];

  if (dangerouslySkipPermissions) {
    args.push('--dangerously-skip-permissions');
  }

  const rawTimeout = config?.timeouts?.taskTimeoutSeconds ?? options.timeoutSeconds ?? 1800;
  const printTimeout = Math.max(60, rawTimeout - 30);
  args.push('--print-timeout', `${printTimeout}s`);

  return args;
}

export interface AgyStreamTokensData {
  promptTokens: number;
  candidateTokens: number;
  totalTokens: number;
  cachedTokens: number;
  cost: number;
}

const AGY_TOOL_SUMMARY_MAX_LENGTH = 60;
const AGY_COMMAND_TOOLS = new Set(['run_command', 'command_status', 'send_command_input']);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function resolveAgyTimestamp(eventObj: Record<string, unknown>): string {
  const stepUpdate = asRecord(eventObj.step_update);
  const candidate = eventObj.timestamp ?? stepUpdate?.timestamp;
  if (typeof candidate === 'number' || typeof candidate === 'string') {
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  return new Date().toISOString();
}

export function extractAgyTokens(event: unknown): AgyStreamTokensData | null {
  const eventObj = asRecord(event);
  if (!eventObj) {
    return null;
  }

  const stepUpdate = asRecord(eventObj.step_update);
  const usage =
    asRecord(stepUpdate?.usage) ??
    asRecord(asRecord(eventObj.result)?.usage) ??
    asRecord(eventObj.usage);

  if (!usage) {
    return null;
  }

  const promptTokens = Number(usage.input_tokens) || 0;
  const candidateTokens = Number(usage.output_tokens) || 0;
  const cachedTokens = Number(usage.cache_read_tokens) || 0;
  const explicitTotal = Number(usage.total_tokens);
  const totalTokens =
    Number.isFinite(explicitTotal) && explicitTotal > 0
      ? explicitTotal
      : promptTokens + candidateTokens;

  return { promptTokens, candidateTokens, totalTokens, cachedTokens, cost: 0 };
}

export function extractAgyToolEvent(event: unknown): ToolEventData | null {
  const eventObj = asRecord(event);
  if (!eventObj) {
    return null;
  }

  const stepUpdate = asRecord(eventObj.step_update);
  if (!stepUpdate || stepUpdate.step_type !== 'tool') {
    return null;
  }

  const toolInfo = asRecord(stepUpdate.tool_info);
  const tool = firstNonEmptyString(stepUpdate.tool_name, toolInfo?.name, stepUpdate.name);
  if (!tool) {
    return null;
  }

  const parameters =
    asRecord(toolInfo?.parameters) ??
    asRecord(stepUpdate.parameters) ??
    asRecord(toolInfo?.input) ??
    asRecord(stepUpdate.input) ??
    asRecord(eventObj.parameters) ??
    {};

  if (AGY_COMMAND_TOOLS.has(tool.toLowerCase())) {
    const command = firstNonEmptyString(
      parameters.CommandLine,
      parameters.command,
      parameters.cmd,
      parameters.commandLine,
    );
    return { tool, summary: (command ?? '').slice(0, AGY_TOOL_SUMMARY_MAX_LENGTH) };
  }

  const target = firstNonEmptyString(
    parameters.AbsolutePath,
    parameters.path,
    parameters.file_path,
    parameters.filePath,
    parameters.file,
    parameters.absolute_path,
    parameters.target_file,
    parameters.DirectoryPath,
    parameters.directoryPath,
    parameters.pattern,
  );
  if (target) {
    return { tool, summary: target };
  }

  const raw = Object.keys(parameters).length > 0 ? JSON.stringify(parameters) : '';
  return { tool, summary: raw.slice(0, AGY_TOOL_SUMMARY_MAX_LENGTH) };
}

/**
 * Single code path for tool observation: the events.jsonl entry and its verbose
 * stderr log line are always emitted together by the shared stdout handler.
 */
async function recordAgyToolEvent(
  specFolderPath: string,
  taskNumber: string,
  toolEvent: ToolEventData,
  timestamp: string,
  logger?: Logger,
): Promise<void> {
  await appendHarnessEvent(specFolderPath, taskNumber, {
    type: 'tool',
    timestamp,
    data: { tool: toolEvent.tool, summary: toolEvent.summary },
  });
  logger?.verbose(`[tool] ${toolEvent.tool}: ${toolEvent.summary}`);
}

export async function processAgyStdoutLine(
  line: string,
  specFolderPath: string,
  taskNumber: string,
  logger?: Logger,
): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }

  let event: unknown;
  try {
    event = JSON.parse(trimmed);
  } catch {
    // Plain text or malformed stdout is discarded silently; agy may legitimately
    // emit non-JSON output when stream-json is unsupported.
    return;
  }

  const eventObj = asRecord(event);
  if (!eventObj) {
    return;
  }

  const toolEvent = extractAgyToolEvent(eventObj);
  if (toolEvent) {
    await recordAgyToolEvent(
      specFolderPath,
      taskNumber,
      toolEvent,
      resolveAgyTimestamp(eventObj),
      logger,
    );
    return;
  }

  // Only per-step usage is counted; the trailing result event repeats the final
  // totals and would otherwise double count in heartbeat accumulations.
  if (!asRecord(eventObj.step_update)) {
    return;
  }

  const tokensData = extractAgyTokens(eventObj);
  if (!tokensData) {
    return;
  }

  await appendHarnessEvent(specFolderPath, taskNumber, {
    type: 'tokens',
    timestamp: resolveAgyTimestamp(eventObj),
    data: {
      promptTokens: tokensData.promptTokens,
      candidateTokens: tokensData.candidateTokens,
      totalTokens: tokensData.totalTokens,
      cachedTokens: tokensData.cachedTokens,
      cost: tokensData.cost,
    },
  });
}

export class AgyEventStreamParser {
  private buffer = '';
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private specFolderPath: string,
    private taskNumber: string,
    private logger?: Logger,
  ) {}

  feed(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      this.pending = this.pending.then(() =>
        processAgyStdoutLine(line, this.specFolderPath, this.taskNumber, this.logger).catch(
          () => {},
        ),
      );
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.trim()) {
      const line = this.buffer;
      this.buffer = '';
      this.pending = this.pending.then(() =>
        processAgyStdoutLine(line, this.specFolderPath, this.taskNumber, this.logger).catch(
          () => {},
        ),
      );
    }
    await this.pending;
  }
}

export class AgyAdapter implements HarnessAdapter {
  readonly name = 'agy';

  async setup(projectRoot: string, _config: OsqConfig): Promise<void> {
    const agentsDir = path.join(projectRoot, '.agents');
    await fs.mkdir(agentsDir, { recursive: true });
  }

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    const {
      projectRoot,
      specFolderPath,
      taskNumber,
      taskTitle,
      scope,
      entry,
      skills,
      tier,
      timeoutSeconds = 1800,
    } = options;

    await appendHarnessEvent(specFolderPath, taskNumber, {
      type: 'started',
      timestamp: new Date().toISOString(),
      data: { tier, taskTitle, scope, entry, skills },
    });

    const agyBin = await resolveAgyBinary();
    const args = buildAgyArgs(options);
    const streamParser = new AgyEventStreamParser(specFolderPath, taskNumber, options.logger);

    const result = await spawnWithTimeout({
      command: agyBin,
      args,
      cwd: projectRoot,
      env: {
        ...process.env,
        OSQ_TASK_NUMBER: taskNumber,
        OSQ_SPEC_FOLDER: specFolderPath,
      },
      timeoutSeconds,
      onStdout: (chunk) => {
        streamParser.feed(chunk);
      },
    });

    await streamParser.flush();

    await appendHarnessEvent(specFolderPath, taskNumber, {
      type: 'exited',
      timestamp: new Date().toISOString(),
      data: {
        exitCode: result.exitCode,
        signal: result.signal ?? undefined,
        timedOut: result.timedOut,
      },
    });

    return {
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      signal: result.signal,
      error: result.error,
    };
  }
}
