import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/foundation/config.js';
import type { Logger } from '../core/foundation/logger.js';
import type { ScopePathAttribution } from '../core/run/scope-hash.js';
import type { SCOPE_RESOLVER_VERSION } from '../core/run/scope.js';

export type { ScopePathAttribution } from '../core/run/scope-hash.js';

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
  | 'dependencies_added'
  | 'done'
  | 'done_manual'
  | 'dead'
  | 'regressed'
  | 'retry'
  | 'stuck'
  | 'harness_retry'
  | 'recertification'
  | 'rejected'
  | 'instructions_changed'
  | 'focused_ran';

/** Payload of the lifecycle `started` event emitted by the runner. */
export interface StartedEventData {
  harness: string;
  model: string;
  osqVersion: string;
  /** Target-wide execution attempt; initial execution is 1. */
  attempt: number;
  /** Short HEAD commit of the project being watched, or null outside git. */
  projectCommit?: string | null;
  commit?: string;
  pid?: number;
  timeoutSeconds: number;
  version?: string;
  /** First line of the harness binary's `--version`, when the adapter supplies it. */
  harnessVersion?: string;
  /** How the harness authenticated, when the adapter can tell. */
  harnessAuth?: 'api_key' | 'login';
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
  /** Provider Pi reported for the response, when it reported one. */
  provider?: string;
  /** Model Pi reported for the response, when it reported one. */
  model?: string;
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
  /** Present only on pre-spawn runs: the declared start state and verdict. */
  phase?: 'pre_spawn';
  expected?: 'red' | 'green' | 'any';
  mismatch?: boolean;
  /** Present only when a named path is absent before spawn, in command order. */
  missingPaths?: string[];
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
  /** Deterministic scope resolver version that produced the scope-derived fields. */
  scopeResolver: typeof SCOPE_RESOLVER_VERSION;
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
  /** Scoped `package.json` path to its sorted package names, when any is scoped. */
  dependencies?: Record<string, string[]>;
}

/** Payload of a `dependencies_added` event: the new packages a task introduced. */
export interface DependenciesAddedEventData {
  readonly added: readonly { file: string; name: string }[];
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
  /** Paths a verify named that did not exist; set on `verify_path_missing` regressions. */
  missingPaths?: string[];
  reason?: string;
  /** Structured per-path attribution detected by the scope recertification audit. */
  attribution?: ScopePathAttribution[];
  recordedHash?: string;
  currentHash?: string;
  /** Recorded resolver version (null when legacy or malformed) and current version. */
  recordedResolver?: number | null;
  currentResolver?: number;
  output?: string;
  timedOut?: boolean;
  verificationPassed?: boolean;
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
  /** True only when the watcher, rather than a human, requested the retry. */
  readonly automatic?: boolean;
}

/**
 * Payload of a `stuck` event: the watcher observed the same failure twice and
 * stopped retrying the task automatically.
 */
export interface StuckEventData {
  readonly task: string;
  readonly fingerprint: string;
}

/**
 * Payload of a `harness_retry` event translated from a harness's own automatic
 * retry records (Pi's `auto_retry_start` and `auto_retry_end`).
 */
export interface HarnessRetryEventData {
  readonly phase: 'start' | 'end';
  readonly attempt: number;
  readonly maxAttempts?: number;
  readonly delayMs?: number;
  readonly success?: boolean;
  readonly error?: string;
}

/**
 * Payload of a `recertification` event recording a human retry of an active
 * scope regression. `passed` refreshes the trusted done record without an agent
 * or execution attempt; `requeued` retains both markers and carries the next
 * attempt and failed output so a restarted watcher can rebuild the executor
 * context from append-only state alone.
 */
export interface RecertificationEventData {
  readonly task: string;
  readonly outcome: 'passed' | 'requeued';
  readonly differingPaths: string[];
  readonly attribution: ScopePathAttribution[];
  readonly command: string;
  readonly exitCode: number;
  readonly output: string;
  readonly timedOut: boolean;
  /** Recorded hash before the change, or the original trusted hash. */
  readonly recordedHash: string;
  readonly currentHash: string;
  /** Next execution attempt; present only for a requeue. */
  readonly attempt?: number;
  /** Failure reason carried to the next executor; present only for a requeue. */
  readonly reason?: string;
  /** True only when the watcher recertified automatically; absent for a human. */
  readonly automatic?: true;
}

