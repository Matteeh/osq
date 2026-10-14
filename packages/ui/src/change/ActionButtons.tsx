import type { ReactElement } from 'react';
import type { ApprovalFlag, WebAction, WebActionsDocument } from '../contracts.js';
import { ApprovalFlags } from './ApprovalFlags.js';
import type { ChangePageMain } from './page-model.js';

export interface ActionButtonsProps {
  readonly document: WebActionsDocument;
  /** The page's main button; only `approve` and `land` are action buttons. */
  readonly main: ChangePageMain;
  readonly pending: boolean;
  readonly onRun: (action: WebAction) => void;
  readonly flags?: readonly ApprovalFlag[];
  readonly approveBlockedBy?: readonly string[];
}

/** The offered action the page's main button names, or undefined. */
function mainAction(document: WebActionsDocument, main: ChangePageMain): WebAction | undefined {
  if (main === 'approve') return document.actions.find((action) => action.verb === 'approve');
  if (main === 'land') return document.actions.find((action) => action.verb === 'land');
  return undefined;
}

/**
 * The button bar's main item: Approve when the page's main is `approve` and
 * the actions hold it, Land when the main is `land` and the actions hold it.
 * The Approve item keeps the red-notice note and the review's flags; without
 * an approve action the flags show here, at the bar's start.
 *
 * @scenario web-inspection: Approval buttons
 * @scenario web-inspection: Reject in the menu
 * @adr 013
 */
export function ActionButtons({
  document,
  main,
  pending,
  onRun,
  flags = [],
  approveBlockedBy = [],
}: ActionButtonsProps): ReactElement {
  const action = mainAction(document, main);
  const blocked = action !== undefined && action.verb === 'approve' && approveBlockedBy.length > 0;
  const hasApprove = document.actions.some((entry) => entry.verb === 'approve');
  return (
    <>
      {hasApprove ? null : <ApprovalFlags flags={flags} />}
      {action === undefined ? null : (
        <div className="action-item">
          <button
            type="button"
            className="action-button"
            disabled={pending || blocked}
            onClick={() => onRun(action)}
          >
            {action.verb.charAt(0).toUpperCase() + action.verb.slice(1)}
          </button>
          {blocked ? (
            <p className="action-blocked" role="note">
              Open each red notice to approve: {approveBlockedBy.join(', ')}
            </p>
          ) : null}
          {action.verb === 'approve' ? <ApprovalFlags flags={flags} /> : null}
          {pending ? <output className="action-pending">Running…</output> : null}
        </div>
      )}
    </>
  );
}
