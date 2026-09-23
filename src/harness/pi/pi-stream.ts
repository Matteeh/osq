import type { Logger } from '../../core/foundation/logger.js';
import { relativizeToolSummary } from '../../core/run/summary.js';
import {
  EventStreamParser,
  asRecord,
  firstNonEmptyString,
  resolveEventTimestamp,
} from '../stream.js';
import {
  type FileChangedEventData,
  type HarnessRetryEventData,
  type TextEventData,
  type TokensEventData,
  appendHarnessEvent,
} from '../types.js';
import { piToolSummary, toProjectRelative } from './pi-tools.js';

export interface PiStreamContext {
  specFolderPath: string;
  taskNumber: string;
  projectRoot: string;
  logger?: Logger;
}

interface ToolCallMemory {
  readonly toolName: string;
  readonly path?: string;
}

/** Mutable stream state shared across Pi's JSONL records. */
export interface PiStreamState {
  readonly toolCalls: Map<string, ToolCallMemory>;
  settled: boolean;
  onSettled?: () => void;
}

export function createPiStreamState(): PiStreamState {
  return { toolCalls: new Map(), settled: false };
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** One `tokens` payload from an assistant message's usage, or undefined. */
function tokensFromMessage(message: Record<string, unknown>): TokensEventData | undefined {
  const usage = asRecord(message.usage);
  if (!usage) return undefined;
  const promptTokens = numberField(usage.input) ?? 0;
  const candidateTokens = numberField(usage.output) ?? 0;
  const data: TokensEventData = {
    promptTokens,
    candidateTokens,
    totalTokens: numberField(usage.totalTokens) ?? promptTokens + candidateTokens,
  };
  const cached = numberField(usage.cacheRead);
  if (cached !== undefined) data.cachedTokens = cached;
  const reasoning = numberField(usage.reasoning);
  if (reasoning !== undefined) data.reasoningTokens = reasoning;
  const cost = numberField(asRecord(usage.cost)?.total);
  if (cost !== undefined) data.cost = cost;
  const provider = firstNonEmptyString(message.provider);
  if (provider) data.provider = provider;
  const model = firstNonEmptyString(message.model);
  if (model) data.model = model;
  return data;
}

/** Non-empty assistant text parts joined into one result body, or undefined. */
function assistantText(message: Record<string, unknown>): string | undefined {
  const content = Array.isArray(message.content) ? message.content : [];
  const parts: string[] = [];
  for (const part of content) {
    const record = asRecord(part);
    if (firstNonEmptyString(record?.type) !== 'text') continue;
    const text = firstNonEmptyString(record?.text);
    if (text) parts.push(text);
  }
  return parts.length > 0 ? parts.join('\n') : undefined;
}

function retryFromRecord(
  event: Record<string, unknown>,
  phase: 'start' | 'end',
): HarnessRetryEventData {
  const maxAttempts = numberField(event.maxAttempts);
  const delayMs = numberField(event.delayMs);
  const error = firstNonEmptyString(event.errorMessage, event.finalError, event.error);
  return {
    phase,
    attempt: numberField(event.attempt) ?? 0,
    ...(maxAttempts !== undefined ? { maxAttempts } : {}),
    ...(delayMs !== undefined ? { delayMs } : {}),
    ...(typeof event.success === 'boolean' ? { success: event.success } : {}),
    ...(error ? { error } : {}),
  };
}

async function handleMessageEnd(
  event: Record<string, unknown>,
  ctx: PiStreamContext,
  timestamp: string,
): Promise<void> {
  const message = asRecord(event.message);
  if (!message || firstNonEmptyString(message.role) !== 'assistant') return;

  const text = assistantText(message);
  if (text !== undefined) {
    await appendHarnessEvent(ctx.specFolderPath, ctx.taskNumber, {
      type: 'text',
      timestamp,
      data: { text } satisfies TextEventData,
    });
  }

  const tokens = tokensFromMessage(message);
  if (tokens) {
    await appendHarnessEvent(ctx.specFolderPath, ctx.taskNumber, {
      type: 'tokens',
      timestamp,
      data: tokens,
    });
  }
}

async function handleToolStart(
  event: Record<string, unknown>,
  ctx: PiStreamContext,
  state: PiStreamState,
  timestamp: string,
): Promise<void> {
  const toolName = firstNonEmptyString(event.toolName) ?? 'tool';
  const args = asRecord(event.args);
  const toolCallId = firstNonEmptyString(event.toolCallId);
  if (toolCallId) {
    state.toolCalls.set(toolCallId, {
      toolName,
      ...(firstNonEmptyString(args?.path) ? { path: firstNonEmptyString(args?.path) } : {}),
    });
  }
  const summary = relativizeToolSummary(piToolSummary(toolName, args), ctx.projectRoot);
  await appendHarnessEvent(ctx.specFolderPath, ctx.taskNumber, {
    type: 'tool',
    timestamp,
    data: { tool: toolName, summary },
  });
  ctx.logger?.verbose(`[tool] ${toolName}: ${summary}`);
}

async function handleToolEnd(
  event: Record<string, unknown>,
  ctx: PiStreamContext,
  state: PiStreamState,
  timestamp: string,
): Promise<void> {
  if (event.isError !== false) return;
  const toolCallId = firstNonEmptyString(event.toolCallId);
  const remembered = toolCallId ? state.toolCalls.get(toolCallId) : undefined;
  const toolName = remembered?.toolName ?? firstNonEmptyString(event.toolName) ?? '';
  if (toolName !== 'edit' && toolName !== 'write') return;
  const target = remembered?.path ?? firstNonEmptyString(asRecord(event.args)?.path) ?? undefined;
  if (!target) return;
  await appendHarnessEvent(ctx.specFolderPath, ctx.taskNumber, {
    type: 'file_changed',
    timestamp,
    data: {
      path: toProjectRelative(target, ctx.projectRoot),
    } satisfies FileChangedEventData,
  });
}

/** Translate one completed Pi JSONL line into osq harness events. */
export async function processPiStdoutLine(
  line: string,
  ctx: PiStreamContext,
  state: PiStreamState,
): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    ctx.logger?.verbose(`[pi] Unrecognised stream line: ${trimmed}`);
    return;
  }
  const event = asRecord(parsed);
  if (!event) return;

  const type = firstNonEmptyString(event.type);
  const timestamp = resolveEventTimestamp(event);

  if (type === 'tool_execution_start') {
    await handleToolStart(event, ctx, state, timestamp);
    return;
  }
  if (type === 'tool_execution_end') {
    await handleToolEnd(event, ctx, state, timestamp);
    return;
  }
  if (type === 'message_end') {
    await handleMessageEnd(event, ctx, timestamp);
    return;
  }
  if (type === 'auto_retry_start' || type === 'auto_retry_end') {
    await appendHarnessEvent(ctx.specFolderPath, ctx.taskNumber, {
      type: 'harness_retry',
      timestamp,
      data: retryFromRecord(event, type === 'auto_retry_start' ? 'start' : 'end'),
    });
    return;
  }
  if (type === 'agent_settled') {
    state.settled = true;
    state.onSettled?.();
    return;
  }

  ctx.logger?.verbose(`[pi] Ignored event: ${type ?? 'unknown'}`);
}

/** Buffering helper mirroring the other harness parsers. */
export class PiEventStreamParser extends EventStreamParser {
  constructor(ctx: PiStreamContext, state: PiStreamState) {
    super((line) => processPiStdoutLine(line, ctx, state));
  }
}
