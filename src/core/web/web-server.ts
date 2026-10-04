import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { DEFAULT_SERVE_CONFIG } from '../foundation/config-serve.js';
import type { OsqConfig } from '../foundation/config.js';
import { type MetricsReport, getMetricsReport } from '../report/report.js';
import { changeTrees } from '../status/change-locations.js';
import { type ReadInboxOptions, readInbox } from '../status/inbox-projection.js';
import type { Inbox } from '../status/inbox.js';
import type { SystemGraph } from './system-graph-types.js';
import { getSystemGraph } from './system-graph.js';
import { type WebActionRunner, type WebActions, getWebActions } from './web-actions.js';
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
import { decodeChangeSelector, send, sendFailure, sendJson } from './web-http.js';
import { UI_CONTENT_SECURITY_POLICY, resolveStaticFile, resolveUiDir } from './web-static.js';
import { createActionRoutes } from './web-write.js';

export { serializeWebJson } from './web-http.js';

const SERVE_HOST = '127.0.0.1';
const CHANGE_PREFIX = '/api/changes/';
const ACTIONS_PREFIX = '/api/actions/';
const EVENTS_PATH = '/api/events';

type ChangeDocumentFn = (
  projectRoot: string,
  selector: string,
  config: OsqConfig,
  now: Date,
) => Promise<WebChange>;

type ActionDocumentFn = (
  projectRoot: string,
  selector: string,
  config: OsqConfig,
) => Promise<WebActions>;

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
  readonly getSystem?: (projectRoot: string, config: OsqConfig) => Promise<SystemGraph>;
  readonly getChange?: ChangeDocumentFn;
  readonly getInbox?: (projectRoot: string, options: ReadInboxOptions) => Promise<Inbox>;
  readonly getActions?: ActionDocumentFn;
  readonly runAction?: WebActionRunner;
  readonly watch?: WatcherFactory;
  readonly schedule?: ScheduleFn;
}

/** An idempotently closable listener with its actual bound loopback URL. */
export interface WebServerHandle {
  readonly url: string;
  readonly port: number;
  close(): Promise<void>;
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
  const getSystem = options.getSystem ?? getSystemGraph;
  const getChange = options.getChange ?? getWebChange;
  const getInbox =
    options.getInbox ?? ((root: string, inbox: ReadInboxOptions) => readInbox(root, inbox));
  const runAction = options.runAction;
  let boundPort = 0;
  const actions = createActionRoutes({
    projectRoot,
    config,
    getActions: options.getActions ?? getWebActions,
    getPort: () => boundPort,
  });

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

  async function handleApi(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string,
    head: boolean,
  ) {
    try {
      if (pathname === EVENTS_PATH) return events.handle(res, head);
      if (runAction !== undefined && pathname.startsWith(ACTIONS_PREFIX)) {
        return await actions.handleGet(req, res, pathname, head);
      }
      const documents: Record<string, () => Promise<unknown>> = {
        '/api/report': () => getReport(projectRoot, config),
        '/api/graph': () => getGraph(projectRoot, config),
        '/api/system': () => getSystem(projectRoot, config),
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
    const rawUrl = req.url ?? '/';
    const pathname = rawUrl.startsWith('/') ? rawUrl.replace(/[?#].*$/, '') : null;
    if (pathname === null) {
      return sendJson(res, 400, { error: 'malformed request url' }, method === 'HEAD');
    }
    const isActionPath = pathname.startsWith(ACTIONS_PREFIX);
    if (method === 'POST') {
      if (runAction !== undefined && isActionPath) {
        return await actions.handlePost(req, res, pathname, runAction);
      }
      return sendJson(res, 405, { error: 'method not allowed' }, false, { Allow: 'GET, HEAD' });
    }
    if (method !== 'GET' && method !== 'HEAD') {
      const allow = runAction !== undefined && isActionPath ? 'GET, HEAD, POST' : 'GET, HEAD';
      return sendJson(res, 405, { error: 'method not allowed' }, false, { Allow: allow });
    }
    const head = method === 'HEAD';
    if (pathname.startsWith('/api/')) await handleApi(req, res, pathname, head);
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
  boundPort = address.port;
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
