import type { MetricsReport } from '../../../src/core/report/report.js';
import type { ApprovalFlag } from '../../../src/core/spec/digest.js';
import type {
  ApprovalNotice,
  ApprovalNotices,
  NoticeSeverity,
} from '../../../src/core/spec/notices.js';
import type { Inbox } from '../../../src/core/status/inbox.js';
import type {
  WebAction,
  WebActionRequest,
  WebActionResult,
  WebActionsDocument,
} from '../../../src/core/web/web-actions.js';
import type {
  LandDisclosure,
  LandGate,
  LandView,
  WebChange,
  WebDeltaCapability,
  WebDeltaRequirement,
  WebGraph,
  WebReview,
} from '../../../src/core/web/web-data.js';
import type { WebServerStatus } from '../../../src/core/web/web-site.js';

export type {
  ApprovalFlag,
  ApprovalNotice,
  ApprovalNotices,
  Inbox,
  LandDisclosure,
  LandGate,
  LandView,
  MetricsReport,
  NoticeSeverity,
  WebAction,
  WebActionRequest,
  WebActionResult,
  WebActionsDocument,
  WebChange,
  WebDeltaCapability,
  WebDeltaRequirement,
  WebGraph,
  WebReview,
  WebServerStatus,
};

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
