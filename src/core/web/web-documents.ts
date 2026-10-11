/**
 * The read-only document table the loopback server answers: the report, the
 * graph, the system graph, the inbox, and the docs site, each with its default
 * builder. Every loader resolves its document from files at request time, so
 * the table holds no cache.
 *
 * The docs document defaults to the `docs` slice's site builder. `src/core`
 * may not import outside `src/core` (`tests/import-graph.test.ts`), so the
 * builder is loaded through `createRequire` at first use; the import graph
 * still records the edge, because it follows `require()`.
 */

import { createRequire } from 'node:module';
import type { OsqConfig } from '../foundation/config.js';
import { type MetricsReport, getMetricsReport } from '../report/report.js';
import type { ReadInboxOptions } from '../status/inbox-projection.js';
import { readInbox } from '../status/inbox-projection.js';
import type { Inbox } from '../status/inbox.js';
import type { SystemGraph } from './system-graph-types.js';
import { getSystemGraph } from './system-graph.js';
import { getWebGraph } from './web-data-graph.js';
import type { WebGraph } from './web-data-types.js';

/** One loader in the document table, resolved for one request. */
export type WebDocumentLoader = () => Promise<unknown>;

/** The docs site shape `GET /api/docs` returns; kept structural so core stays inside core. */
export interface WebDocsDocument {
  readonly version: 1;
  readonly groups: readonly unknown[];
  readonly capabilities: readonly unknown[];
  readonly adrs: readonly unknown[];
}

/** An injectable docs site builder, like the other document builders. */
export type WebDocsBuilder = (projectRoot: string, config: OsqConfig) => Promise<WebDocsDocument>;

/** The builders `startWebServer` can override; each defaults to its reader. */
export interface WebDocumentInputs {
  readonly projectRoot: string;
  readonly config: OsqConfig;
  /** The clock the inbox document reads its `now` from, resolved per request. */
  readonly now?: () => Date;
  readonly home?: string;
  readonly getReport?: (projectRoot: string, config: OsqConfig) => Promise<MetricsReport>;
  readonly getGraph?: (projectRoot: string, config: OsqConfig) => Promise<WebGraph>;
  readonly getSystem?: (projectRoot: string, config: OsqConfig) => Promise<SystemGraph>;
  readonly getInbox?: (projectRoot: string, options: ReadInboxOptions) => Promise<Inbox>;
  readonly getDocs?: WebDocsBuilder;
}

/** The `docs` slice's module, as `createRequire` reads it. */
interface DocsSiteModule {
  readonly buildDocsSite: WebDocsBuilder;
}

/**
 * Build the read-only document table, keyed by pathname. Each loader runs its
 * builder at request time, so the table keeps no cache.
 *
 * @scenario web-inspection: Docs over HTTP
 * @adr 013
 */
export function createWebDocumentLoaders(
  inputs: WebDocumentInputs,
): Record<string, WebDocumentLoader> {
  const { projectRoot, config, home } = inputs;
  const now = inputs.now ?? (() => new Date());
  const getReport = inputs.getReport ?? getMetricsReport;
  const getGraph = inputs.getGraph ?? getWebGraph;
  const getSystem = inputs.getSystem ?? getSystemGraph;
  const getInbox = inputs.getInbox ?? ((root, options) => readInbox(root, options));
  const getDocs = inputs.getDocs ?? loadDocsSite;
  return {
    '/api/report': () => getReport(projectRoot, config),
    '/api/graph': () => getGraph(projectRoot, config),
    '/api/system': () => getSystem(projectRoot, config),
    '/api/inbox': () => getInbox(projectRoot, { config, now: now(), home }),
    '/api/docs': () => getDocs(projectRoot, config),
  };
}

/**
 * The docs site builder, loaded once at first use through `createRequire`:
 * the equivalent static import would break the "core stays inside core"
 * boundary, and the import graph records the edge anyway because it follows
 * `require()`.
 */
function loadDocsSite(projectRoot: string, config: OsqConfig): Promise<WebDocsDocument> {
  const nodeRequire = createRequire(import.meta.url);
  const module = nodeRequire('../../docs/docs-site.js') as DocsSiteModule;
  return module.buildDocsSite(projectRoot, config);
}
