import type { ReactElement, ReactNode } from 'react';
import { ChangeView } from './change/index.js';
import { ChangesView } from './changes/index.js';
import type { DashboardSnapshot } from './data.js';
import { GraphView } from './graph/index.js';
import { HomeView } from './home/index.js';
import { ReportView } from './report/index.js';
import type { Route } from './router.js';
import { routeToHash } from './router.js';

export interface AppProps {
  readonly route: Route;
  readonly documents: DashboardSnapshot;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onNavigate: (route: Route) => void;
  readonly onRefresh: () => void;
}

interface NavLinkProps {
  readonly route: Route;
  readonly current: Route;
  readonly onNavigate: (route: Route) => void;
  readonly children: ReactNode;
}

function NavLink({ route, current, onNavigate, children }: NavLinkProps): ReactElement {
  const active = route.name === current.name;
  return (
    <a
      className={active ? 'nav-link nav-link-active' : 'nav-link'}
      href={routeToHash(route)}
      aria-current={active ? 'page' : undefined}
      onClick={(event) => {
        event.preventDefault();
        onNavigate(route);
      }}
    >
      {children}
    </a>
  );
}

function EmptyState({ children }: { readonly children: ReactNode }): ReactElement {
  return <p className="state state-empty">{children}</p>;
}

function HomeRoute({
  documents,
  onNavigate,
}: {
  readonly documents: DashboardSnapshot;
  readonly onNavigate: (route: Route) => void;
}): ReactElement {
  if (documents.inbox === null) {
    return <EmptyState>No inbox is available yet.</EmptyState>;
  }
  return <HomeView inbox={documents.inbox} onNavigate={onNavigate} />;
}

function ChangesRoute({
  documents,
  onNavigate,
}: {
  readonly documents: DashboardSnapshot;
  readonly onNavigate: (route: Route) => void;
}): ReactElement {
  if (documents.graph === null) {
    return <EmptyState>No changes are available yet.</EmptyState>;
  }
  return <ChangesView graph={documents.graph} onNavigate={onNavigate} />;
}

function ReportRoute({
  documents,
}: {
  readonly documents: DashboardSnapshot;
}): ReactElement {
  if (documents.report === null || documents.graph === null) {
    return <EmptyState>No delivery report is available yet.</EmptyState>;
  }
  return <ReportView report={documents.report} graph={documents.graph} />;
}

function GraphRoute({
  documents,
  onNavigate,
}: {
  readonly documents: DashboardSnapshot;
  readonly onNavigate: (route: Route) => void;
}): ReactElement {
  if (documents.graph === null) {
    return <EmptyState>No capability graph is available yet.</EmptyState>;
  }
  return <GraphView graph={documents.graph} onNavigate={onNavigate} />;
}

function ChangeRoute({
  documents,
  error,
  onRefresh,
}: {
  readonly documents: DashboardSnapshot;
  readonly error: string | null;
  readonly onRefresh: () => void;
}): ReactElement {
  const change = documents.change;
  if (change === null) {
    return error !== null ? (
      <p className="state state-error" role="alert">
        {error}
      </p>
    ) : (
      <EmptyState>No change is selected.</EmptyState>
    );
  }
  return <ChangeView change={change} error={error} onRefresh={onRefresh} />;
}

/** The route-independent shell: navigation, state messaging, and one view. */
export function App({
  route,
  documents,
  loading,
  error,
  onNavigate,
  onRefresh,
}: AppProps): ReactElement {
  return (
    <div className="app">
      <header className="app-header">
        <h1>osq dashboard</h1>
        <nav className="app-nav" aria-label="Dashboard sections">
          <NavLink route={{ name: 'home' }} current={route} onNavigate={onNavigate}>
            Home
          </NavLink>
          <NavLink route={{ name: 'changes' }} current={route} onNavigate={onNavigate}>
            Changes
          </NavLink>
          <NavLink route={{ name: 'report' }} current={route} onNavigate={onNavigate}>
            Report
          </NavLink>
          <NavLink route={{ name: 'graph' }} current={route} onNavigate={onNavigate}>
            Graph
          </NavLink>
        </nav>
        <button type="button" className="refresh" onClick={onRefresh}>
          Refresh
        </button>
      </header>
      <main className="app-main">
        {error !== null && route.name !== 'change' ? (
          <p className="state state-error" role="alert">
            {error}
          </p>
        ) : null}
        {loading ? <p className="state state-loading">Loading…</p> : null}
        {route.name === 'home' ? <HomeRoute documents={documents} onNavigate={onNavigate} /> : null}
        {route.name === 'changes' ? (
          <ChangesRoute documents={documents} onNavigate={onNavigate} />
        ) : null}
        {route.name === 'report' ? <ReportRoute documents={documents} /> : null}
        {route.name === 'graph' ? (
          <GraphRoute documents={documents} onNavigate={onNavigate} />
        ) : null}
        {route.name === 'change' ? (
          <ChangeRoute documents={documents} error={error} onRefresh={onRefresh} />
        ) : null}
      </main>
    </div>
  );
}
