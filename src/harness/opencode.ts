import { spawn } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { type OsqConfig, loadConfig } from '../core/config.js';
import { MANAGED_AGENTS_BLOCK, OSQ_END_MARKER, OSQ_START_MARKER } from '../core/init.js';
import type { Logger } from '../core/logger.js';
import { parseFrontmatter, parseSpecMdFromFolder } from '../core/parser.js';
import { relativizeToolSummary } from '../core/summary.js';
import { readOpencodeInteractiveUsage } from './opencode-usage.js';
import { type SpawnProcessResult, spawnWithTimeout } from './process.js';
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

export const OPENCODE_PLANNER_AGENT_TEMPLATE = `---
description: Interactive planning agent for osq
mode: all
permission:
  read: allow
  write: allow
  edit: allow
  glob: allow
  grep: allow
  bash: deny
  git: deny
  webfetch: deny
  websearch: deny
---

Follow PLANNER.md strictly for change planning rules and procedure.
Writes are expected only under openspec/changes/<id>/.
`;

export const OPENCODE_AGENT_TEMPLATE = `---
description: Autonomous task execution agent for osq
mode: all
permission:
  read: allow
  edit: allow
  bash: allow
  glob: allow
  grep: allow
  webfetch: deny
  websearch: deny
---

${MANAGED_AGENTS_BLOCK}
`;

export async function resolveOpencodeBinary(config?: OsqConfig): Promise<string> {
  if (process.env.OPENCODE_PATH) {
    return process.env.OPENCODE_PATH;
  }
  if (config?.opencode?.bin) {
    return config.opencode.bin;
  }
  return 'opencode';
}

