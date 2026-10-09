import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.js';
import { createActionClient } from './change/actions-client.js';
import type { WebServerStatus } from './contracts.js';
import { type DashboardSnapshot, createDashboardData } from './data.js';
import type { Route } from './router.js';
import { createHashRouter } from './router.js';
import { createServerStatusClient, resolveApiBase } from './server/index.js';
import './change/actions.css';
import './change/review.css';
import './change/notices.css';
import './change/land.css';
import './server/server.css';
import './styles.css';

const EMPTY: DashboardSnapshot = { report: null, graph: null, inbox: null, change: null };

const router = createHashRouter();
const base = resolveApiBase(window.location.pathname);
const data = createDashboardData({ base });
// A static export carries its documents inline and must never call an action.
const nativeFetch = window.fetch;
const actionClient = data.inline
  ? undefined
  : createActionClient((input, init) => nativeFetch(input, init), base);
// Only a `/p/<project>/` page asks the server who it is.
const statusClient = base === '' ? null : createServerStatusClient((input) => nativeFetch(input));

function Root(): ReactElement {
  const [route, setRoute] = useState<Route>(() => router.current());
  const [documents, setDocuments] = useState<DashboardSnapshot>(EMPTY);
  const [server, setServer] = useState<WebServerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async (): Promise<void> => {
    if (statusClient === null) return;
    const next = await statusClient.load(base);
    if (next !== null) setServer(next);
  }, []);

  const refresh = useCallback(
    async (next: Route): Promise<void> => {
      setLoading(true);
      try {
        setDocuments(await data.load(next));
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoading(false);
      }
      await refreshStatus();
    },
    [refreshStatus],
  );

  useEffect(() => router.subscribe((next) => setRoute(next)), []);
  useEffect(() => {
    void refresh(route);
    return data.subscribe((snapshot) => {
      setDocuments(snapshot);
      void refreshStatus();
    });
  }, [route, refresh, refreshStatus]);

  return (
    <App
      route={route}
      documents={documents}
      loading={loading}
      error={error}
      onNavigate={(next) => router.navigate(next)}
      onRefresh={() => void refresh(route)}
      actionClient={actionClient}
      server={server}
    />
  );
}

const container = document.getElementById('root');
if (container !== null) createRoot(container).render(<Root />);
