import type { ReactElement } from 'react';
import type { WebServerStatus } from '../contracts.js';

/** The watcher line: its mode in words, or that nothing is running. */
function watcherLine(status: WebServerStatus): string {
  const watcher = status.watcher;
  if (watcher === null) return 'Watcher: not running';
  const mode =
    watcher.mode === 'background' ? 'running in the background' : 'running in a terminal';
  return `Watcher: ${mode}`;
}

/** The home view's Service panel: watcher state, waiting warning, and log. */
export function ServicePanel({ server }: { readonly server: WebServerStatus }): ReactElement {
  const watcher = server.watcher;
  return (
    <section className="service-panel" aria-labelledby="service-panel-title">
      <h2 id="service-panel-title">Service</h2>
      <p className="service-line">{watcherLine(server)}</p>
      {watcher === null ? null : (
        <p className="service-detail">
          {`Version ${watcher.version}, commit ${watcher.commit}, started ${watcher.startedAt}`}
        </p>
      )}
      {watcher !== null && watcher.waiting !== null ? (
        <p className="service-warning">{`Waiting: ${watcher.waiting}`}</p>
      ) : null}
      {server.service === null ? null : (
        <p className="service-line">{`Service log: ${server.log}`}</p>
      )}
    </section>
  );
}
