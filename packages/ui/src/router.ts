/** The five views the dashboard can show. */
export type Route =
  | { readonly name: 'home' }
  | { readonly name: 'changes' }
  | { readonly name: 'report' }
  | { readonly name: 'graph' }
  | { readonly name: 'change'; readonly folderKey: string };

export const HOME_ROUTE: Route = { name: 'home' };
export const CHANGES_ROUTE: Route = { name: 'changes' };
export const REPORT_ROUTE: Route = { name: 'report' };
export const GRAPH_ROUTE: Route = { name: 'graph' };

const CHANGES_PATH = '/changes';
const CHANGE_PREFIX = '/changes/';
const HASH_PREFIX = '#';

/** Render a route as its canonical location hash. */
export function routeToHash(route: Route): string {
  if (route.name === 'home') return `${HASH_PREFIX}/`;
  if (route.name === 'changes') return `${HASH_PREFIX}${CHANGES_PATH}`;
  if (route.name === 'report') return `${HASH_PREFIX}/report`;
  if (route.name === 'graph') return `${HASH_PREFIX}/graph`;
  return `${HASH_PREFIX}${CHANGE_PREFIX}${encodeURIComponent(route.folderKey)}`;
}

/** Decode one folder key, rejecting separators, traversal, and bad escapes. */
export function decodeFolderKey(encoded: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    return null;
  }
  if (decoded.length === 0 || decoded.includes('\0')) return null;
  if (decoded.includes('/') || decoded.includes('\\')) return null;
  if (decoded === '.' || decoded === '..') return null;
  return decoded;
}

/** Parse a location hash into a route, or `null` when it is not usable. */
export function parseHash(hash: string): Route | null {
  const raw = hash.startsWith(HASH_PREFIX) ? hash.slice(HASH_PREFIX.length) : hash;
  if (raw === '' || raw === '/') return HOME_ROUTE;
  if (!raw.startsWith('/')) return null;
  if (raw === CHANGES_PATH) return CHANGES_ROUTE;
  if (raw === '/report') return REPORT_ROUTE;
  if (raw === '/graph') return GRAPH_ROUTE;
  if (!raw.startsWith(CHANGE_PREFIX)) return null;
  const folderKey = decodeFolderKey(raw.slice(CHANGE_PREFIX.length));
  return folderKey === null ? null : { name: 'change', folderKey };
}

/** Resolve a hash to a route, falling back to the home view. */
export function resolveRoute(hash: string): Route {
  return parseHash(hash) ?? HOME_ROUTE;
}

/** The browser surface the hash router needs; injectable for focused tests. */
export interface RouterScope {
  readonly location: { hash: string };
  addEventListener(type: 'hashchange', listener: () => void): void;
  removeEventListener(type: 'hashchange', listener: () => void): void;
}

export interface HashRouter {
  current(): Route;
  navigate(route: Route): void;
  subscribe(listener: (route: Route) => void): () => void;
  close(): void;
}

/** A small native hash router: no routing package, one hashchange listener. */
export function createHashRouter(scope: RouterScope = globalThis as unknown as RouterScope) {
  const listeners = new Set<(route: Route) => void>();
  let closed = false;
  const onHashChange = (): void => {
    const route = resolveRoute(scope.location.hash);
    for (const listener of [...listeners]) listener(route);
  };
  scope.addEventListener('hashchange', onHashChange);
  return {
    current: () => resolveRoute(scope.location.hash),
    navigate(route: Route) {
      const next = routeToHash(route);
      if (scope.location.hash !== next) scope.location.hash = next;
    },
    subscribe(listener: (route: Route) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close() {
      if (closed) return;
      closed = true;
      scope.removeEventListener('hashchange', onHashChange);
      listeners.clear();
    },
  } satisfies HashRouter;
}
