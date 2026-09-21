import fsSync from 'node:fs';
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
  | 'measures'
  | 'done'
  | 'done_manual'
  | 'dead'
  | 'regressed'
  | 'retry'
  | 'rejected';

/** Payload of the lifecycle `started` event emitted by the runner. */
export interface StartedEventData {
  harness: string;
  model: string;
  osqVersion: string;
  /** Target-wide execution attempt; initial execution is 1. */
  attempt: number;
  commit?: string;
  pid?: number;
  timeoutSeconds: number;
  version?: string;
}

/** Legacy `started` payloads emitted by adapters before the runner owned it. */
export type StartedEventPayload = StartedEventData | Record<string, unknown>;

/** Payload of a `tokens` event accumulated from the agent stream. */
export interface TokensEventData {
  promptTokens: number;
  candidateTokens: number;
  totalTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  cost?: number;
}

export interface ToolEventData {
  tool: string;
  summary: string;
}

export interface TextEventData {
  readonly text: string;
}

export interface FileChangedEventData {
  path: string;
}

export interface VerifyRanEventData {
  command: string;
  exitCode: number;
  duration: number;
  /** Legacy field name retained so older emitted lines still type-check. */
  verifyCommand?: string;
  output?: string;
}

export interface ResultWrittenEventData {
  path: string;
  synthesized?: boolean;
}

export interface ExitedEventData {
  exitCode: number;
  pid?: number;
  signal?: string;
  timedOut?: boolean;
  elapsedSeconds?: number;
}

/**
 * Raw measures captured at task start and end. Values are stored as observed;
 * no rates or aggregates are derived here.
 */
export interface MeasuresEventData {
  phase: 'start' | 'end';
  scopeFiles: number;
  scopeLines: number;
  repoFiles: number;
  repoLines: number;
  importFanIn: number;
  proposalWords: number;
  taskWords: number;
  deltaRequirements: number;
  deltaScenarios: number;
  changedFiles?: number;
  changedLines?: number;
  scopeHashes?: Record<string, { before: string | null; after: string | null }>;
}

export interface DoneEventData {
  readonly task: string;
}

export interface DoneManualEventData {
  readonly task: string;
  readonly reason: string;
}

export interface DeadEventData {
  readonly task: string;
  readonly reason: string;
}

/** Payload of a `regressed` event recording a scope or verification regression. */
export interface RegressedEventData {
  task?: string;
  exitCode?: number;
  duration?: number;
  command?: string;
  differingPaths?: string[];
  reason?: string;
}

/**
 * Payload of a `retry` event recording an explicit retry transition. `attempt`
 * is the following execution attempt, so the next `started` event for the
 * target carries the same number.
 */
export interface RetryEventData {
  readonly target: string;
  readonly reason: string;
  readonly attempt: number;
}

/**
 * Payload of a `rejected` event recording a change moved into rejected history.
 * The event's top-level timestamp is the authoritative rejection time; the data
 * carries the same non-empty reason persisted to `.run/rejected.md`.
 */
export interface RejectedEventData {
  readonly reason: string;
}

/** Event type to payload mapping for every lifecycle and observed event. */
export interface OsqEventData {
  started: StartedEventPayload;
  tokens: TokensEventData;
  tool: ToolEventData;
  text: TextEventData;
  file_changed: FileChangedEventData;
  verify_ran: VerifyRanEventData;
  result_written: ResultWrittenEventData;
  exited: ExitedEventData;
  measures: MeasuresEventData;
  done: DoneEventData;
  done_manual: DoneManualEventData;
  dead: DeadEventData;
  regressed: RegressedEventData;
  retry: RetryEventData;
  rejected: RejectedEventData;
}

/**
 * Typed discriminated union over `type` with per-event payloads. Every event
 * written to `.run/events/<n>.jsonl` must conform to one of these members.
 */
export type OsqEvent = {
  [K in HarnessEventType]: {
    type: K;
    timestamp: string;
    data: OsqEventData[K];
  };
}[HarnessEventType];

/** Backwards-compatible alias for {@link OsqEvent}. */
export type HarnessEvent = OsqEvent;

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
  capabilityRules?: string[];
  /** Target-wide execution attempt; initial execution is 1, post-retry is 2+. */
  attempt?: number;
  /** Failure reason carried from the preceding retry transition, when any. */
  priorFailureReason?: string;
}

export interface SpawnResult {
  exitCode: number;
  error?: string;
  timedOut?: boolean;
  signal?: NodeJS.Signals | string | null;
  pid?: number;
  elapsedMs?: number;
}

export interface InteractiveSessionOptions {
  prompt: string;
  cwd: string;
  model?: string;
  agent?: string;
}

/**
 * Observed-only usage for one interactive planning session. Every field is
 * independently nullable: missing artifacts, malformed data, ambiguous matches,
 * or absent harness support yield `null` rather than an estimate.
 */
export interface InteractiveUsage {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly cachedTokens: number | null;
  readonly reasoningTokens: number | null;
  readonly cost: number | null;
}

