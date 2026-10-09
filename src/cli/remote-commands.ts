import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../core/foundation/config.js';
import { changeTrees, findChange } from '../core/status/change-locations.js';
import type {
  ForwardedCommand,
  ForwardedCommandRunner,
  ForwardedEnd,
  ForwardedOutput,
} from '../core/web/web-remote.js';
import { type ApproveCommandOptions, approveCommand } from './approve.js';
import { CommandError } from './command-error.js';
import type { Writer } from './command-inputs.js';
import { type DigestCommandOptions, digestCommand } from './digest.js';
import { type GraphCommandOptions, graphCommand } from './graph.js';
import { type InboxCommandOptions, inboxCommand } from './inbox.js';
import { type LandCommandOptions, landCommand } from './land.js';
import { type LintCommandOptions, lintCommand } from './lint.js';
import { type MessageCommandOptions, messageCommand } from './message.js';
import { newCommand } from './new.js';
import { type PlanCommandOptions, planCommand } from './plan.js';
import { type QueryCommandOptions, queryCommand } from './query.js';
import { type QueueCommandOptions, queueCommand } from './queue.js';
import { rejectCommand } from './reject.js';
import { type ReportCommandOptions, reportCommand } from './report.js';
import { retryCommand } from './retry.js';
import { type ShowCommandOptions, showCommand } from './show.js';
import { specCommand } from './spec.js';
import { type StatusCommandOptions, statusCommand } from './status.js';
import { type SyncCommandOptions, syncCommand } from './sync.js';

/** Where a forwarded command runs and the home its writers may read. */
export interface ForwardedContext {
  readonly cwd: string;
  readonly home?: string;
}

/** One entry of the server's command table. */
export type ForwardedHandler = (
  request: ForwardedCommand,
  emit: (output: ForwardedOutput) => void,
  context: ForwardedContext,
) => Promise<void>;

/** The command table the server runs, keyed by the forwarded command's name. */
export type ForwardedCommands = Readonly<Record<string, ForwardedHandler>>;

/** The commands that run one at a time, in the order they arrive. */
const SERIAL = new Set(['approve', 'land', 'reject', 'retry', 'sync', 'new', 'plan', 'lint']);

/** The writers and cwd a command function receives. */
type Inputs = { readonly cwd: string; readonly stdout: Writer; readonly stderr: Writer };

/** A command function adapter: the request, its inputs, and the home root. */
type Call = (
  request: ForwardedCommand,
  inputs: Inputs,
  home: string | undefined,
) => Promise<unknown>;

/** The stdout and stderr writers that emit one NDJSON line per chunk. */
function streamWriters(emit: (output: ForwardedOutput) => void): {
  stdout: Writer;
  stderr: Writer;
} {
  return {
    stdout: (text) => emit({ stream: 'stdout', text }),
    stderr: (text) => emit({ stream: 'stderr', text }),
  };
}

/** The positional argument at `index`, or undefined when it is missing. */
function argOf(request: ForwardedCommand, index: number): string | undefined {
  const value = request.args[index];
  return typeof value === 'string' ? value : undefined;
}

/** Every positional argument as a string, with a missing one as the empty string. */
function argsOf(request: ForwardedCommand): string[] {
  return request.args.map((value) => (typeof value === 'string' ? value : ''));
}

/** Whether a plan names an active change in the project's own tree with a brief. */
async function planReady(cwd: string, name: string | undefined): Promise<boolean> {
  const config = await loadConfig(cwd);
  const [own] = await changeTrees(cwd, config);
  try {
    const found = await findChange(cwd, config, name ?? '');
    if (found.tree.root !== own.root) return false;
    await fs.stat(path.join(found.folderPath, 'brief.md'));
    return true;
  } catch {
    return false;
  }
}

