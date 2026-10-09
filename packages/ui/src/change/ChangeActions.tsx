import type { ReactElement } from 'react';
import type { ApprovalFlag, WebAction, WebActionResult, WebActionsDocument } from '../contracts.js';
import { ApprovalFlags } from './ApprovalFlags.js';

export interface ChangeActionsProps {
  readonly document: WebActionsDocument;
  readonly pending: boolean;
  readonly result: WebActionResult | null;
  readonly reason: string;
  readonly onReasonChange: (reason: string) => void;
  readonly onRun: (action: WebAction) => void;
  readonly flags?: readonly ApprovalFlag[];
  readonly approveBlockedBy?: readonly string[];
}

function buttonLabel(action: WebAction): string {
  if (action.verb === 'retry') {
    return action.target === 'change' || action.target === null
      ? 'Retry change'
      : `Retry task ${action.target}`;
  }
  return action.verb.charAt(0).toUpperCase() + action.verb.slice(1);
}

function ActionResult({ result }: { readonly result: WebActionResult }): ReactElement {
  return (
    <output className="action-result">
      <p className="action-exit">Exit code {result.exitCode}</p>
      {result.stdout.length > 0 ? <pre className="action-stdout">{result.stdout}</pre> : null}
      {result.stderr.length > 0 ? <pre className="action-stderr">{result.stderr}</pre> : null}
      {result.error !== null ? (
        <p className="action-error" role="alert">
          <span className="action-error-message">{result.error.message}</span>
          {result.error.next !== null ? (
            <span className="action-next">Next: {result.error.next}</span>
          ) : null}
        </p>
      ) : null}
    </output>
  );
}

function ActionButton({
  action,
  pending,
  reason,
  onReasonChange,
  onRun,
  flags,
  blockedBy,
}: {
  readonly action: WebAction;
  readonly pending: boolean;
  readonly reason: string;
  readonly onReasonChange: (reason: string) => void;
  readonly onRun: (action: WebAction) => void;
  readonly flags: readonly ApprovalFlag[];
  readonly blockedBy: readonly string[];
}): ReactElement {
  const reject = action.verb === 'reject';
  const needsReason = reject && reason.trim().length === 0;
  const blocked = blockedBy.length > 0;
  return (
    <div className="action-item">
      <button
        type="button"
        className="action-button"
        disabled={pending || needsReason || blocked}
        onClick={() => onRun(action)}
      >
        {buttonLabel(action)}
      </button>
      {blocked ? (
        <p className="action-blocked" role="note">
          Open each red notice to approve: {blockedBy.join(', ')}
        </p>
      ) : null}
      <ApprovalFlags flags={flags} />
      {reject ? (
        <label className="action-reason">
          Reason
          <input
            type="text"
            className="action-reason-input"
            aria-label={`Reason for ${action.command}`}
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
          />
        </label>
      ) : null}
    </div>
  );
}

/**
 * The change view's action buttons and the last answer, rendered only from
 * props. The panel above owns loading, the pending flag, the reason, and the
 * result.
 */
export function ChangeActions({
  document,
  pending,
  result,
  reason,
  onReasonChange,
  onRun,
  flags = [],
  approveBlockedBy = [],
}: ChangeActionsProps): ReactElement {
  const hasApprove = document.actions.some((action) => action.verb === 'approve');
  return (
    <section className="change-actions" aria-label="Actions">
      <h3>Actions</h3>
      {hasApprove ? null : <ApprovalFlags flags={flags} />}
      <div className="action-buttons">
        {document.actions.map((action) => (
          <ActionButton
            key={`${action.verb}:${action.target ?? ''}`}
            action={action}
            pending={pending}
            reason={reason}
            onReasonChange={onReasonChange}
            onRun={onRun}
            flags={action.verb === 'approve' ? flags : []}
            blockedBy={action.verb === 'approve' ? approveBlockedBy : []}
          />
        ))}
      </div>
      {document.manual.length > 0 ? (
        <ul className="action-manual">
          {document.manual.map((command) => (
            <li key={command}>
              <code>{command}</code>
            </li>
          ))}
        </ul>
      ) : null}
      {pending ? <output className="action-pending">Running…</output> : null}
      {result !== null ? <ActionResult result={result} /> : null}
    </section>
  );
}