/** Explicit all-null value for harnesses without a confirmed usage artifact. */
export const NULL_INTERACTIVE_USAGE: InteractiveUsage = Object.freeze({
  inputTokens: null,
  outputTokens: null,
  cachedTokens: null,
  reasoningTokens: null,
  cost: null,
});

export interface ReadInteractiveUsageOptions {
  readonly cwd: string;
  readonly startedAt: string;
  readonly endedAt: string;
}

export interface HarnessAdapter {
  readonly name: string;
  setup(projectRoot: string, config: OsqConfig): Promise<void>;
  spawn(options: SpawnTaskOptions): Promise<SpawnResult>;
  spawnInteractive?(options: InteractiveSessionOptions): Promise<number>;
  /**
   * Optional post-session usage observation. Receives the project working
   * directory and the observed session interval and never changes the planner
   * process exit result.
   */
  readInteractiveUsage?(options: ReadInteractiveUsageOptions): Promise<InteractiveUsage>;
  preflight?(projectRoot: string, config: OsqConfig): Promise<void>;
}

const REQUIREMENT_HEADER_REGEX = /^###\s+Requirement:\s*(.+?)\s*$/gm;
const SCENARIO_HEADER_REGEX = /^####\s+/m;

interface ParsedRequirement {
  readonly title: string;
  readonly statement: string;
}

/**
 * Parses `### Requirement: <title>` blocks from a capability specification.
 * The statement is the requirement prose up to the first scenario subheading,
 * with HTML comments stripped and whitespace collapsed.
 */
function parseRequirementRules(content: string): ParsedRequirement[] {
  const requirements: ParsedRequirement[] = [];

  for (const match of content.matchAll(REQUIREMENT_HEADER_REGEX)) {
    const start = (match.index ?? 0) + match[0].length;
    const rest = content.slice(start);
    const boundary = rest.search(/\n(?:##(?!#)\s|###\s)/);
    const block = boundary === -1 ? rest : rest.slice(0, boundary);

    const scenarioIndex = block.search(SCENARIO_HEADER_REGEX);
    const prose = scenarioIndex === -1 ? block : block.slice(0, scenarioIndex);
    const statement = prose
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    requirements.push({ title: match[1].trim(), statement });
  }

  return requirements;
}

/**
 * Extracts capability-specific rules from the delta specs a change writes under
 * `specs/<capability>/spec.md`. Each rule is rendered as
 * `<capability>: <requirement title> — <requirement statement>`. Capabilities
 * are visited in sorted order and requirements keep document order, so the
 * resulting prompt is deterministic. Returns an empty array when the change
 * folder has no delta specs.
 */
export function extractCapabilityRules(specFolderPath: string): string[] {
  const specsDir = path.join(specFolderPath, 'specs');
  let entries: fsSync.Dirent[];
  try {
    entries = fsSync.readdirSync(specsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const rules: string[] = [];
  const ordered = [...entries].sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of ordered) {
    if (!entry.isDirectory()) {
      continue;
    }

    let content: string;
    try {
      content = fsSync.readFileSync(path.join(specsDir, entry.name, 'spec.md'), 'utf8');
    } catch {
      continue;
    }

    for (const requirement of parseRequirementRules(content)) {
      const detail = requirement.statement
        ? `${requirement.title} — ${requirement.statement}`
        : requirement.title;
      rules.push(`${entry.name}: ${detail}`);
    }
  }

  return rules;
}

/**
 * Resolves the capability rules for a task. An explicit `capabilityRules`
 * option always wins, including an explicit empty array; when the option is
 * absent the change folder's delta specs are parsed.
 */
export function resolveCapabilityRules(options: SpawnTaskOptions): string[] {
  return options.capabilityRules ?? extractCapabilityRules(options.specFolderPath);
}

/**
 * Shared `Rules:` sub-section listing capability-specific requirements. Returns
 * no lines when there are no rules so a prompt never carries an empty header.
 */
export function capabilityRuleLines(rules: readonly string[]): string[] {
  if (rules.length === 0) {
    return [];
  }
  return ['', 'Capability Rules:', ...rules.map((rule) => `- ${rule}`)];
}

export interface PriorContext {
  readonly attempt?: number;
  readonly reason?: string;
  readonly resultPath?: string;
}

/**
 * Shared prior-context block for every textual executor prompt. It is rendered
 * when a retry supplied an attempt or failure reason, or when a prior result
 * file still exists, so a fresh process reconstructs why it is running again.
 */
export function priorContextLines(context: PriorContext): string[] {
  const attempt = context.attempt ?? 1;
  if (attempt <= 1 && !context.reason && !context.resultPath) {
    return [];
  }
  const lines = ['', 'Prior Context:', `- Prior Attempt: ${attempt}`];
  if (context.reason) {
    lines.push(`- Prior Failure: ${context.reason}`);
  }
  if (context.resultPath) {
    lines.push(`- Prior Result: ${context.resultPath}`);
  }
  return lines;
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
