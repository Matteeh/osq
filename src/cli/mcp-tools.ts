/**
 * The MCP planning tools. The command tools run the CLI's own command
 * functions, locally or on a server, and return the text `runCli` would print.
 * The file tools work inside one unapproved change folder through
 * `mcp-files.ts`.
 */
import type { ForwardedCommand, ForwardedEnd, ForwardedOutput } from '../core/web/web-remote.js';
import { CommandError } from './command-error.js';
import {
  type McpFolderSource,
  deleteFile,
  editFile,
  listFiles,
  readFile,
  writeFile,
} from './mcp-files.js';
import type { McpTool, McpToolResult } from './mcp-protocol.js';
import { createForwardedRunner } from './remote-commands.js';
import { lintOnServer, planOnServer, remoteWorkRoot } from './remote-plan.js';
import { type RemoteServer, runOnServer } from './remote-transport.js';
import type { Slice } from './slice-types.js';
import { SLICES } from './slices.js';

/** Where the tools run: the project, or a server and its home root. */
export type McpTarget =
  | { readonly kind: 'local'; readonly cwd: string }
  | { readonly kind: 'remote'; readonly server: RemoteServer; readonly home?: string };

/** One forwarded command's runner: the request, and the sink for its output. */
type ForwardedRun = (
  request: ForwardedCommand,
  emit: (output: ForwardedOutput) => void,
) => Promise<ForwardedEnd>;

/** A JSON Schema object for the named string arguments, required ones checked. */
function inputSchema(
  names: readonly string[],
  required: readonly string[],
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const name of names) properties[name] = { type: 'string' };
  return { type: 'object', properties, required: [...required], additionalProperties: false };
}

/** The value at `name`, or null when the argument is missing. */
function argOrNull(args: Record<string, unknown>, name: string): unknown {
  const value = args[name];
  return value === undefined ? null : value;
}

/** A forwarder reading the named arguments in order, a missing one as null. */
function take(...names: readonly string[]): (args: Record<string, unknown>) => readonly unknown[] {
  return (args) => names.map((name) => argOrNull(args, name));
}

/** Turn a thrown `CommandError` into its forwarded end; rethrow anything else. */
function endOf(error: unknown): ForwardedEnd {
  if (error instanceof CommandError) {
    return {
      exitCode: error.exitCode,
      error: error.message === '' ? null : error.message,
      next: error.next ?? null,
    };
  }
  throw error;
}

/**
 * Run one command and render its text the way `runCli` prints it: every chunk
 * in arrival order, then on failure its error and `Next: <next>` lines.
 */
async function runForwarded(run: ForwardedRun, request: ForwardedCommand): Promise<McpToolResult> {
  const chunks: string[] = [];
  const emit = (output: ForwardedOutput): void => {
    chunks.push(output.text);
  };
  let end: ForwardedEnd;
  try {
    end = await run(request, emit);
  } catch (error) {
    end = endOf(error);
  }
  const isError = end.exitCode !== 0;
  let text = chunks.join('');
  if (isError) {
    if (end.error) text += `${end.error}\n`;
    if (end.next) text += `Next: ${end.next}\n`;
  }
  return { text, isError };
}

/** The runner for one command in a target: the local runner or the server's. */
function runnerFor(target: McpTarget, command: string): ForwardedRun {
  if (target.kind === 'local') return createForwardedRunner(target.cwd);
  const { server, home } = target;
  const onServer = command === 'plan' ? planOnServer : command === 'lint' ? lintOnServer : null;
  if (onServer !== null) {
    return async (request, emit) => {
      await onServer(server, request, {
        stdout: (text) => emit({ stream: 'stdout', text }),
        stderr: (text) => emit({ stream: 'stderr', text }),
        home,
      });
      return { exitCode: 0, error: null, next: null };
    };
  }
  return (request, emit) =>
    runOnServer(
      server,
      request,
      (text) => emit({ stream: 'stdout', text }),
      (text) => emit({ stream: 'stderr', text }),
    );
}

