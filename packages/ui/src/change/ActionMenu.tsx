import type { ReactElement } from 'react';
import type { WebAction, WebActionsDocument } from '../contracts.js';

export interface ActionMenuProps {
  readonly document: WebActionsDocument;
  readonly pending: boolean;
  readonly reason: string;
  readonly onReasonChange: (reason: string) => void;
  readonly onRun: (action: WebAction) => void;
}

/**
 * The head's `More actions` menu: Reject with its reason field, Retry change,
 * and each manual command as code to run in a shell. It renders nothing when
 * none of those applies, so a change with only Approve shows no menu.
 *
 * @scenario web-inspection: Approval buttons
 * @scenario web-inspection: Reject in the menu
 * @adr 013
 */
export function ActionMenu({
  document,
  pending,
  reason,
  onReasonChange,
  onRun,
}: ActionMenuProps): ReactElement | null {
  const reject = document.actions.find((action) => action.verb === 'reject');
  const retryChange = document.actions.find(
    (action) => action.verb === 'retry' && (action.target === null || action.target === 'change'),
  );
  if (reject === undefined && retryChange === undefined && document.manual.length === 0) {
    return null;
  }
  const needsReason = reason.trim().length === 0;
  return (
    <details className="page-menu">
      <summary aria-label="More actions">More actions</summary>
      {reject === undefined ? null : (
        <div className="menu-row">
          <button
            type="button"
            className="menu-button"
            disabled={pending || needsReason}
            onClick={() => onRun(reject)}
          >
            Reject
          </button>
          <label className="action-reason">
            Reason
            <input
              type="text"
              className="action-reason-input"
              aria-label={`Reason for ${reject.command}`}
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
            />
          </label>
        </div>
      )}
      {retryChange === undefined ? null : (
        <div className="menu-row">
          <button
            type="button"
            className="menu-button"
            disabled={pending}
            onClick={() => onRun(retryChange)}
          >
            Retry change
          </button>
        </div>
      )}
      {document.manual.length === 0 ? null : (
        <ul className="action-manual">
          {document.manual.map((command) => (
            <li key={command}>
              <code>{command}</code>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
