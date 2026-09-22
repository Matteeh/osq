import type { Inbox } from '../../../src/core/inbox.js';
import type { MetricsReport } from '../../../src/core/report.js';
import type { WebChange, WebGraph } from '../../../src/core/web-data.js';

export type { Inbox, MetricsReport, WebChange, WebGraph };

/**
 * Optional typed documents inlined into the served page. Each field is
 * authoritative only when present; a fully supplied route never touches the
 * network or opens an event stream.
 */
export interface OsqInlineData {
  readonly report?: MetricsReport;
  readonly graph?: WebGraph;
  readonly inbox?: Inbox;
  readonly changes?: Readonly<Record<string, WebChange>>;
}

declare global {
  interface Window {
    __OSQ_DATA__?: OsqInlineData;
  }
}

/** The change currently open in the route, used to scope invalidations. */
export interface OpenChange {
  readonly folderKey: string;
  readonly id: number | null;
}
