import type { IncomingMessage, ServerResponse } from 'node:http';
import type { OsqConfig } from '../foundation/config.js';
import { decodeChangeSelector, sendJson } from './web-http.js';
import { type FilesOutcome, readChangeFiles, replaceChangeFiles } from './web-remote-files.js';
import type { WebServerSite } from './web-site.js';
import {
  type WriteGate,
  createActionToken,
  createWriteGate,
  isHostAllowed,
  isJsonMediaType,
  isOriginAllowed,
  readRequestBody,
  tokenMatches,
} from './web-write.js';

/** One command a client forwards: the name, positional args, and parsed options. */
export interface ForwardedCommand {
  readonly command: string;
  readonly args: readonly unknown[];
  readonly options: Readonly<Record<string, unknown>>;
}

/** One piece of output, written as one NDJSON line. */
export interface ForwardedOutput {
  readonly stream: 'stdout' | 'stderr';
  readonly text: string;
}

/** The last NDJSON line of a forwarded command. */
export interface ForwardedEnd {
  readonly exitCode: number;
  readonly error: string | null;
  readonly next: string | null;
}

/** Runs one forwarded command; supplied by the server worker so core never imports `src/cli/`. */
export type ForwardedCommandRunner = (
  request: ForwardedCommand,
  emit: (output: ForwardedOutput) => void,
) => Promise<ForwardedEnd>;

export interface RemoteRouteOptions {
  readonly projectRoot: string;
  readonly config: OsqConfig;
  /** Resolves the actual bound port; the allowed hosts use it. */
  readonly getPort: () => number;
}

export interface RemoteRoutes {
  readonly token: string;
  matches(pathname: string): boolean;
  handle(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    method: string,
  ): Promise<void>;
}

type Context = RemoteRouteOptions & {
  readonly runCommand: ForwardedCommandRunner;
  readonly token: string;
  readonly uploads: WriteGate;
};

const COMMANDS_PATH = '/api/commands';
const FILES_PREFIX = '/api/files/';
const FILES_BODY_ERROR = 'body must be {"files": {"<path>": "<text>"}}';

