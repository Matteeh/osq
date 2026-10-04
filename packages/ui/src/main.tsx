import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.js';
import { createActionClient } from './change/actions-client.js';
import { type DashboardSnapshot, createDashboardData } from './data.js';
import type { Route } from './router.js';
import { createHashRouter } from './router.js';
import './change/actions.css';
import './change/review.css';
import './styles.css';

const EMPTY: DashboardSnapshot = { report: null, graph: null, inbox: null, change: null };

const router = createHashRouter();
const data = createDashboardData();
// A static export carries its documents inline and must never call an action.
const nativeFetch = window.fetch;
const actionClient = data.inline
  ? undefined
  : createActionClient((input, init) => nativeFetch(input, init));

function Root(): ReactElement {
  const [route, setRoute] = useState<Route>(() => router.current());
  const [documents, setDocuments] = useState<DashboardSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (next: Route): Promise<void> => {
    setLoading(true);
    try {
      setDocuments(await data.load(next));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => router.subscribe((next) => setRoute(next)), []);
  useEffect(() => {
    void refresh(route);
    return data.subscribe(setDocuments);
  }, [route, refresh]);

  return (
    <App
      route={route}
      documents={documents}
      loading={loading}
      error={error}
      onNavigate={(next) => router.navigate(next)}
      onRefresh={() => void refresh(route)}
      actionClient={actionClient}
    />
  );
}

const container = document.getElementById('root');
if (container !== null) createRoot(container).render(<Root />);
