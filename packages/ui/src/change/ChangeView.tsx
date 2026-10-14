import type { ReactElement } from 'react';
import { useState } from 'react';
import type { WebChange } from '../contracts.js';
import { ActionButtons } from './ActionButtons.js';
import { ActionMenu } from './ActionMenu.js';
import { ActionResult } from './ActionResult.js';
import { TaskRetryContext } from './ActionRetry.js';
import { HandoffBlock } from './HandoffBlock.js';
import { PageBlock } from './PageBlock.js';
import { PageFolds } from './PageFolds.js';
import type { ActionClient } from './actions-client.js';
import { unopenedRedLabels } from './notice-state.js';
import { changePage } from './page-model.js';
import { useChangeActions } from './useChangeActions.js';

export interface ChangeViewProps {
  readonly change: WebChange;
  readonly error?: string | null;
  readonly onRefresh?: () => void;
  readonly actionClient?: ActionClient;
}

/**
 * The change route: one page for every change. The head carries the label,
 * title, summary and the actions menu; the top block says what the change
 * needs now; the details are folded below; and the button bar holds the main
 * action plus the plan buttons that open the hand-off. The view owns no
 * subscription, timer, or marker read.
 *
 * @scenario web-inspection: Page order
 * @scenario web-inspection: Top block per state
 * @scenario web-inspection: Plan buttons without an action client
 * @scenario web-inspection: Approval buttons
 * @scenario web-inspection: Static export has no buttons
 * @adr 013
 */
export function ChangeView({
  change,
  error = null,
  onRefresh,
  actionClient,
}: ChangeViewProps): ReactElement {
  const page = changePage(change);
  const review = change.review ?? null;
  const land = change.land ?? null;
  const notices = review?.notices ?? null;
  const planHandoff = change.planHandoff ?? null;
  const [opened, setOpened] = useState<readonly string[]>([]);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const actions = useChangeActions(
    change.folderKey,
    change.asOf,
    actionClient,
    review === null ? undefined : opened,
  );

  const openNotice = (id: string): void => {
    setOpened((current) => (current.includes(id) ? current : [...current, id]));
  };

  const toggleHandoff = (): void => setHandoffOpen((current) => !current);

  const approveBlockedBy = notices === null ? [] : unopenedRedLabels(notices, opened);
  const digestFlags = actionClient === undefined && review !== null ? review.digest.flags : [];
  const showPlanButtons = planHandoff !== null;
  const openedHandoff = handoffOpen && planHandoff !== null && page.state !== 'unplanned';

  return (
    <section className="view change-view" aria-labelledby="change-view-title">
      <p className="page-label">{page.label}</p>
      <h2 id="change-view-title">{change.title}</h2>
      <p className="page-summary">{page.summary}</p>
      {actions.document === null ? null : (
        <ActionMenu
          document={actions.document}
          pending={actions.pending}
          reason={actions.reason}
          onReasonChange={actions.setReason}
          onRun={actions.run}
        />
      )}
      {error !== null ? (
        <p className="state state-error" role="alert">
          {error}{' '}
          {onRefresh !== undefined ? (
            <button type="button" className="change-retry" onClick={onRefresh}>
              Retry
            </button>
          ) : null}
        </p>
      ) : null}
      {openedHandoff ? <HandoffBlock handoff={planHandoff} /> : null}
      <TaskRetryContext.Provider value={actions.retry}>
        <PageBlock change={change} page={page} notices={notices} onOpenNotice={openNotice} />
        <PageFolds change={change} review={review} land={land} digestFlags={digestFlags} />
      </TaskRetryContext.Provider>
      <div className="page-buttons">
        {actions.document === null ? null : (
          <ActionButtons
            document={actions.document}
            main={page.main}
            pending={actions.pending}
            onRun={actions.run}
            flags={review === null ? [] : review.digest.flags}
            approveBlockedBy={approveBlockedBy}
          />
        )}
        {showPlanButtons && page.main === 'plan-it' ? (
          <button type="button" className="page-button" onClick={toggleHandoff}>
            Plan it
          </button>
        ) : null}
        {showPlanButtons && page.second === 'plan-again' ? (
          <button type="button" className="page-button" onClick={toggleHandoff}>
            Plan again
          </button>
        ) : null}
        {showPlanButtons && page.second === 'plan-it-myself' ? (
          <button type="button" className="page-button" onClick={toggleHandoff}>
            Plan it myself
          </button>
        ) : null}
      </div>
      {actions.result === null ? null : <ActionResult result={actions.result} />}
    </section>
  );
}
