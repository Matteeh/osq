import { spawn } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { type OsqConfig, loadConfig } from '../core/config.js';
import type { Logger } from '../core/logger.js';
import { relativizeToolSummary } from '../core/summary.js';
import { spawnWithTimeout } from './process.js';
import {
  EventStreamParser,
  asRecord,
  firstNonEmptyString,
  resolveEventTimestamp,
} from './stream.js';
import {
  type HarnessAdapter,
  type InteractiveSessionOptions,
  type InteractiveUsage,
  NULL_INTERACTIVE_USAGE,
  type ReadInteractiveUsageOptions,
  type SpawnResult,
  type SpawnTaskOptions,
  type TextEventData,
  type ToolEventData,
  appendHarnessEvent,
  capabilityRuleLines,
  priorContextLines,
  resolveCapabilityRules,
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

  const changeDocName = fsSync.existsSync(path.join(specFolderPath, 'proposal.md'))
    ? 'proposal.md'
    : 'spec.md';
  const taskRelPath = path.relative(
    projectRoot,
    path.join(specFolderPath, 'tasks', `${taskNumber}.md`),
  );
  const specRelPath = path.relative(projectRoot, path.join(specFolderPath, changeDocName));
  const resultAbsPath = path.join(specFolderPath, '.run', 'results', `${taskNumber}.md`);
  const resultRelPath = path.relative(projectRoot, resultAbsPath);
  const priorResult = fsSync.existsSync(resultAbsPath) ? resultRelPath : undefined;

  const capabilityRules = resolveCapabilityRules(options);

  return [
    'You are a coding agent working autonomously on an osq task. Follow AGENTS.md strictly.',
    `Task File: ${taskRelPath}`,
    `Parent Spec: ${specRelPath}`,
    `Task Title: ${taskTitle}`,
    `Scope: ${scope.join(', ')}`,
    `Entry: ${entry.join(', ')}`,
    `Verify Command: ${verifyCommand}`,
    ...priorContextLines({
      attempt: options.attempt,
      reason: options.priorFailureReason,
      output: options.priorFailureOutput,
      resultPath: priorResult,
    }),
    '',
    'Rules:',
    `1. Read ${taskRelPath}, ${specRelPath}, and features docs referenced in ${specRelPath}.`,
    '2. Write tests for each acceptance line before implementing.',
    '3. Keep all edits strictly inside scope.',
    `4. Verify your work by running: ${verifyCommand}`,
    `5. CRITICAL: Before exiting, you MUST write ${resultRelPath} documenting: changed, deviated, drift against features/, missing context, and next steps.`,
    `6. Do not modify tasks.md, ${changeDocName}, or any file outside your scope and ${resultRelPath}.`,
    `7. When done, write ${resultRelPath} and exit cleanly.`,
    ...capabilityRuleLines(capabilityRules),
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
  reasoningTokens: number;
  cost: number;
}

const AGY_TOOL_SUMMARY_MAX_LENGTH = 60;
const AGY_COMMAND_TOOLS = new Set(['run_command', 'command_status', 'send_command_input']);

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
  const reasoningTokens = Number(usage.thinking_tokens ?? usage.reasoning_tokens ?? 0) || 0;
  const explicitTotal = Number(usage.total_tokens);
  const totalTokens =
    Number.isFinite(explicitTotal) && explicitTotal > 0
      ? explicitTotal
      : promptTokens + candidateTokens;

  return {
    promptTokens,
    candidateTokens,
    totalTokens,
    cachedTokens,
    reasoningTokens,
    cost: 0,
  };
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
 * stderr log line are always emitted together. The summary is relativized to the
 * project root before it is written, so `events.jsonl` never carries absolute
 * workspace paths.
 */
async function emitObservedToolEvent(
  specFolderPath: string,
  taskNumber: string,
  toolEvent: ToolEventData,
  timestamp: string,
  projectRoot?: string,
  logger?: Logger,
): Promise<void> {
  const summary = relativizeToolSummary(toolEvent.summary, projectRoot);
  await appendHarnessEvent(specFolderPath, taskNumber, {
    type: 'tool',
    timestamp,
    data: { tool: toolEvent.tool, summary },
  });
  logger?.verbose(`[tool] ${toolEvent.tool}: ${summary}`);
}

export async function processAgyStdoutLine(
  line: string,
  specFolderPath: string,
  taskNumber: string,
  logger?: Logger,
  projectRoot?: string,
): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }

  let event: unknown;
  try {
    event = JSON.parse(trimmed);
  } catch {
    // agy may legitimately emit non-JSON output when stream-json is unsupported.
    // It is diagnostic only: verbose logging, never stdout.
    logger?.verbose(`[agy] Unrecognised stream line: ${trimmed}`);
    return;
  }

  const eventObj = asRecord(event);
  if (!eventObj) {
    logger?.verbose(`[agy] Unrecognised stream line: ${trimmed}`);
    return;
  }

  const toolEvent = extractAgyToolEvent(eventObj);
  if (toolEvent) {
    await emitObservedToolEvent(
      specFolderPath,
      taskNumber,
      toolEvent,
      resolveEventTimestamp(eventObj),
      projectRoot,
      logger,
    );
    return;
  }

  // The result payload carries the completed assistant response. Partial
  // `text_delta` fragments from step updates are never persisted as text events.
  const resultObj = asRecord(eventObj.result);
  if (eventObj.event === 'result' || resultObj) {
    const response = firstNonEmptyString(resultObj?.response);
    if (response !== undefined) {
      await appendHarnessEvent(specFolderPath, taskNumber, {
        type: 'text',
        timestamp: resolveEventTimestamp(eventObj),
        data: { text: response } satisfies TextEventData,
      });
    }
    return;
  }

  // Only per-step usage is counted; the trailing result event repeats the final
  // totals and would otherwise double count in heartbeat accumulations.
  if (!asRecord(eventObj.step_update)) {
    logger?.verbose(`[agy] Unknown event type: ${eventObj.event ?? eventObj.type ?? 'unknown'}`);
    return;
  }

  const tokensData = extractAgyTokens(eventObj);
  if (!tokensData) {
    return;
  }

  await appendHarnessEvent(specFolderPath, taskNumber, {
    type: 'tokens',
    timestamp: resolveEventTimestamp(eventObj),
    data: {
      promptTokens: tokensData.promptTokens,
      candidateTokens: tokensData.candidateTokens,
      totalTokens: tokensData.totalTokens,
      cachedTokens: tokensData.cachedTokens,
      reasoningTokens: tokensData.reasoningTokens,
      cost: tokensData.cost,
    },
  });
}