/** Judge a read or write request against the allowed host, origin and token. */
function requestAllowed(req: IncomingMessage, context: Context, write: boolean): boolean {
  const port = context.getPort();
  const hosts = context.config.serve?.allowedHosts ?? [];
  const origin = req.headers.origin;
  if (!isHostAllowed(req.headers.host, port, hosts)) return false;
  if (!write) return origin === undefined || isOriginAllowed(origin, port, hosts);
  return (
    isOriginAllowed(origin, port, hosts) &&
    isJsonMediaType(req.headers['content-type']) &&
    tokenMatches(req.headers['x-osq-token'], context.token)
  );
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The body as a JSON object, or null when it is invalid or not an object. */
function parseBody(rawBody: string): Record<string, unknown> | null {
  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

type ParsedCommand =
  | { readonly ok: true; readonly request: ForwardedCommand }
  | { readonly ok: false; readonly error: string };

function parseCommand(rawBody: string): ParsedCommand {
  const record = parseBody(rawBody);
  if (record === null) return { ok: false, error: 'body must be a JSON object' };
  if (typeof record.command !== 'string') return { ok: false, error: 'command must be a string' };
  if (!Array.isArray(record.args)) return { ok: false, error: 'args must be an array' };
  const options = record.options;
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    return { ok: false, error: 'options must be an object' };
  }
  return {
    ok: true,
    request: {
      command: record.command,
      args: record.args,
      options: options as Record<string, unknown>,
    },
  };
}

type ParsedFiles =
  | { readonly ok: true; readonly files: Record<string, string> }
  | { readonly ok: false };

function parseFiles(rawBody: string): ParsedFiles {
  const files = parseBody(rawBody)?.files;
  if (files === null || typeof files !== 'object' || Array.isArray(files)) return { ok: false };
  const record = files as Record<string, unknown>;
  if (Object.values(record).some((text) => typeof text !== 'string')) return { ok: false };
  return { ok: true, files: record as Record<string, string> };
}

function sendOutcome<T>(res: ServerResponse, outcome: FilesOutcome<T>, head: boolean): void {
  if (!outcome.ok) sendJson(res, outcome.failure.status, { error: outcome.failure.error }, head);
  else sendJson(res, 200, outcome.value, head);
}

async function handleCommand(
  req: IncomingMessage,
  res: ServerResponse,
  context: Context,
  method: string,
): Promise<void> {
  if (method === 'GET' || method === 'HEAD') {
    const head = method === 'HEAD';
    if (!requestAllowed(req, context, false)) {
      return sendJson(res, 403, { error: 'request refused' }, head);
    }
    return sendJson(res, 200, { token: context.token }, head);
  }
  if (method !== 'POST') {
    return sendJson(res, 405, { error: 'method not allowed' }, false, { Allow: 'GET, HEAD, POST' });
  }
  if (!requestAllowed(req, context, true)) {
    return sendJson(res, 403, { error: 'write request refused' }, false);
  }
  const parsed = parseCommand(await readRequestBody(req));
  if (!parsed.ok) return sendJson(res, 400, { error: parsed.error }, false);
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' });
  const emit = (output: ForwardedOutput): void => {
    res.write(`${JSON.stringify({ stream: output.stream, text: output.text })}\n`);
  };
  let end: ForwardedEnd;
  try {
    end = await context.runCommand(parsed.request, emit);
  } catch (error) {
    end = { exitCode: 1, error: `Error: ${reason(error)}`, next: null };
  }
  res.write(`${JSON.stringify({ exitCode: end.exitCode, error: end.error, next: end.next })}\n`);
  res.end();
}

async function handleFiles(
  req: IncomingMessage,
  res: ServerResponse,
  context: Context,
  pathname: string,
  method: string,
): Promise<void> {
  const selector = decodeChangeSelector(pathname.slice(FILES_PREFIX.length));
  if (selector === null) return sendJson(res, 400, { error: 'unsafe change selector' }, false);
  if (method === 'GET' || method === 'HEAD') {
    const head = method === 'HEAD';
    if (!requestAllowed(req, context, false)) {
      return sendJson(res, 403, { error: 'request refused' }, head);
    }
    const outcome = await readChangeFiles(context.projectRoot, context.config, selector);
    return sendOutcome(res, outcome, head);
  }
  if (method !== 'PUT') {
    return sendJson(res, 405, { error: 'method not allowed' }, false, { Allow: 'GET, HEAD, PUT' });
  }
  if (!requestAllowed(req, context, true)) {
    return sendJson(res, 403, { error: 'write request refused' }, false);
  }
  if (!context.uploads.tryBegin()) {
    return sendJson(res, 409, { error: 'another upload is running' }, false);
  }
  try {
    const parsed = parseFiles(await readRequestBody(req));
    if (!parsed.ok) return sendJson(res, 400, { error: FILES_BODY_ERROR }, false);
    const outcome = await replaceChangeFiles(
      context.projectRoot,
      context.config,
      selector,
      parsed.files,
    );
    sendOutcome(res, outcome, false);
  } finally {
    context.uploads.end();
  }
}

/**
 * Build the server's forwarded-command and change-file endpoints, or null when
 * the server has no site or no runner.
 * @scenario web-inspection: Forwarded command streams its output
 * @scenario web-inspection: Command without proof
 * @scenario web-inspection: Bad command body
 * @scenario web-inspection: Command token
 * @scenario web-inspection: No runner, no command paths
 * @adr 013
 */
export function createRemoteRoutes(
  site: WebServerSite | undefined,
  runCommand: ForwardedCommandRunner | undefined,
  options: RemoteRouteOptions,
): RemoteRoutes | null {
  if (site === undefined || runCommand === undefined) return null;
  const context: Context = {
    ...options,
    runCommand,
    token: createActionToken(),
    uploads: createWriteGate(),
  };
  return {
    token: context.token,
    matches: (pathname) => pathname === COMMANDS_PATH || pathname.startsWith(FILES_PREFIX),
    handle: async (req, res, pathname, method) => {
      if (pathname === COMMANDS_PATH) return await handleCommand(req, res, context, method);
      return await handleFiles(req, res, context, pathname, method);
    },
  };
}
