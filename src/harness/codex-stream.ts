import path from 'node:path';
import type { Logger } from '../core/logger.js';
import { relativizeToolSummary } from '../core/summary.js';
import {
  EventStreamParser,
  asRecord,
  firstNonEmptyString,
  resolveEventTimestamp,
} from './stream.js';
import {
  type FileChangedEventData,
  type TextEventData,
  type TokensEventData,
  type ToolEventData,
  appendHarnessEvent,
} from './types.js';

export interface CodexStreamContext {
  specFolderPath: string;
  taskNumber: string;
  projectRoot: string;
  logger?: Logger;
}

/** Mutable stream state: a terminal `turn.failed` poisons the whole run. */
export interface CodexStreamState {
  terminalFailure?: string;
}

export function createCodexStreamState(): CodexStreamState {
  return {};
}

const SUMMARY_MAX = 60;
const COMMAND_ITEM_TYPES = new Set(['command_execution', 'command']);
const MCP_ITEM_TYPES = new Set(['mcp_call', 'mcp_tool_call', 'mcp_tool']);
const SUCCESSFUL_CHANGE_STATUSES = new Set([
  'success',
  'succeeded',
  'completed',
  'update',
  'updated',
  'create',
  'created',
  'add',
  'added',
  'write',
  'written',
  'patch',
  'patched',
]);

function toProjectRelative(target: string, projectRoot: string): string {
  return path.isAbsolute(target) ? path.relative(projectRoot, target) : target;
}

function extractText(item: Record<string, unknown>): string | undefined {
  const type = firstNonEmptyString(item.type);
  if (type !== 'agent_message' && type !== 'assistant_message') return undefined;
  return firstNonEmptyString(item.text, item.message);
}

function extractTool(item: Record<string, unknown>): ToolEventData | undefined {
  const type = firstNonEmptyString(item.type);
  if (!type) return undefined;
  if (COMMAND_ITEM_TYPES.has(type)) {
    const command = firstNonEmptyString(item.command, item.command_line, item.cmd);
    if (!command) return undefined;
    return { tool: 'command', summary: command.slice(0, SUMMARY_MAX) };
  }
  if (MCP_ITEM_TYPES.has(type)) {
    const server = firstNonEmptyString(item.server, item.server_name);
    const tool = firstNonEmptyString(item.tool, item.name) ?? 'mcp';
    const name = server ? `${server}.${tool}` : tool;
    const args = asRecord(item.arguments) ?? asRecord(item.input);
    const summary = args ? JSON.stringify(args) : '';
    return { tool: name, summary: summary.slice(0, SUMMARY_MAX) };
  }
  return undefined;
}

/** Successful completed file-change paths, never re-emitted as edit/write tools. */
function extractFileChanges(item: Record<string, unknown>): string[] {
  const type = firstNonEmptyString(item.type);
  if (type !== 'file_change' && type !== 'file_changes') return [];
  const itemStatus = firstNonEmptyString(item.status);
  if (itemStatus && !SUCCESSFUL_CHANGE_STATUSES.has(itemStatus.toLowerCase())) return [];

  const changes = Array.isArray(item.changes) ? item.changes : [];
  const paths: string[] = [];
  for (const change of changes) {
    const record = asRecord(change);
    const status = firstNonEmptyString(record?.status, record?.kind, record?.type);
    if (status && !SUCCESSFUL_CHANGE_STATUSES.has(status.toLowerCase())) continue;
    const target = firstNonEmptyString(
      record?.path,
      record?.file,
      typeof change === 'string' ? change : undefined,
      item.path,
    );
    if (target) paths.push(target);
  }
  return paths;
}

function extractTokens(event: Record<string, unknown>): TokensEventData | undefined {
  const usage = asRecord(event.usage);
  if (!usage) return undefined;
  const promptTokens = Number(usage.input_tokens) || 0;
  const candidateTokens = Number(usage.output_tokens) || 0;
  const data: TokensEventData = {
    promptTokens,
    candidateTokens,
    totalTokens: promptTokens + candidateTokens,
  };
  const cached = Number(usage.cached_input_tokens);
  if (Number.isFinite(cached)) data.cachedTokens = cached;
  const reasoning = Number(usage.reasoning_output_tokens);
  if (Number.isFinite(reasoning)) data.reasoningTokens = reasoning;
  return data;
}

function extractTerminalFailure(event: Record<string, unknown>): string | undefined {
  if (firstNonEmptyString(event.type) !== 'turn.failed') return undefined;
  const error = asRecord(event.error);
  return firstNonEmptyString(error?.message, error?.detail, event.message) ?? 'Codex turn failed';
}

/**
 * Ordered Codex JSONL translation. Only `item.completed` produces observations,
 * so `item.started`/`item.updated` can never duplicate completed items.
 */
export async function processCodexStdoutLine(
  line: string,
  ctx: CodexStreamContext,
  state: CodexStreamState,
): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    ctx.logger?.verbose(`[codex] Unrecognised stream line: ${trimmed}`);
    return;
  }
  const event = asRecord(parsed);
  if (!event) return;

  const failure = extractTerminalFailure(event);
  if (failure !== undefined) {
    state.terminalFailure = failure;
    return;
  }

  const type = firstNonEmptyString(event.type);
  const timestamp = resolveEventTimestamp(event);

  if (type === 'item.completed') {
    const item = asRecord(event.item);
    if (!item) return;

    const text = extractText(item);
    if (text !== undefined) {
      await appendHarnessEvent(ctx.specFolderPath, ctx.taskNumber, {
        type: 'text',
        timestamp,
        data: { text } satisfies TextEventData,
      });
      return;
    }

    const files = extractFileChanges(item);
    if (files.length > 0) {
      for (const file of files) {
        await appendHarnessEvent(ctx.specFolderPath, ctx.taskNumber, {
          type: 'file_changed',
          timestamp,
          data: { path: toProjectRelative(file, ctx.projectRoot) } satisfies FileChangedEventData,
        });
      }
      return;
    }

    const tool = extractTool(item);
    if (tool) {
      const summary = relativizeToolSummary(tool.summary, ctx.projectRoot);
      await appendHarnessEvent(ctx.specFolderPath, ctx.taskNumber, {
        type: 'tool',
        timestamp,
        data: { tool: tool.tool, summary },
      });
      ctx.logger?.verbose(`[tool] ${tool.tool}: ${summary}`);
    }
    return;
  }

  if (type === 'turn.completed') {
    const tokens = extractTokens(event);
    if (tokens) {
      await appendHarnessEvent(ctx.specFolderPath, ctx.taskNumber, {
        type: 'tokens',
        timestamp,
        data: tokens,
      });
    }
    return;
  }

  ctx.logger?.verbose(`[codex] Ignored event: ${type ?? 'unknown'}`);
}

/** Buffering helper mirroring the other harness parsers. */
export class CodexEventStreamParser extends EventStreamParser {
  constructor(ctx: CodexStreamContext, state: CodexStreamState) {
    super((line) => processCodexStdoutLine(line, ctx, state));
  }
}