/**
 * Compatibility subclass retained for existing callers and tests; the buffering
 * and serialization logic lives entirely in the shared {@link EventStreamParser}.
 */
export class AgyEventStreamParser extends EventStreamParser {
  constructor(specFolderPath: string, taskNumber: string, logger?: Logger, projectRoot?: string) {
    super((line) => processAgyStdoutLine(line, specFolderPath, taskNumber, logger, projectRoot));
  }
}

export class AgyAdapter implements HarnessAdapter {
  readonly name = 'agy';

  async setup(projectRoot: string, _config: OsqConfig): Promise<void> {
    const agentsDir = path.join(projectRoot, '.agents');
    await fs.mkdir(agentsDir, { recursive: true });
  }

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    const { projectRoot, specFolderPath, taskNumber, timeoutSeconds = 1800 } = options;

    const agyBin = await resolveAgyBinary();
    const args = buildAgyArgs(options);
    const streamParser = new EventStreamParser((line) =>
      processAgyStdoutLine(line, specFolderPath, taskNumber, options.logger, projectRoot),
    );

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
      onSpawn: options.onSpawn,
    });

    await streamParser.flush();

    return {
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      signal: result.signal,
      error: result.error,
      pid: result.pid,
      elapsedMs: result.elapsedMs,
    };
  }

  async spawnInteractive(options: InteractiveSessionOptions): Promise<number> {
    const { prompt, cwd, model, agent } = options;
    const config = await loadConfig(cwd).catch(() => undefined);
    const agyBin = await resolveAgyBinary();

    const args: string[] = ['-i', prompt];
    if (model) {
      args.push('--model', model);
    }
    if (agent) {
      args.push('--agent', agent);
    }
    const dangerouslySkipPermissions = config?.agy?.dangerouslySkipPermissions ?? true;
    if (dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions');
    }

    const child = spawn(agyBin, args, {
      cwd,
      env: process.env,
      stdio: 'inherit',
    });

    return new Promise<number>((resolve) => {
      child.on('error', () => resolve(1));
      child.on('close', (code) => resolve(code ?? 1));
    });
  }

  async readInteractiveUsage(_options: ReadInteractiveUsageOptions): Promise<InteractiveUsage> {
    // AGY has no confirmed local usage artifact in scope; timing is still exact.
    return NULL_INTERACTIVE_USAGE;
  }
}
