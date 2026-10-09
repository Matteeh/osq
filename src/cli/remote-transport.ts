import type { ForwardedCommand, ForwardedEnd } from '../core/web/web-remote.js';
import { CommandError } from './command-error.js';
import type { Writer } from './command-inputs.js';

/** The server `OSQ_SERVER` names. */
export interface RemoteServer {
  /** `<origin>/p/<project>/`. */
  readonly base: string;
  /** The URL's host with its port, such as `127.0.0.1:4174`. */
  readonly host: string;
  readonly project: string;
}

/** A project URL path: `/p/<project>` with an optional trailing slash. */
const SERVER_PATH = /^\/p\/([A-Za-z0-9][A-Za-z0-9._-]*)\/?$/;

function invalidServer(value: string): CommandError {
  return new CommandError(`OSQ_SERVER must look like https://<host>/p/<project>/: ${value}`);
}

/**
 * The server `OSQ_SERVER` names, or null when it is unset, empty or blank.
 * @scenario cli-foundation: Server values
 * @adr 014
 */
export function readServerSetting(env: NodeJS.ProcessEnv = process.env): RemoteServer | null {
  const value = env.OSQ_SERVER;
  if (value === undefined || value.trim() === '') return null;
  const trimmed = value.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw invalidServer(value);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw invalidServer(value);
  if (url.username !== '' || url.password !== '') throw invalidServer(value);
  if (url.search !== '' || url.hash !== '') throw invalidServer(value);
  const match = SERVER_PATH.exec(url.pathname);
  if (match === null) throw invalidServer(value);
  const project = match[1] as string;
  return { base: `${url.origin}/p/${project}/`, host: url.host, project };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The transport error for a request that failed before a response. */
function unreachable(server: RemoteServer, error: unknown): CommandError {
  const cause = (error as { cause?: unknown }).cause;
  const reason = cause === undefined ? messageOf(error) : messageOf(cause);
  return new CommandError(`Could not reach the osq server at ${server.base}: ${reason}`);
}

/** The transport error for a command stream that ended without its last line. */
function missingExit(server: RemoteServer): CommandError {
  return new CommandError(`osq server at ${server.base} ended the command without an exit code`);
}

/** The transport error for a non-2xx answer, using the body's error. */
function refused(
  server: RemoteServer,
  status: number,
  statusText: string,
  body: string,
): CommandError {
  let detail: string | null = null;
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    if (typeof parsed.error === 'string') detail = parsed.error;
  } catch {
    detail = null;
  }
  return new CommandError(
    `osq server at ${server.base} refused the request (${status}): ${detail ?? statusText}`,
  );
}

/** The absolute URL of `path` resolved against the server's base. */
function resolveUrl(server: RemoteServer, path: string): string {
  return new URL(path, server.base).toString();
}

/** The origin of the server's base, sent as the `Origin` header. */
function originOf(server: RemoteServer): string {
  return new URL(server.base).origin;
}

/** The headers every guarded write sends. */
function writeHeaders(server: RemoteServer, token: string): Record<string, string> {
  return {
    Origin: originOf(server),
    'Content-Type': 'application/json',
    'X-Osq-Token': token,
  };
}

/** Send one request, turning a pre-response failure into a CommandError. */
async function send(
  server: RemoteServer,
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: string,
): Promise<Response> {
  try {
    return await fetch(resolveUrl(server, path), {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
    });
  } catch (error) {
    throw unreachable(server, error);
  }
}

/** Send one request and resolve the parsed JSON body of a 2xx answer. */
async function readJson(
  server: RemoteServer,
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: string,
): Promise<unknown> {
  const response = await send(server, method, path, headers, body);
  if (!response.ok) {
    throw refused(server, response.status, response.statusText, await response.text());
  }
  return await response.json();
}

/** Read the command token from `GET api/commands`. */
async function readToken(server: RemoteServer): Promise<string> {
  const body = (await readFromServer(server, 'api/commands')) as { token?: unknown };
  return typeof body?.token === 'string' ? body.token : '';
}

/** One NDJSON line: its output, written to the matching writer, or the end. */
function parseLine(line: string, stdout: Writer, stderr: Writer): ForwardedEnd | null {
  if (line === '') return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof parsed.stream === 'string') {
    const writer = parsed.stream === 'stderr' ? stderr : stdout;
    writer(typeof parsed.text === 'string' ? parsed.text : String(parsed.text ?? ''));
    return null;
  }
  return {
    exitCode: Number(parsed.exitCode),
    error: typeof parsed.error === 'string' ? parsed.error : null,
    next: typeof parsed.next === 'string' ? parsed.next : null,
  };
}

/** Read the command stream, writing each line as it arrives. */
async function readEnd(
  server: RemoteServer,
  response: Response,
  stdout: Writer,
  stderr: Writer,
): Promise<ForwardedEnd> {
  if (response.body === null) throw missingExit(server);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let end: ForwardedEnd | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const parsed = parseLine(line, stdout, stderr);
      if (parsed !== null) end = parsed;
    }
  }
  buffer += decoder.decode();
  if (buffer.trim() !== '') {
    const parsed = parseLine(buffer, stdout, stderr);
    if (parsed !== null) end = parsed;
  }
  if (end === null) throw missingExit(server);
  return end;
}

/**
 * `GET <path>` resolved against `base`; resolves the parsed JSON body of a 2xx answer.
 * @scenario cli-foundation: Plan downloads a working copy
 * @adr 014
 */
export async function readFromServer(server: RemoteServer, path: string): Promise<unknown> {
  return await readJson(server, 'GET', path, {});
}

/**
 * A guarded write of a JSON body to `<path>`; resolves the parsed JSON body of a 2xx answer.
 * @scenario cli-foundation: Lint uploads the working copy
 * @scenario cli-foundation: Refused upload stops lint
 * @adr 014
 */
export async function writeToServer(
  server: RemoteServer,
  path: string,
  method: 'POST' | 'PUT',
  body: unknown,
): Promise<unknown> {
  const token = await readToken(server);
  return await readJson(server, method, path, writeHeaders(server, token), JSON.stringify(body));
}

/**
 * Post one forwarded command and stream its NDJSON output to `stdout` and
 * `stderr` as it arrives, resolving its last line.
 * @scenario cli-foundation: Server out of reach
 * @scenario cli-foundation: Same command from a laptop
 * @scenario cli-foundation: Same output as local
 * @adr 014
 */
export async function runOnServer(
  server: RemoteServer,
  request: ForwardedCommand,
  stdout: Writer,
  stderr: Writer,
): Promise<ForwardedEnd> {
  const token = await readToken(server);
  const response = await send(
    server,
    'POST',
    'api/commands',
    writeHeaders(server, token),
    JSON.stringify(request),
  );
  if (!response.ok) {
    throw refused(server, response.status, response.statusText, await response.text());
  }
  return await readEnd(server, response, stdout, stderr);
}