/**
 * Payload of a `rejected` event recording a change moved into rejected history.
 * The event's top-level timestamp is the authoritative rejection time; the data
 * carries the same non-empty reason persisted to `.run/rejected.md`.
 */
export interface RejectedEventData {
  readonly reason: string;
}

/**
 * Payload of an `instructions_changed` event: the instruction inputs the
 * approval pinned that differ before a task's first attempt. `changed` holds
 * `AGENTS.md`, then each differing governing ADR in number order.
 */
export interface InstructionsChangedEventData {
  readonly changed: string[];
}

/** How one focused scenario-test run ended. */
export type FocusedRanOutcome = 'passed' | 'problem' | 'failed';

/**
 * Payload of a `focused_ran` event: the one focused scenario-test run the
 * watcher makes after an agent exits. `scenarios` holds `<capability>: <name>`
 * strings, `duration` is wall seconds, and `output` is the captured TAP text.
 */
export interface FocusedRanEventData {
  readonly command: string;
  readonly files: readonly string[];
  readonly scenarios: readonly string[];
  readonly outcome: FocusedRanOutcome;
  readonly exitCode: number;
  readonly duration: number;
  readonly timedOut: boolean;
  readonly output: string;
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
  dependencies_added: DependenciesAddedEventData;
  done: DoneEventData;
  done_manual: DoneManualEventData;
  dead: DeadEventData;
  regressed: RegressedEventData;
  retry: RetryEventData;
  stuck: StuckEventData;
  harness_retry: HarnessRetryEventData;
  recertification: RecertificationEventData;
  rejected: RejectedEventData;
  instructions_changed: InstructionsChangedEventData;
  focused_ran: FocusedRanEventData;
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

/** Optional attribution an adapter can add when the child process exists. */
export interface SpawnDetails {
  readonly harnessVersion?: string;
  readonly harnessAuth?: 'api_key' | 'login';
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
  onSpawn?: (pid: number, details?: SpawnDetails) => Promise<void> | void;
  capabilityRules?: string[];
  /** Target-wide execution attempt; initial execution is 1, post-retry is 2+. */
  attempt?: number;
  /** Failure reason carried from the preceding retry transition, when any. */
  priorFailureReason?: string;
  /** Failed verification output carried from a requeued recertification, when any. */
  priorFailureOutput?: string;
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
  /** Failed verification output to bound and render inside the prior context. */
  readonly output?: string;
  readonly resultPath?: string;
}

/** Bounded failed-output length kept identical across every textual harness prompt. */
const PRIOR_CONTEXT_OUTPUT_MAX_LENGTH = 2000;

function boundedPriorOutput(output: string): string {
  return output.length <= PRIOR_CONTEXT_OUTPUT_MAX_LENGTH
    ? output
    : `${output.slice(0, PRIOR_CONTEXT_OUTPUT_MAX_LENGTH)}…`;
}

/**
 * Shared prior-context block for every textual executor prompt. It is rendered
 * when a retry or requeued recertification supplied an attempt, failure reason,
 * or failed output, or when a prior result file still exists, so a fresh process
 * reconstructs why it is running again.
 */
export function priorContextLines(context: PriorContext): string[] {
  const attempt = context.attempt ?? 1;
  const output = typeof context.output === 'string' ? context.output : '';
  const hasOutput = output.trim().length > 0;
  if (attempt <= 1 && !context.reason && !context.resultPath && !hasOutput) {
    return [];
  }
  const lines = ['', 'Prior Context:', `- Prior Attempt: ${attempt}`];
  if (context.reason) {
    lines.push(`- Prior Failure: ${context.reason}`);
  }
  if (hasOutput) {
    lines.push('- Prior Failure Output:');
    for (const line of boundedPriorOutput(output).split('\n')) {
      lines.push(`  ${line}`);
    }
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