export function buildOpencodePrompt(options: SpawnTaskOptions): string {
  const { projectRoot, specFolderPath, taskNumber, taskTitle, scope, entry, verifyCommand } =
    options;

  const changeDocName = fsSync.existsSync(path.resolve(specFolderPath, 'proposal.md'))
    ? 'proposal.md'
    : 'spec.md';
  const taskRelPath = path.relative(
    projectRoot,
    path.resolve(specFolderPath, 'tasks', `${taskNumber}.md`),
  );
  const specRelPath = path.relative(projectRoot, path.resolve(specFolderPath, changeDocName));
  const resultAbsPath = path.resolve(specFolderPath, '.run', 'results', `${taskNumber}.md`);
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

export async function buildOpencodeArgs(options: SpawnTaskOptions): Promise<string[]> {
  const { projectRoot, specFolderPath, taskNumber, config } = options;

  const agent = config?.opencode?.agent || 'osq-coder';
  const model = config?.opencode?.model || process.env.OSQ_MODEL || 'deepseek/deepseek-flash';
  const prompt = buildOpencodePrompt(options);

  const args: string[] = [
    'run',
    prompt,
    '--agent',
    agent,
    '--auto',
    '--format',
    'json',
    '--dir',
    projectRoot,
    '--model',
    model,
  ];

  if (config?.opencode?.variant) {
    args.push('--variant', config.opencode.variant);
  }

  const changeDocName = fsSync.existsSync(path.resolve(specFolderPath, 'proposal.md'))
    ? 'proposal.md'
    : 'spec.md';
  const taskRelPath = path.relative(
    projectRoot,
    path.resolve(specFolderPath, 'tasks', `${taskNumber}.md`),
  );
  const specRelPath = path.relative(projectRoot, path.resolve(specFolderPath, changeDocName));

  args.push('--file', taskRelPath);
  args.push('--file', specRelPath);

  const attachedFiles = new Set([taskRelPath, specRelPath]);
  const attachExistingFile = (absolutePath: string): void => {
    let isFile = false;
    try {
      isFile = fsSync.statSync(absolutePath).isFile();
    } catch {}
    if (!isFile) return;
    const relativePath = path.relative(projectRoot, absolutePath);
    if (attachedFiles.has(relativePath)) return;
    attachedFiles.add(relativePath);
    args.push('--file', relativePath);
  };

  // Delta specifications are authored inputs even when they introduce a new
  // capability with no living spec yet. Attach them directly and never invent
  // a living-spec path for the OpenCode CLI to reject.
  let writtenCapabilities: string[] = [];
  try {
    writtenCapabilities = (
      await fs.readdir(path.resolve(specFolderPath, 'specs'), {
        withFileTypes: true,
      })
    )
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {}
  for (const capability of writtenCapabilities) {
    attachExistingFile(path.resolve(specFolderPath, 'specs', capability, 'spec.md'));
  }

  let featureNames: string[] = [];
  try {
    const taskPath = path.resolve(specFolderPath, 'tasks', `${taskNumber}.md`);
    const taskContent = await fs.readFile(taskPath, 'utf8');
    const { data: taskData } = parseFrontmatter(taskContent);
    if (taskData.features) {
      if (Array.isArray(taskData.features)) {
        featureNames = taskData.features
          .map(String)
          .map((s) => s.trim())
          .filter(Boolean);
      } else if (typeof taskData.features === 'object' && taskData.features !== null) {
        const featObj = taskData.features as Record<string, unknown>;
        const reads = Array.isArray(featObj.reads) ? featObj.reads : [];
        const writes = Array.isArray(featObj.writes) ? featObj.writes : [];
        featureNames = [...reads, ...writes]
          .map(String)
          .map((s) => s.trim())
          .filter(Boolean);
      } else if (typeof taskData.features === 'string' && taskData.features.trim()) {
        featureNames = [taskData.features.trim()];
      }
    }
  } catch {}

  if (featureNames.length === 0) {
    try {
      const specData = await parseSpecMdFromFolder(specFolderPath);
      if (specData) {
        const allSpecFeatures = [...specData.features.reads, ...writtenCapabilities];
        featureNames = Array.from(new Set(allSpecFeatures.map((s) => s.trim()).filter(Boolean)));
      }
    } catch {}
  }

  const featuresDirName = config?.paths?.features || 'features';
  for (const feature of [...new Set(featureNames)].sort()) {
    const candidateOpenSpec = path.resolve(projectRoot, featuresDirName, feature, 'spec.md');
    if (fsSync.existsSync(candidateOpenSpec)) {
      attachExistingFile(candidateOpenSpec);
      continue;
    }

    const featureFileName = feature.endsWith('.md') ? feature : `${feature}.md`;
    const legacyPath =
      featureFileName.startsWith('features/') || featureFileName.startsWith(`${featuresDirName}/`)
        ? path.resolve(projectRoot, featureFileName)
        : path.resolve(projectRoot, featuresDirName, featureFileName);
    attachExistingFile(legacyPath);
  }
  return args;
}

export const spawnTask = buildOpencodeArgs;

export interface OpencodeTokensData {
  promptTokens: number;
  candidateTokens: number;
  totalTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  cost: number;
}

export function extractOpencodeTokens(event: unknown): OpencodeTokensData | null {
  if (!event || typeof event !== 'object') {
    return null;
  }
  const eventObj = event as Record<string, unknown>;
  const part =
    typeof eventObj.part === 'object' && eventObj.part !== null
      ? (eventObj.part as Record<string, unknown>)
      : eventObj;
  const tokensObj =
    typeof part.tokens === 'object' && part.tokens !== null
      ? (part.tokens as Record<string, unknown>)
      : typeof eventObj.tokens === 'object' && eventObj.tokens !== null
        ? (eventObj.tokens as Record<string, unknown>)
        : null;

  if (!tokensObj) {
    return null;
  }

  const promptTokens =
    Number(tokensObj.input ?? tokensObj.promptTokens ?? tokensObj.prompt ?? 0) || 0;
  const candidateTokens =
    Number(tokensObj.output ?? tokensObj.candidateTokens ?? tokensObj.completionTokens ?? 0) || 0;
  const totalTokens =
    Number(tokensObj.total ?? tokensObj.totalTokens ?? promptTokens + candidateTokens) || 0;

  let cachedTokens = 0;
  if (typeof tokensObj.cache === 'number') {
    cachedTokens = tokensObj.cache;
  } else if (typeof tokensObj.cachedTokens === 'number') {
    cachedTokens = tokensObj.cachedTokens;
  } else if (typeof tokensObj.cached === 'number') {
    cachedTokens = tokensObj.cached;
  } else if (typeof tokensObj.cache === 'object' && tokensObj.cache !== null) {
    const cacheObj = tokensObj.cache as Record<string, unknown>;
    const read = Number(cacheObj.read) || 0;
    const write = Number(cacheObj.write) || 0;
    cachedTokens = read + write;
  }

  const rawCost = part.cost ?? eventObj.cost;
  const cost =
    typeof rawCost === 'number' && !Number.isNaN(rawCost) ? rawCost : Number(rawCost) || 0;

  const reasoningTokens =
    Number(tokensObj.reasoning ?? tokensObj.reasoningTokens ?? tokensObj.thinking ?? 0) || 0;

  return {
    promptTokens,
    candidateTokens,
    totalTokens,
    cachedTokens,
    reasoningTokens,
    cost,
  };
}

const TOOL_SUMMARY_MAX_LENGTH = 60;
const FILE_TOOLS = new Set(['read', 'edit', 'write', 'glob']);

export function extractToolEventSummary(toolName: string, input: unknown): string {
  const tool = (toolName || '').toLowerCase();
  const inputObj = asRecord(input);

  if (FILE_TOOLS.has(tool)) {
    return (
      firstNonEmptyString(
        inputObj?.path,
        inputObj?.file,
        inputObj?.filepath,
        inputObj?.filePath,
        inputObj?.pattern,
      ) ?? ''
    );
  }

  if (tool === 'bash') {
    const command = firstNonEmptyString(inputObj?.command, inputObj?.cmd) ?? '';
    return command.slice(0, TOOL_SUMMARY_MAX_LENGTH);
  }

  const raw = inputObj ? JSON.stringify(inputObj) : input === undefined ? '' : String(input);
  return raw.slice(0, TOOL_SUMMARY_MAX_LENGTH);
}

export function extractOpencodeToolEvent(event: unknown): ToolEventData | null {
  const eventObj = asRecord(event);
  if (!eventObj) {
    return null;
  }

  const part = asRecord(eventObj.part);
  const isToolUse =
    eventObj.type === 'tool_use' || part?.type === 'tool-use' || part?.type === 'tool_use';
  if (!isToolUse) {
    return null;
  }

  const tool = firstNonEmptyString(eventObj.tool, eventObj.name, part?.tool, part?.name);
  if (!tool) {
    return null;
  }

  const state = asRecord(part?.state);
  const input =
    eventObj.input ??
    eventObj.parameters ??
    part?.input ??
    part?.parameters ??
    state?.input ??
    state?.parameters;

  return { tool, summary: extractToolEventSummary(tool, input) };
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

export async function processOpencodeStdoutLine(
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
    // Malformed or unparseable non-JSON stdout lines do not crash the adapter process
    return;
  }

  if (!event || typeof event !== 'object') {
    return;
  }

  const eventObj = event as Record<string, unknown>;

  const toolEvent = extractOpencodeToolEvent(eventObj);
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

  if (eventObj.type === 'step_finish') {
    const tokensData = extractOpencodeTokens(eventObj);
    if (tokensData) {
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
    return;
  }

  // A completed text part is the adapter's final assistant message. Only whole
  // text parts become `text` events; step deltas are never persisted.
  if (eventObj.type === 'text') {
    const part = asRecord(eventObj.part);
    const text = firstNonEmptyString(part?.text, eventObj.text);
    if (text !== undefined) {
      await appendHarnessEvent(specFolderPath, taskNumber, {
        type: 'text',
        timestamp: resolveEventTimestamp(eventObj),
        data: { text } satisfies TextEventData,
      });
    }
    return;
  }

  // Unrecognised event types route exclusively to verbose logging so harness
  // stdout can never leak onto the terminal.
  logger?.verbose(`[opencode] Unknown event type: ${eventObj.type}`);
}

/**
 * Compatibility subclass retained for existing callers and tests; the buffering
 * and serialization logic lives entirely in the shared {@link EventStreamParser}.
 */
export class OpencodeEventStreamParser extends EventStreamParser {
  constructor(specFolderPath: string, taskNumber: string, logger?: Logger, projectRoot?: string) {
    super((line) =>
      processOpencodeStdoutLine(line, specFolderPath, taskNumber, logger, projectRoot),
    );
  }
}

export async function preflightOpencode(
  projectRoot: string,
  config?: OsqConfig,
): Promise<{ version: string; bin: string }> {
  const bin = await resolveOpencodeBinary(config);
  let result: SpawnProcessResult;
  try {
    result = await spawnWithTimeout({
      command: bin,
      args: ['--version'],
      cwd: projectRoot,
      timeoutSeconds: 10,
    });
  } catch {
    console.error(`OpenCode binary not found or failed: ${bin}`);
    process.exitCode = 1;
    process.exit(1);
    return { version: '', bin };
  }

  if (result.exitCode !== 0) {
    console.error(`OpenCode binary not found or failed: ${bin}`);
    process.exitCode = 1;
    process.exit(1);
    return { version: '', bin };
  }

  const version = (result.stdout || result.stderr).trim().split('\n')[0].trim();
  console.log(version);
  return { version, bin };
}

export class OpencodeAdapter implements HarnessAdapter {
  readonly name = 'opencode';

  async preflight(projectRoot: string, config: OsqConfig): Promise<void> {
    await preflightOpencode(projectRoot, config);
  }

  async setup(projectRoot: string, config: OsqConfig): Promise<void> {
    const agentDir = path.join(projectRoot, '.opencode', 'agent');
    await fs.mkdir(agentDir, { recursive: true });

    const agentName = config.opencode?.agent || 'osq-coder';
    const agentPath = path.join(agentDir, `${agentName}.md`);

    const exists = await fs
      .stat(agentPath)
      .then(() => true)
      .catch(() => false);

    if (!exists) {
      await fs.writeFile(agentPath, OPENCODE_AGENT_TEMPLATE, 'utf8');
    } else {
      const currentContent = await fs.readFile(agentPath, 'utf8');
      const startIndex = currentContent.indexOf(OSQ_START_MARKER);
      const endIndex = currentContent.indexOf(OSQ_END_MARKER);

      if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
        const before = currentContent.slice(0, startIndex);
        const after = currentContent.slice(endIndex + OSQ_END_MARKER.length);
        const updated = `${before}${MANAGED_AGENTS_BLOCK}${after}`;
        await fs.writeFile(agentPath, updated, 'utf8');
      } else {
        const separator = currentContent.endsWith('\n\n')
          ? ''
          : currentContent.endsWith('\n')
            ? '\n'
            : '\n\n';
        const updated = `${currentContent}${separator}${MANAGED_AGENTS_BLOCK}\n`;
        await fs.writeFile(agentPath, updated, 'utf8');
      }
    }

    const plannerAgentName = config.planner?.agent || 'osq-planner';
    const plannerAgentPath = path.join(agentDir, `${plannerAgentName}.md`);
    const plannerExists = await fs
      .stat(plannerAgentPath)
      .then(() => true)
      .catch(() => false);

    if (!plannerExists) {
      await fs.writeFile(plannerAgentPath, OPENCODE_PLANNER_AGENT_TEMPLATE, 'utf8');
    }
  }

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    const { projectRoot, specFolderPath, taskNumber, timeoutSeconds = 1800, config } = options;

    const args = await buildOpencodeArgs(options);
    const bin = await resolveOpencodeBinary(config);
    const streamParser = new EventStreamParser((line) =>
      processOpencodeStdoutLine(line, specFolderPath, taskNumber, options.logger, projectRoot),
    );

    const result = await spawnWithTimeout({
      command: bin,
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
    const bin = await resolveOpencodeBinary(config);

    const args: string[] = [prompt, '--dir', cwd];
    if (model) {
      args.push('--model', model);
    }
    if (agent) {
      args.push('--agent', agent);
    }
    if (config?.opencode?.variant) {
      args.push('--variant', config.opencode.variant);
    }

    const child = spawn(bin, args, {
      cwd,
      env: process.env,
      stdio: 'inherit',
    });

    return new Promise<number>((resolve) => {
      child.on('error', () => resolve(1));
      child.on('close', (code) => resolve(code ?? 1));
    });
  }

  async readInteractiveUsage(options: ReadInteractiveUsageOptions): Promise<InteractiveUsage> {
    const config = await loadConfig(options.cwd).catch(() => undefined);
    const bin = await resolveOpencodeBinary(config);
    return await readOpencodeInteractiveUsage(options, bin);
  }
}
