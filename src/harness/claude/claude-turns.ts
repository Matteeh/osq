import type { PlanningTurn } from '../../core/report/planning-slice.js';

/** Assistant tool names whose successful call counts as one planning edit. */
export const EDIT_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

/**
 * One Claude model response. `messageId` stays non-enumerable: it carries the
 * native identity used when transcripts and their subagent files are merged,
 * without changing the serialized `PlanningTurn` shape.
 */
export interface ClaudeTurn extends PlanningTurn {
  readonly messageId: string | null;
}

/** Session metadata and one turn per distinct native message of a transcript. */
export interface ClaudeTurns {
  readonly sessionId: string | null;
  readonly cwd: string | null;
  readonly harnessVersion: string | null;
  readonly sessionCost: number | null;
  readonly turns: readonly ClaudeTurn[];
}

interface TurnUsage {
  readonly input: number | null;
  readonly output: number | null;
  readonly cacheRead: number | null;
  readonly cacheWrite: number | null;
  readonly reasoning: number | null;
}

interface TurnDraft {
  readonly id: string | null;
  earliest: string;
  model: string | null;
  usage: TurnUsage | null;
  readonly edits: string[];
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function validIso(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

export function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function contentBlocks(record: Record<string, unknown>): Record<string, unknown>[] {
  const message = asRecord(record.message);
  if (!Array.isArray(message?.content)) return [];
  return message.content
    .map((block) => asRecord(block))
    .filter((block): block is Record<string, unknown> => block !== undefined);
}

/** JSONL records with malformed lines ignored; no content is retained. */
export function parseRecords(content: string): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = asRecord(JSON.parse(line));
      if (parsed) records.push(parsed);
    } catch {
      // Malformed lines are ignored; the affected turn keeps null usage.
    }
  }
  return records;
}

function collectErrored(records: readonly Record<string, unknown>[]): Set<string> {
  const errored = new Set<string>();
  for (const record of records) {
    for (const block of contentBlocks(record)) {
      if (block.type === 'tool_result' && block.is_error === true) {
        const id = text(block.tool_use_id);
        if (id) errored.add(id);
      }
    }
  }
  return errored;
}

function editPath(block: Record<string, unknown>): string | null {
  const name = block.name;
  if (typeof name !== 'string' || !EDIT_TOOLS.has(name)) return null;
  const input = asRecord(block.input);
  return name === 'NotebookEdit' ? text(input?.notebook_path) : text(input?.file_path);
}

function numberField(record: Record<string, unknown> | undefined, key: string): number | null {
  return record ? finiteNonNegative(record[key]) : null;
}

function hasUsage(message: Record<string, unknown>): boolean {
  return asRecord(message.usage) !== undefined;
}

function parseUsage(message: Record<string, unknown>): TurnUsage {
  const usage = asRecord(message.usage);
  const details = asRecord(usage?.output_tokens_details);
  return {
    input: numberField(usage, 'input_tokens'),
    output: numberField(usage, 'output_tokens'),
    cacheRead: numberField(usage, 'cache_read_input_tokens'),
    cacheWrite: numberField(usage, 'cache_creation_input_tokens'),
    reasoning: numberField(details, 'thinking_tokens'),
  };
}

const EMPTY_USAGE: TurnUsage = {
  input: null,
  output: null,
  cacheRead: null,
  cacheWrite: null,
  reasoning: null,
};

function makeTurn(draft: TurnDraft): ClaudeTurn {
  const usage = draft.usage ?? EMPTY_USAGE;
  const turn: PlanningTurn = {
    timestamp: draft.earliest,
    model: draft.model,
    inputTokens: usage.input,
    outputTokens: usage.output,
    cacheReadTokens: usage.cacheRead,
    cacheWriteTokens: usage.cacheWrite,
    reasoningTokens: usage.reasoning,
    cost: null,
    edits: draft.edits,
  };
  Object.defineProperty(turn, 'messageId', { value: draft.id, enumerable: false });
  return turn as ClaudeTurn;
}

/** Group assistant records into one turn per distinct `message.id`. */
export function parseClaudeTurns(content: string): ClaudeTurns {
  const records = parseRecords(content);
  const errored = collectErrored(records);
  const drafts = new Map<string, TurnDraft>();
  let anonymous = 0;
  let sessionId: string | null = null;
  let cwd: string | null = null;
  let harnessVersion: string | null = null;
  let sessionCost: number | null = null;

  for (const record of records) {
    sessionId = sessionId ?? text(record.sessionId);
    cwd = cwd ?? text(record.cwd);
    harnessVersion = harnessVersion ?? text(record.version);
    if (record.type === 'cost-state') {
      sessionCost = finiteNonNegative(record.totalCostUSD);
      continue;
    }
    const message = asRecord(record.message);
    const isAssistant = record.type === 'assistant' || message?.role === 'assistant';
    const timestamp = validIso(record.timestamp);
    if (!isAssistant || !timestamp) continue;
    const id = message ? text(message.id) : null;
    const key = id ?? `\u0000anonymous:${anonymous++}`;
    const draft = drafts.get(key) ?? {
      id,
      earliest: timestamp,
      model: null,
      usage: null,
      edits: [],
    };
    if (timestamp < draft.earliest) draft.earliest = timestamp;
    if (draft.model === null && message) draft.model = text(message.model);
    if (draft.usage === null && message && hasUsage(message)) draft.usage = parseUsage(message);
    drafts.set(key, draft);
    for (const block of contentBlocks(record)) {
      if (block.type !== 'tool_use') continue;
      const toolId = text(block.id);
      if (toolId && errored.has(toolId)) continue;
      const target = editPath(block);
      if (target) draft.edits.push(target);
    }
  }

  return {
    sessionId,
    cwd,
    harnessVersion,
    sessionCost,
    turns: [...drafts.values()].map(makeTurn),
  };
}
