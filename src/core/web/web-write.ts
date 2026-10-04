import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { OsqConfig } from '../foundation/config.js';
import type { WebActionRequest, WebActionRunner, WebActions } from './web-actions.js';
import { WebDataError } from './web-data-types.js';
import { decodeChangeSelector, sendFailure, sendJson } from './web-http.js';

/** One per-server token guarding the write endpoints. */
export function createActionToken(): string {
  return randomBytes(32).toString('hex');
}

/** An allowed host is the loopback host or `localhost` at the bound port. */
export function isHostAllowed(host: string | undefined, port: number): boolean {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

/** An allowed origin is `http://` followed by an allowed host. */
export function isOriginAllowed(origin: string | undefined, port: number): boolean {
  if (origin === undefined) return false;
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}

/** The media type is `application/json`, ignoring parameters such as charset. */
export function isJsonMediaType(value: string | undefined): boolean {
  return value?.split(';')[0]?.trim().toLowerCase() === 'application/json';
}

/** Constant-time comparison of the request token against the server's token. */
export function tokenMatches(
  provided: string | readonly string[] | undefined,
  token: string,
): boolean {
  if (typeof provided !== 'string') return false;
  const got = Buffer.from(provided, 'utf8');
  const expected = Buffer.from(token, 'utf8');
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Read the complete request body as UTF-8; no size limit is imposed. */
export async function readRequestBody(req: IncomingMessage): Promise<string> {
  req.setEncoding('utf8');
  let body = '';
  for await (const chunk of req) body += chunk as string;
  return body;
}

export type ActionRequestBody =
  | { readonly ok: true; readonly request: WebActionRequest }
  | { readonly ok: false; readonly error: string };

/** Validate one action body, supplying the URL's decoded change selector. */
export function parseActionRequest(rawBody: string, change: string): ActionRequestBody {
  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    return { ok: false, error: 'body is not valid JSON' };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'body must be a JSON object' };
  }
  const record = value as Record<string, unknown>;
  const verb = record.verb;
  if (verb === 'approve') return { ok: true, request: { verb, change } };
  if (verb === 'land') return { ok: true, request: { verb, change } };
  if (verb === 'reject') {
    const reason = record.reason;
    if (typeof reason !== 'string' || reason.length === 0) {
      return { ok: false, error: 'reject requires a non-empty string reason' };
    }
    return { ok: true, request: { verb, change, reason } };
  }
  if (verb === 'retry') {
    const target = record.target;
    if (typeof target !== 'string' || target.length === 0) {
      return { ok: false, error: 'retry requires a non-empty string target' };
    }
    return { ok: true, request: { verb, change, target } };
  }
  return { ok: false, error: 'verb must be approve, land, reject, or retry' };
}

/** One write at a time: a request reserves the slot before it reads its body. */
export interface WriteGate {
  /** Reserve the slot; false when another action holds it. */
  tryBegin(): boolean;
  /** Release the slot after a result or failure. */
  end(): void;
}

export function createWriteGate(): WriteGate {
  let busy = false;
  return {
    tryBegin: () => {
      if (busy) return false;
      busy = true;
      return true;
    },
    end: () => {
      busy = false;
    },
  };
}

const ACTIONS_PREFIX = '/api/actions/';

export interface ActionRouteOptions {
  readonly projectRoot: string;
  readonly config: OsqConfig;
  readonly getActions: (
    projectRoot: string,
    selector: string,
    config: OsqConfig,
  ) => Promise<WebActions>;
  /** Resolves the actual bound port; the allowed hosts use it. */
  readonly getPort: () => number;
}

export interface ActionRoutes {
  readonly token: string;
  handleGet(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    head: boolean,
  ): Promise<void>;
  handlePost(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    run: WebActionRunner,
  ): Promise<void>;
}

interface ActionContext {
  readonly options: ActionRouteOptions;
  readonly token: string;
  readonly gate: WriteGate;
}

function sendDataError(res: ServerResponse, error: unknown, head: boolean): void {
  if (error instanceof WebDataError) {
    sendJson(res, error.kind === 'ambiguous' ? 409 : 404, { error: error.message }, head);
    return;
  }
  sendFailure(res, error, head);
}

async function actionGet(
  context: ActionContext,
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  head: boolean,
): Promise<void> {
  const port = context.options.getPort();
  const origin = req.headers.origin;
  if (
    !isHostAllowed(req.headers.host, port) ||
    (origin !== undefined && !isOriginAllowed(origin, port))
  ) {
    return sendJson(res, 403, { error: 'request refused' }, head);
  }
  const selector = decodeChangeSelector(pathname.slice(ACTIONS_PREFIX.length));
  if (selector === null) return sendJson(res, 400, { error: 'unsafe change selector' }, head);
  try {
    const actions = await context.options.getActions(
      context.options.projectRoot,
      selector,
      context.options.config,
    );
    sendJson(res, 200, { ...actions, token: context.token }, head);
  } catch (error) {
    sendDataError(res, error, head);
  }
}

async function actionPost(
  context: ActionContext,
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  run: WebActionRunner,
): Promise<void> {
  const port = context.options.getPort();
  if (
    !isHostAllowed(req.headers.host, port) ||
    !isOriginAllowed(req.headers.origin, port) ||
    !isJsonMediaType(req.headers['content-type']) ||
    !tokenMatches(req.headers['x-osq-token'], context.token)
  ) {
    return sendJson(res, 403, { error: 'write request refused' }, false);
  }
  const selector = decodeChangeSelector(pathname.slice(ACTIONS_PREFIX.length));
  if (selector === null) return sendJson(res, 400, { error: 'unsafe change selector' }, false);
  if (!context.gate.tryBegin()) {
    return sendJson(res, 409, { error: 'another action is running' }, false);
  }
  try {
    const parsed = parseActionRequest(await readRequestBody(req), selector);
    if (!parsed.ok) return sendJson(res, 400, { error: parsed.error }, false);
    try {
      sendJson(res, 200, await run(parsed.request), false);
    } catch (error) {
      sendFailure(res, error, false);
    }
  } finally {
    context.gate.end();
  }
}

/** One guarded GET/POST endpoint pair over the actions path for one server. */
export function createActionRoutes(options: ActionRouteOptions): ActionRoutes {
  const context: ActionContext = { options, token: createActionToken(), gate: createWriteGate() };
  return {
    token: context.token,
    handleGet: (req, res, pathname, head) => actionGet(context, req, res, pathname, head),
    handlePost: (req, res, pathname, run) => actionPost(context, req, res, pathname, run),
  };
}
