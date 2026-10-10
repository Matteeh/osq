/**
 * The MCP wire protocol: one parsed JSON-RPC 2.0 message in, one answer out.
 * No MCP SDK, no I/O. The caller owns the stdio loop and writes the answer.
 */

/** What a tool call resolves. */
export interface McpToolResult {
  readonly text: string;
  readonly isError: boolean;
}

/** One tool the server offers. */
export interface McpTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly run: (args: Record<string, unknown>) => McpToolResult | Promise<McpToolResult>;
}

/** The server identity and instructions the handshake reports. */
export interface McpServerInfo {
  readonly name: string;
  readonly version: string;
  readonly instructions: string;
}

/** One answer: a response object, or null when no answer is due. */
export type McpAnswer = Record<string, unknown> | null;

/** The modern protocol revision and the legacy ones it replaced. */
const MODERN = '2026-07-28';
const LEGACY = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SUPPORTED = [MODERN, ...LEGACY];
const LATEST_LEGACY = LEGACY[0] as string;

/** The `_meta` keys the modern revision reserves. */
const VERSION_KEY = 'io.modelcontextprotocol/protocolVersion';
const CAPABILITIES_KEY = 'io.modelcontextprotocol/clientCapabilities';
const SERVER_INFO_KEY = 'io.modelcontextprotocol/serverInfo';

/** A JSON-RPC message read loosely. */
type Message = Record<string, unknown>;

/** A JSON-RPC error object. */
interface McpError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

/** One method outcome: its result, or the error to report. */
type Outcome = { readonly result: unknown } | { readonly error: McpError };

/** The immutable facts one handler answers from. */
interface Context {
  readonly tools: readonly McpTool[];
  readonly info: McpServerInfo;
  readonly listed: readonly Record<string, unknown>[];
}

/** A non-null, non-array object, or null. */
function objectOf(value: unknown): Message | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Message;
}

/** One JSON-RPC success response. */
function response(id: unknown, result: unknown): McpAnswer {
  return { jsonrpc: '2.0', id, result };
}

/** One JSON-RPC error response. */
function failure(id: unknown, error: McpError): McpAnswer {
  return { jsonrpc: '2.0', id, error };
}

/** The error for an unsupported modern protocol version. */
function unsupportedVersion(requested: unknown): McpError {
  return {
    code: -32022,
    message: 'Unsupported protocol version',
    data: { supported: SUPPORTED, requested },
  };
}

/** The error to report when a modern `_meta` block is malformed, or null. */
function checkModern(meta: Message): McpError | null {
  const requested = meta[VERSION_KEY];
  if (requested !== MODERN) return unsupportedVersion(requested);
  if (!(CAPABILITIES_KEY in meta)) return { code: -32602, message: 'Invalid params' };
  return null;
}

/** Add the modern `resultType` and `_meta` to a result. */
function modernize(context: Context, result: unknown): unknown {
  return {
    resultType: 'complete',
    ...(objectOf(result) ?? {}),
    _meta: { [SERVER_INFO_KEY]: { name: context.info.name, version: context.info.version } },
  };
}

/** The `initialize` result: the requested legacy version or the latest. */
function initialize(info: McpServerInfo, params: Message | null): unknown {
  const requested = params === null ? undefined : params.protocolVersion;
  const version =
    typeof requested === 'string' && LEGACY.includes(requested) ? requested : LATEST_LEGACY;
  return {
    protocolVersion: version,
    capabilities: { tools: {} },
    serverInfo: { name: info.name, version: info.version },
    instructions: info.instructions,
  };
}

/** The `server/discover` result, before the modern decoration. */
function discover(info: McpServerInfo): unknown {
  return {
    supportedVersions: SUPPORTED,
    capabilities: { tools: {} },
    instructions: info.instructions,
  };
}

/** Run one tool, turning a throw into the protocol's error result. */
async function runTool(tool: McpTool, args: Message): Promise<McpToolResult> {
  try {
    return await tool.run(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { text: `Error: ${message}\n`, isError: true };
  }
}

/** The `tools/call` outcome: the named tool's result, or an unknown-tool error. */
async function callTool(context: Context, params: Message | null): Promise<Outcome> {
  const name = params === null ? undefined : params.name;
  const tool =
    typeof name === 'string'
      ? context.tools.find((candidate) => candidate.name === name)
      : undefined;
  if (tool === undefined) {
    return { error: { code: -32602, message: `Unknown tool: ${String(name)}` } };
  }
  const args = objectOf(params?.arguments) ?? {};
  const result = await runTool(tool, args);
  return {
    result: { content: [{ type: 'text', text: result.text }], isError: result.isError },
  };
}

/** Dispatch one method to its outcome. */
async function dispatch(
  context: Context,
  method: string,
  params: Message | null,
): Promise<Outcome> {
  switch (method) {
    case 'initialize':
      return { result: initialize(context.info, params) };
    case 'ping':
      return { result: {} };
    case 'tools/list':
      return { result: { tools: context.listed } };
    case 'server/discover':
      return { result: discover(context.info) };
    case 'tools/call':
      return await callTool(context, params);
    default:
      return { error: { code: -32601, message: `Method not found: ${method}` } };
  }
}

/** Answer one parsed message, or null when it owes none. */
async function answer(context: Context, message: unknown): Promise<McpAnswer> {
  const request = objectOf(message);
  if (request === null) return null;
  const method = request.method;
  if (typeof method !== 'string') return null;
  if (request.id === undefined) return null;

  const params = objectOf(request.params);
  const meta = params === null ? null : objectOf(params._meta);
  const modern = meta !== null && VERSION_KEY in meta;
  if (modern) {
    const error = checkModern(meta);
    if (error !== null) return failure(request.id, error);
  }
  const outcome = await dispatch(context, method, params);
  if ('error' in outcome) return failure(request.id, outcome.error);
  return response(request.id, modern ? modernize(context, outcome.result) : outcome.result);
}

/**
 * Build the handler for one parsed MCP message. It serves both protocol eras,
 * answers a notification or a message without a method with null, and never
 * rejects.
 *
 * @scenario cli-foundation: Requests and answers
 * @scenario cli-foundation: A throwing tool
 * @adr 014
 */
export function createMcpHandler(
  tools: readonly McpTool[],
  info: McpServerInfo,
): (message: unknown) => Promise<McpAnswer> {
  const context: Context = {
    tools,
    info,
    listed: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
  return async (message) => {
    try {
      return await answer(context, message);
    } catch {
      return null;
    }
  };
}
