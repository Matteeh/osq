/**
 * `osq mcp`: serve the planning tools to an MCP client over stdio. One
 * JSON-RPC message per line in; one answer per line out, and nothing else on
 * stdout. `tools/call` requests run one at a time in arrival order; every
 * other request is answered at once.
 */
import path from 'node:path';
import type { Command } from 'commander';
import { processStdout } from './command-inputs.js';
import { type McpAnswer, createMcpHandler } from './mcp-protocol.js';
import { type McpTarget, createMcpTools } from './mcp-tools.js';
import { readServerSetting } from './remote-transport.js';

/** The instructions the handshake reports to the client. */
const INSTRUCTIONS = [
  'Run the plan tool for the change you were asked to plan, read the',
  'plan-prompt.md it names and follow it, write only inside that change',
  'folder, and run lint until it passes.',
  'Leave approval to a human.',
].join(' ');

/** The answer to a line that is not JSON. */
const PARSE_ERROR: McpAnswer = {
  jsonrpc: '2.0',
  id: null,
  error: { code: -32700, message: 'Parse error' },
};

/** Whether a parsed message is a `tools/call` request. */
function isToolCall(message: unknown): boolean {
  if (message === null || typeof message !== 'object' || Array.isArray(message)) return false;
  return (message as { method?: unknown }).method === 'tools/call';
}

/** The target for the current environment: a server when set, else the folder. */
function targetFor(cwd: string): McpTarget {
  const server = readServerSetting(process.env);
  return server === null ? { kind: 'local', cwd } : { kind: 'remote', server };
}

/**
 * Serve one MCP session until stdin ends: answer every request, chain each
 * `tools/call` onto the one before it, then resolve once every answer is
 * written.
 */
async function serveSession(handle: (message: unknown) => Promise<McpAnswer>): Promise<void> {
  const write = (answer: McpAnswer): void => {
    if (answer !== null) processStdout(`${JSON.stringify(answer)}\n`);
  };
  const answerOne = async (message: unknown): Promise<void> => {
    write(await handle(message));
  };
  let tail: Promise<void> = Promise.resolve();
  const pending: Array<Promise<void>> = [];
  const enqueue = (message: unknown): void => {
    const run = (): Promise<void> => answerOne(message);
    const next = tail.then(run);
    tail = next.then(
      () => undefined,
      () => undefined,
    );
    pending.push(next);
  };
  const onLine = (line: string): void => {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      write(PARSE_ERROR);
      return;
    }
    if (isToolCall(message)) enqueue(message);
    else pending.push(answerOne(message));
  };
  await readLines(onLine);
  await Promise.all(pending);
}

/**
 * Read stdin line by line until it ends, calling `onLine` for each line. A
 * final line without a trailing newline is delivered too.
 */
async function readLines(onLine: (line: string) => void): Promise<void> {
  process.stdin.setEncoding('utf8');
  let buffer = '';
  await new Promise<void>((resolve) => {
    process.stdin.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) onLine(line);
    });
    process.stdin.on('end', () => {
      if (buffer.length > 0) onLine(buffer);
      resolve();
    });
  });
}

/** Options the `mcp` command accepts. */
interface McpCommandOptions {
  readonly cwd?: string;
}

/**
 * Register `osq mcp`.
 * @scenario cli-foundation: A planning session over stdio
 * @scenario cli-foundation: Not JSON
 * @adr 014
 */
export function registerMcpCommand(program: Command): void {
  const version = program.version() ?? '0.0.0';
  program
    .command('mcp')
    .description('serve the planning tools to an MCP client over stdio')
    .option('--cwd <dir>', 'the project folder; defaults to the process folder')
    .action(async (options: McpCommandOptions) => {
      const cwd = path.resolve(options.cwd ?? process.cwd());
      const handle = createMcpHandler(createMcpTools(targetFor(cwd)), {
        name: 'osq',
        version,
        instructions: INSTRUCTIONS,
      });
      await serveSession(handle);
    });
}