/** One command tool's name, description, arguments and argument mapper. */
interface CommandSpec {
  readonly name: string;
  readonly description: string;
  readonly args: readonly string[];
  readonly required: readonly string[];
  readonly forward: (args: Record<string, unknown>) => readonly unknown[];
}

/** Build one command tool from its spec and runner. */
function commandTool(spec: CommandSpec, run: ForwardedRun): McpTool {
  return {
    name: spec.name,
    description: spec.description,
    inputSchema: inputSchema(spec.args, spec.required),
    run: (args) =>
      runForwarded(run, {
        command: spec.name,
        args: spec.forward(args),
        options: {},
      }),
  };
}

/** Build one file tool from its argument names and the file function it calls. */
function fileTool(
  name: string,
  description: string,
  args: readonly string[],
  call: (source: McpFolderSource, args: Record<string, unknown>) => Promise<McpToolResult>,
  source: McpFolderSource,
): McpTool {
  return {
    name,
    description,
    inputSchema: inputSchema(args, args),
    run: (value) => call(source, value),
  };
}

/**
 * The nine planning tools, in order. Locally the command tools run through
 * `createForwardedRunner`; against a server `plan` replaces the working copy,
 * `lint` uploads it first, and `spec` and `query` forward as they are.
 */
function planningTools(target: McpTarget): McpTool[] {
  const source: McpFolderSource =
    target.kind === 'local'
      ? { kind: 'local', cwd: target.cwd }
      : { kind: 'remote', workRoot: remoteWorkRoot(target.server, target.home) };
  const command = (spec: CommandSpec): McpTool => commandTool(spec, runnerFor(target, spec.name));
  const file = (
    name: string,
    description: string,
    args: readonly string[],
    call: (source: McpFolderSource, args: Record<string, unknown>) => Promise<McpToolResult>,
  ): McpTool => fileTool(name, description, args, call, source);
  return [
    command({
      name: 'plan',
      description: 'Prepare a change and hand off to your planning tool',
      args: ['change'],
      required: ['change'],
      forward: take('change'),
    }),
    file('list_files', 'List every file in a change folder', ['change'], listFiles),
    file('read_file', 'Read one file in a change folder', ['change', 'path'], readFile),
    file('write_file', 'Write one file in a change folder', ['change', 'path', 'text'], writeFile),
    file(
      'edit_file',
      'Replace one exact occurrence in a change folder file',
      ['change', 'path', 'old_text', 'new_text'],
      editFile,
    ),
    file('delete_file', 'Delete one file from a change folder', ['change', 'path'], deleteFile),
    command({
      name: 'spec',
      description: 'List living capabilities and requirements, or print one requirement',
      args: ['capability', 'requirement'],
      required: [],
      forward: take('capability', 'requirement'),
    }),
    command({
      name: 'query',
      description: 'Run one read-only SELECT over the osq history tables',
      args: ['select'],
      required: [],
      forward: take('select'),
    }),
    command({
      name: 'lint',
      description: 'Lint one change folder',
      args: ['change'],
      required: ['change'],
      forward: take('change'),
    }),
  ];
}

/**
 * The nine planning tools, then every slice's own tools in registry order. A
 * slice tool whose name an earlier tool already has throws.
 *
 * @scenario cli-foundation: Tools give the CLI's text
 * @scenario cli-foundation: Plan prepares the prompt
 * @scenario cli-foundation: Planning against a server
 * @scenario cli-foundation: No tap tools
 * @scenario cli-foundation: Slice tools follow the planning tools
 * @adr 014
 * @adr 015
 * @adr 016
 */
export function createMcpTools(target: McpTarget, slices: readonly Slice[] = SLICES): McpTool[] {
  const tools = planningTools(target);
  const names = new Set(tools.map((tool) => tool.name));
  for (const slice of slices) {
    for (const tool of slice.tools?.(target) ?? []) {
      if (names.has(tool.name)) {
        throw new Error(`slice ${slice.name}: tool ${tool.name} is already defined`);
      }
      names.add(tool.name);
      tools.push(tool);
    }
  }
  return tools;
}
