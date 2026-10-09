import type { ReactElement } from 'react';
import type { WebServerStatus } from '../contracts.js';

/** The served project and server name, shown next to the dashboard title. */
export function ServerHeader({ server }: { readonly server: WebServerStatus }): ReactElement {
  return <span className="server-name">{`${server.project} on ${server.name}`}</span>;
}
