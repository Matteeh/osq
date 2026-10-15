import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import type { WebAction, WebActionsDocument, WebChange } from '../contracts.js';
import { ActionButtons } from './ActionButtons.js';
import { ActionMenu } from './ActionMenu.js';
import { ActionResult } from './ActionResult.js';
import { TaskRetryContext } from './ActionRetry.js';
import { HandoffBlock, type HandoffStart } from './HandoffBlock.js';
import { PageBlock } from './PageBlock.js';
import { PageFolds } from './PageFolds.js';
import type { ActionClient } from './actions-client.js';
import { unopenedRedLabels } from './notice-state.js';
import { type ChangePageState, changePage, planRunLine } from './page-model.js';
import { useChangeActions } from './useChangeActions.js';

/** How often the page re-renders while a planner runs. */
export const PLANNING_REFRESH_MS = 30_000;

/**
 * The time of the current render, re-rendering every 30 seconds while the page
 * is `planning` so the minutes move without a new document. Cleared otherwise.
 * Uses an abort timeout so the change sources stay free of timer identifiers.
 */
function usePlanningNow(state: ChangePageState): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (state !== 'planning') return;
    const signal = AbortSignal.timeout(PLANNING_REFRESH_MS);
    signal.onabort = () => setTick(tick + 1);
    return () => {
      signal.onabort = null;
    };
  }, [state, tick]);
  return Date.now();
}

/**
 * The change's plan action as a hand-off start, or null when the loaded
 * actions hold no `plan` action. A static export loads no actions, so its
 * hand-off blocks show no Start planning button.
 *
 * @scenario web-inspection: Start planning button
 * @scenario web-inspection: No start without the action
 * @adr 013
 * @adr 019
 */
export function planStart(
  document: WebActionsDocument | null,
  pending: boolean,
  run: (action: WebAction) => void,
): HandoffStart | null {
  const action = document?.actions.find((entry) => entry.verb === 'plan');
  if (action === undefined) return null;
  return { pending, onStart: () => run(action) };
}

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
 * subscription or marker read; its one timer re-renders the planning line.
 *
 * @scenario web-inspection: Page order
 * @scenario web-inspection: Top block per state
 * @scenario web-inspection: Plan buttons without an action client
 * @scenario web-inspection: Approval buttons
 * @scenario web-inspection: Static export has no buttons
 * @scenario web-inspection: Start planning button
 * @scenario web-inspection: Start planning after Plan it
 * @scenario web-inspection: Planning top block
 * @adr 013
 * @adr 019
 */
export function ChangeView({
  change,
  error = null,
  onRefresh,
  actionClient,
}: ChangeViewProps): ReactElement {
  const page = changePage(change);
  const now = usePlanningNow(page.state);
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
  const start = planStart(actions.document, actions.pending, actions.run);
  const outcome = planRunLine(change);

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
      {openedHandoff ? (
        <HandoffBlock handoff={planHandoff} start={start} outcome={outcome} />
      ) : null}
      <TaskRetryContext.Provider value={actions.retry}>
        <PageBlock
          change={change}
          page={page}
          notices={notices}
          onOpenNotice={openNotice}
          start={start}
          outcome={outcome}
          now={now}
        />
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
