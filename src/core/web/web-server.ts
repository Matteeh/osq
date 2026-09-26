import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { DEFAULT_SERVE_CONFIG } from '../foundation/config-serve.js';
import type { OsqConfig } from '../foundation/config.js';
import { type MetricsReport, getMetricsReport } from '../report/report.js';
import { changeTrees } from '../status/change-locations.js';
import { type ReadInboxOptions, readInbox } from '../status/inbox-projection.js';
import type { Inbox } from '../status/inbox.js';
import { getWebChange } from './web-data-change.js';
import { getWebGraph } from './web-data-graph.js';
import type { WebChange, WebGraph } from './web-data-types.js';
import { WebDataError } from './web-data-types.js';
import {
  type ScheduleFn,
  type WatcherFactory,
  createEventStream,
  createInvalidationHub,
} from './web-events.js';
import { UI_CONTENT_SECURITY_POLICY, resolveStaticFile, resolveUiDir } from './web-static.js';

const SERVE_HOST = '127.0.0.1';
const CHANGE_PREFIX = '/api/changes/';
const EVENTS_PATH = '/api/events';

type ChangeDocumentFn = (
  projectRoot: string,
  selector: string,
  config: OsqConfig,
  now: Date,
) => Promise<WebChange>;

/** Dependency-injected composition root for the read-only loopback server. */
export interface WebServerOptions {
  readonly projectRoot: string;
  readonly config: OsqConfig;
  readonly port?: number;
  readonly uiDir?: string;
  readonly now?: () => Date;
  readonly home?: string;
  readonly getReport?: (projectRoot: string, config: OsqConfig) => Promise<MetricsReport>;
  readonly getGraph?: (projectRoot: string, config: OsqConfig) => Promise<WebGraph>;
  readonly getChange?: ChangeDocumentFn;
  readonly getInbox?: (projectRoot: string, options: ReadInboxOptions) => Promise<Inbox>;
  readonly watch?: WatcherFactory;
  readonly schedule?: ScheduleFn;
}

/** An idempotently closable listener with its actual bound loopback URL. */
export interface WebServerHandle {
  readonly url: string;
  readonly port: number;
  close(): Promise<void>;
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value === null || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) sorted[key] = sortKeysDeep(source[key]);
  return sorted;
}

/** Deterministic UTF-8 JSON shared by every API document. */
export function serializeWebJson(data: unknown): string {
  return JSON.stringify(sortKeysDeep(data));
}

function send(
  res: http.ServerResponse,
  status: number,
  body: Buffer,
  contentType: string,
  cache: string,
  head: boolean,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': body.byteLength,
    'Cache-Control': cache,
    ...headers,
  });
  if (head) res.end();
  else res.end(body);
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  data: unknown,
  head: boolean,
  headers: Record<string, string> = {},
): void {
  const body = Buffer.from(serializeWebJson(data), 'utf8');
  send(res, status, body, 'application/json; charset=utf-8', 'no-store', head, headers);
}

function sendFailure(res: http.ServerResponse, error: unknown, head = false): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) }, head);
}

/** Decode a change selector once, rejecting separators, traversal, and bad escapes. */
function decodeChangeSelector(raw: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (decoded.length === 0 || decoded.includes('\0')) return null;
  if (decoded.includes('/') || decoded.includes('\\')) return null;
  if (decoded === '.' || decoded === '..') return null;
  return decoded;
}

/** Start one loopback-only HTTP server over the current project tree. */
export async function startWebServer(options: WebServerOptions): Promise<WebServerHandle> {
  const projectRoot = options.projectRoot;
  const config = options.config;
  const uiDir = options.uiDir ?? resolveUiDir();
  const home = options.home;
  const clock = options.now ?? (() => new Date());
  const getReport = options.getReport ?? getMetricsReport;
  const getGraph = options.getGraph ?? getWebGraph;
  const getChange = options.getChange ?? getWebChange;
  const getInbox =
    options.getInbox ?? ((root: string, inbox: ReadInboxOptions) => readInbox(root, inbox));

  const trees = await changeTrees(projectRoot, config);
  const hub = createInvalidationHub({
    projectRoot,
    openspecRoot: config.paths.openspecRoot,
    debounceMs: config.serve?.eventDebounceMs ?? DEFAULT_SERVE_CONFIG.eventDebounceMs,
    trees,
    watch: options.watch,
    schedule: options.schedule,
  });
  const events = createEventStream(hub);

  async function handleChange(res: http.ServerResponse, pathname: string, head: boolean) {
    const raw = pathname.slice(CHANGE_PREFIX.length);
    if (raw.length === 0) return sendJson(res, 404, { error: 'change not found' }, head);
    const selector = decodeChangeSelector(raw);
    if (selector === null) return sendJson(res, 400, { error: 'unsafe change selector' }, head);
    try {
      sendJson(res, 200, await getChange(projectRoot, selector, config, clock()), head);
    } catch (error) {
      if (error instanceof WebDataError) {
        return sendJson(
          res,
          error.kind === 'ambiguous' ? 409 : 404,
          { error: error.message },
          head,
        );
      }
      sendFailure(res, error, head);
    }
  }

  async function handleApi(res: http.ServerResponse, pathname: string, head: boolean) {
    try {
      if (pathname === EVENTS_PATH) return events.handle(res, head);
      const documents: Record<string, () => Promise<unknown>> = {
        '/api/report': () => getReport(projectRoot, config),
        '/api/graph': () => getGraph(projectRoot, config),
        '/api/inbox': () => getInbox(projectRoot, { config, now: clock(), home }),
      };
      const document = documents[pathname];
      if (document) return sendJson(res, 200, await document(), head);
      if (pathname.startsWith(CHANGE_PREFIX)) return await handleChange(res, pathname, head);
      sendJson(res, 404, { error: 'not found' }, head);
    } catch (error) {
      sendFailure(res, error, head);
    }
  }

  async function handleStatic(res: http.ServerResponse, pathname: string, head: boolean) {
    const asset = await resolveStaticFile(pathname, uiDir);
    if (asset === null) {
      const body = Buffer.from('Not Found\n', 'utf8');
      return send(res, 404, body, 'text/plain; charset=utf-8', 'no-store', head);
    }
    const headers: Record<string, string> = asset.isHtml
      ? { 'Content-Security-Policy': UI_CONTENT_SECURITY_POLICY }
      : {};
    send(res, 200, asset.body, asset.contentType, asset.cacheControl, head, headers);
  }

  async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      return sendJson(res, 405, { error: 'method not allowed' }, false, { Allow: 'GET, HEAD' });
    }
    const head = method === 'HEAD';
    const rawUrl = req.url ?? '/';
    const pathname = rawUrl.startsWith('/') ? rawUrl.replace(/[?#].*$/, '') : null;
    if (pathname === null) return sendJson(res, 400, { error: 'malformed request url' }, head);
    if (pathname.startsWith('/api/')) await handleApi(res, pathname, head);
    else await handleStatic(res, pathname, head);
  }

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => sendFailure(res, error));
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.once('listening', resolve);
      server.listen(options.port ?? config.serve?.port ?? DEFAULT_SERVE_CONFIG.port, SERVE_HOST);
    });
  } catch (error) {
    hub.cancelPending();
    events.close();
    await hub.close();
    throw error;
  }

  const address = server.address() as AddressInfo;
  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    hub.cancelPending();
    events.close();
    await hub.close();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeIdleConnections();
    });
  };
  return { url: `http://${SERVE_HOST}:${address.port}/`, port: address.port, close };
}
