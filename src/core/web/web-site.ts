import type { ServerResponse } from 'node:http';
import { type ServiceRecord, type WatcherRecord, readWatchState } from '../run/watch-state.js';

/** Who a served dashboard is: the server's name and the project's path segment. */
export interface WebServerSite {
  readonly name: string;
  readonly project: string;
}

/** The `api/server` document. */
export interface WebServerStatus {
  readonly name: string;
  readonly project: string;
  /** `/p/<project>/`. */
  readonly path: string;
  readonly service: ServiceRecord | null;
  readonly watcher: WatcherRecord | null;
  /** Absolute path of watch.log. */
  readonly log: string;
}

/**
 * The site's current state, read from the watch records on every call.
 * @scenario web-inspection: Status document
 * @adr 014
 */
export async function readServerStatus(
  projectRoot: string,
  site: WebServerSite,
  home?: string,
): Promise<WebServerStatus> {
  const state = await readWatchState(projectRoot, home);
  return {
    name: site.name,
    project: site.project,
    path: `/p/${site.project}/`,
    service: state.service,
    watcher: state.watcher,
    log: state.log,
  };
}

/** How one request path routes on a server with a site. */
export type WebSiteRoute =
  | { readonly kind: 'request'; readonly pathname: string }
  | { readonly kind: 'redirect' }
  | { readonly kind: 'notFound' };

/**
 * Map a request path under `/p/<project>/` to the dashboard's own routing, a
 * redirect to the site root, or an unknown path.
 * @scenario web-inspection: Paths with a site
 * @scenario web-inspection: No site, no project paths
 * @adr 014
 */
export function routeWebSite(pathname: string, site: WebServerSite): WebSiteRoute {
  const root = `/p/${site.project}`;
  if (pathname === '/' || pathname === root) return { kind: 'redirect' };
  if (pathname.startsWith(`${root}/`)) {
    return { kind: 'request', pathname: pathname.slice(root.length) };
  }
  return { kind: 'notFound' };
}

/**
 * Send the site root redirect with its `/p/<project>/` location.
 * @scenario web-inspection: Paths with a site
 * @adr 014
 */
export function sendSiteRedirect(res: ServerResponse, site: WebServerSite): void {
  res.writeHead(302, { Location: `/p/${site.project}/` });
  res.end();
}
