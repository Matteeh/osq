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
  type TextEventData,
  type TokensEventData,
  appendHarnessEvent,
} from '../types.js';
import { claudeToolSummary, toProjectRelative } from './claude-tools.js';

export interface ClaudeStreamContext {
  specFolderPath: string;
  taskNumber: string;
  projectRoot: string;
  logger?: Logger;
}

interface ToolUseMemory {
  readonly name: string;
  readonly path?: string;
}

/** Mutable state shared across Claude Code's JSONL records. */
export interface ClaudeStreamState {
  readonly toolUses: Map<string, ToolUseMemory>;
  /** The `result` record's `subtype`, when the stream reached one. */
  subtype?: string;
  /** The `result` record's `is_error`, so an adapter can name a failing subtype. */
  isError?: boolean;
  /** The `result` record's final `result` text. */
  result?: string;
}

export function createClaudeStreamState(): ClaudeStreamState {
  return { toolUses: new Map() };
}

function contentBlocks(message: Record<string, unknown> | undefined): Record<string, unknown>[] {
  if (!Array.isArray(message?.content)) return [];
  return message.content
    .map((block) => asRecord(block))
    .filter((block): block is Record<string, unknown> => block !== undefined);
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

async function handleAssistant(
  event: Record<string, unknown>,
  ctx: ClaudeStreamContext,
  state: ClaudeStreamState,
  timestamp: string,
): Promise<void> {
  const message = asRecord(event.message);
  for (const block of contentBlocks(message)) {
    const type = firstNonEmptyString(block.type);
    if (type === 'tool_use') {
      const name = firstNonEmptyString(block.name) ?? 'tool';
      const id = firstNonEmptyString(block.id);
      const input = asRecord(block.input);
      const filePath = firstNonEmptyString(input?.file_path);
      if (id) {
        state.toolUses.set(id, { name, ...(filePath ? { path: filePath } : {}) });
      }
      const summary = relativizeToolSummary(claudeToolSummary(name, input), ctx.projectRoot);
      await appendHarnessEvent(ctx.specFolderPath, ctx.taskNumber, {
        type: 'tool',
        timestamp,
        data: { tool: name, summary },
      });
      ctx.logger?.verbose(`[tool] ${name}: ${summary}`);
      continue;
    }
    if (type === 'text') {
      const text = firstNonEmptyString(block.text);
      if (text) {
        await appendHarnessEvent(ctx.specFolderPath, ctx.taskNumber, {
          type: 'text',
          timestamp,
          data: { text } satisfies TextEventData,
        });
      }
    }
  }
}

async function handleUser(
  event: Record<string, unknown>,
  ctx: ClaudeStreamContext,
  state: ClaudeStreamState,
  timestamp: string,
): Promise<void> {
  const message = asRecord(event.message);
  for (const block of contentBlocks(message)) {
    if (firstNonEmptyString(block.type) !== 'tool_result') continue;
    if (block.is_error === true) continue;
    const id = firstNonEmptyString(block.tool_use_id);
    const remembered = id ? state.toolUses.get(id) : undefined;
    if (!remembered) continue;
    if (remembered.name !== 'Edit' && remembered.name !== 'Write') continue;
    if (!remembered.path) continue;
    await appendHarnessEvent(ctx.specFolderPath, ctx.taskNumber, {
      type: 'file_changed',
      timestamp,
      data: {
        path: toProjectRelative(remembered.path, ctx.projectRoot),
      } satisfies FileChangedEventData,
    });
  }
}

async function handleResult(
  event: Record<string, unknown>,
  ctx: ClaudeStreamContext,
  state: ClaudeStreamState,
  timestamp: string,
): Promise<void> {
  state.subtype = firstNonEmptyString(event.subtype);
  state.isError = event.is_error === true;
  state.result = firstNonEmptyString(event.result);

  const modelUsage = asRecord(event.modelUsage);
  if (!modelUsage) return;
  for (const [model, entry] of Object.entries(modelUsage)) {
    const usage = asRecord(entry);
    if (!usage) continue;
    const cacheRead = numberField(usage.cacheReadInputTokens);
    const promptTokens =
      (numberField(usage.inputTokens) ?? 0) +
      (cacheRead ?? 0) +
      (numberField(usage.cacheCreationInputTokens) ?? 0);
    const candidateTokens = numberField(usage.outputTokens) ?? 0;
    const data: TokensEventData = {
      promptTokens,
      candidateTokens,
      totalTokens: promptTokens + candidateTokens,
      model,
    };
    if (cacheRead !== undefined) data.cachedTokens = cacheRead;
    const reasoning = numberField(usage.thinkingTokens);
    if (reasoning !== undefined) data.reasoningTokens = reasoning;
    const cost = numberField(usage.costUSD);
    if (cost !== undefined) data.cost = cost;
    await appendHarnessEvent(ctx.specFolderPath, ctx.taskNumber, {
      type: 'tokens',
      timestamp,
      data,
    });
  }
}

/** Translate one completed Claude Code JSONL line into osq harness events. */
export async function processClaudeStdoutLine(
  line: string,
  ctx: ClaudeStreamContext,
  state: ClaudeStreamState,
): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    ctx.logger?.verbose(`[claude] Unrecognised stream line: ${trimmed}`);
    return;
  }
  const event = asRecord(parsed);
  if (!event) return;

  const type = firstNonEmptyString(event.type);
  const timestamp = resolveEventTimestamp(event);

  if (type === 'assistant') {
    await handleAssistant(event, ctx, state, timestamp);
    return;
  }
  if (type === 'user') {
    await handleUser(event, ctx, state, timestamp);
    return;
  }
  if (type === 'result') {
    await handleResult(event, ctx, state, timestamp);
    return;
  }

  ctx.logger?.verbose(`[claude] Ignored event: ${type ?? 'unknown'}`);
}

/** Buffering helper mirroring the other harness parsers. */
export class ClaudeEventStreamParser extends EventStreamParser {
  constructor(ctx: ClaudeStreamContext, state: ClaudeStreamState) {
    super((line) => processClaudeStdoutLine(line, ctx, state));
  }
}
