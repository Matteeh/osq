import type { ReactElement } from 'react';
import type { WebChange } from '../contracts.js';
import { BriefPanel } from './BriefPanel.js';
import { ChangeActionsPanel } from './ChangeActionsPanel.js';
import { ChangeHeader } from './ChangeHeader.js';
import { DigestPanel } from './DigestPanel.js';
import { ReviewPanel } from './ReviewPanel.js';
import { TaskTable } from './TaskTable.js';
import type { ActionClient } from './actions-client.js';

export interface ChangeViewProps {
  readonly change: WebChange;
  readonly error?: string | null;
  readonly onRefresh?: () => void;
  readonly actionClient?: ActionClient;
}

/**
 * The change route: identity and location, the brief or its absent fallback,
 * and per-task summary and evidence. The view owns no subscription, timer, or
 * marker read; it renders exactly the `WebChange` it is given.
 */
export function ChangeView({
  change,
  error = null,
  onRefresh,
  actionClient,
}: ChangeViewProps): ReactElement {
  const review = change.review ?? null;
  if (review === null) {
    return (
      <section className="view change-view" aria-labelledby="change-view-title">
        <h2 id="change-view-title">{change.title}</h2>
        <ChangeHeader change={change} />
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
        <BriefPanel brief={change.brief} goal={change.goal} />
        {actionClient !== undefined ? (
          <ChangeActionsPanel
            selector={change.folderKey}
            asOf={change.asOf}
            client={actionClient}
          />
        ) : null}
        <TaskTable tasks={change.tasks} />
      </section>
    );
  }
  return (
    <section className="view change-view" aria-labelledby="change-view-title">
      <h2 id="change-view-title">{change.title}</h2>
      <ChangeHeader change={change} />
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
      <BriefPanel brief={change.brief} goal={change.goal} />
      <ReviewPanel review={review} />
      <TaskTable tasks={change.tasks} />
      <DigestPanel
        digestText={review.digestText}
        flags={actionClient === undefined ? review.digest.flags : []}
      />
      {actionClient !== undefined ? (
        <ChangeActionsPanel
          selector={change.folderKey}
          asOf={change.asOf}
          client={actionClient}
          flags={review.digest.flags}
        />
      ) : null}
    </section>
  );
}