/** A forwarded plan, refused before `planCommand` unless the server holds a brief. */
async function planCall(request: ForwardedCommand, inputs: Inputs): Promise<void> {
  const name = argOf(request, 0);
  if (request.options.next !== true && !(await planReady(inputs.cwd, name))) {
    throw new CommandError(
      `osq plan ${name ?? ''} on a server needs an unapproved change with a brief; queue the brief and run osq plan --next`,
    );
  }
  try {
    await planCommand(name, { ...(request.options as PlanCommandOptions), ...inputs });
  } catch (error) {
    if (error instanceof CommandError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new CommandError(`Error: ${message}`);
  }
}

/** Wrap each adapter so it receives the emitted writers and the context's home. */
function table(calls: Readonly<Record<string, Call>>): ForwardedCommands {
  const commands: Record<string, ForwardedHandler> = {};
  for (const [name, call] of Object.entries(calls)) {
    commands[name] = async (request, emit, context) => {
      const { stdout, stderr } = streamWriters(emit);
      await call(request, { cwd: context.cwd, stdout, stderr }, context.home);
    };
  }
  return commands;
}

/** The read-only commands, each calling the function the CLI action calls. */
function readCommands(): ForwardedCommands {
  return table({
    osq: (r, i, home) => inboxCommand({ ...(r.options as InboxCommandOptions), ...i, home }),
    status: (r, i, home) => statusCommand({ ...(r.options as StatusCommandOptions), ...i, home }),
    report: (r, i, home) => reportCommand({ ...(r.options as ReportCommandOptions), ...i, home }),
    show: (r, i) => showCommand(argOf(r, 0) ?? '', { ...(r.options as ShowCommandOptions), ...i }),
    query: (r, i) =>
      queryCommand({ ...(r.options as QueryCommandOptions), ...i, select: argOf(r, 0) }),
    spec: (r, i) => specCommand(argOf(r, 0), argOf(r, 1), i),
    digest: (r, i) =>
      digestCommand({ ...(r.options as Omit<DigestCommandOptions, 'ids'>), ...i, ids: argsOf(r) }),
    graph: (r, i) => graphCommand({ ...(r.options as GraphCommandOptions), ...i }),
    queue: (r, i) => queueCommand({ ...(r.options as QueueCommandOptions), ...i }),
    message: (r, i) =>
      messageCommand(argOf(r, 0) ?? '', { ...(r.options as MessageCommandOptions), ...i }),
  });
}

/** The write commands, each calling the function the CLI action calls. */
function writeCommands(land: typeof landCommand): ForwardedCommands {
  return table({
    approve: (r, i) =>
      approveCommand(argsOf(r), {
        ...(r.options as ApproveCommandOptions),
        ...i,
        isTerminal: () => false,
      }),
    land: (r, i) =>
      land(argOf(r, 0) ?? '', { ...(r.options as LandCommandOptions), ...i, publish: true }),
    reject: (r, i) =>
      rejectCommand(argOf(r, 0) ?? '', {
        ...i,
        reason: typeof r.options.reason === 'string' ? r.options.reason : '',
      }),
    retry: (r, i) => retryCommand(argOf(r, 0) ?? '', argOf(r, 1) ?? '', i),
    sync: (r, i) => syncCommand(argOf(r, 0) ?? '', { ...(r.options as SyncCommandOptions), ...i }),
    new: (r, i) => newCommand(argOf(r, 0) ?? '', i),
    lint: (r, i) => lintCommand(argsOf(r), { ...(r.options as LintCommandOptions), ...i }),
    plan: planCall,
  });
}

/**
 * The command table the server runs: the read commands plus the write commands,
 * each calling the command function its CLI action calls.
 * @scenario cli-foundation: Same output as local
 * @scenario cli-foundation: Forwarded land publishes
 * @scenario cli-foundation: Plan without a brief refused
 * @adr 014
 */
export function createForwardedCommands(land: typeof landCommand = landCommand): ForwardedCommands {
  return { ...readCommands(), ...writeCommands(land) };
}

/** Turn a thrown value into the runner's last line. */
function failureEnd(error: unknown): ForwardedEnd {
  if (error instanceof CommandError) {
    return {
      exitCode: error.exitCode,
      error: error.message === '' ? null : error.message,
      next: error.next ?? null,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { exitCode: 1, error: `Error: ${message}`, next: null };
}

/** Options for `createForwardedRunner`. */
export interface ForwardedRunnerOptions {
  /** The home root `osq`, `status` and `report` read; defaults to the process home. */
  readonly home?: string;
  /** The command table; defaults to `createForwardedCommands()`. */
  readonly commands?: ForwardedCommands;
}

/**
 * Build the server worker's forwarded-command runner. Write commands run one at
 * a time in the order they arrive through a promise chain; every other command
 * starts at once. The runner never rejects, sets `process.exitCode`, or writes
 * to a process stream.
 * @scenario cli-foundation: Forwarded failure keeps its exit code and next step
 * @scenario cli-foundation: Writes run one at a time
 * @scenario cli-foundation: Same output as local
 * @adr 014
 */
export function createForwardedRunner(
  cwd: string,
  options: ForwardedRunnerOptions = {},
): ForwardedCommandRunner {
  const commands = options.commands ?? createForwardedCommands();
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = (task: () => Promise<void>): Promise<void> => {
    const run = queue.then(task);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
  return async (request, emit) => {
    const handler = commands[request.command];
    if (handler === undefined) {
      return { exitCode: 1, error: `osq ${request.command} does not run on a server`, next: null };
    }
    const context: ForwardedContext = { cwd, home: options.home };
    try {
      const task = (): Promise<void> => handler(request, emit, context);
      if (SERIAL.has(request.command)) await serialize(task);
      else await task();
      return { exitCode: 0, error: null, next: null };
    } catch (error) {
      return failureEnd(error);
    }
  };
}
