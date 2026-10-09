import type { ReactElement } from 'react';
import { useState } from 'react';
import type { WebChange } from '../contracts.js';
import { BriefPanel } from './BriefPanel.js';
import { ChangeActionsPanel } from './ChangeActionsPanel.js';
import { ChangeHeader } from './ChangeHeader.js';
import { DigestPanel } from './DigestPanel.js';
import { LandPanel } from './LandPanel.js';
import { NoticePanel } from './NoticePanel.js';
import { ReviewPanel } from './ReviewPanel.js';
import { TaskTable } from './TaskTable.js';
import type { ActionClient } from './actions-client.js';
import { unopenedRedLabels } from './notice-state.js';

export interface ChangeViewProps {
  readonly change: WebChange;
  readonly error?: string | null;
  readonly onRefresh?: () => void;
  readonly actionClient?: ActionClient;
}

/**
 * The change route: identity and location, the notices an unapproved change
 * must notice, the brief or its absent fallback, and per-task evidence. The
 * view owns no subscription, timer, or marker read.
 */
export function ChangeView({
  change,
  error = null,
  onRefresh,
  actionClient,
}: ChangeViewProps): ReactElement {
  const review = change.review ?? null;
  const land = change.land ?? null;
  const notices = review?.notices ?? null;
  const [opened, setOpened] = useState<readonly string[]>([]);

  const openNotice = (id: string): void => {
    setOpened((current) => (current.includes(id) ? current : [...current, id]));
  };

  const noticeBlock =
    notices === null ? null : <NoticePanel notices={notices} onOpen={openNotice} />;
  const openedForActions = notices === null ? undefined : opened;
  const approveBlockedBy = notices === null ? [] : unopenedRedLabels(notices, opened);

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
        {noticeBlock}
        <BriefPanel brief={change.brief} goal={change.goal} />
        {land !== null ? <LandPanel land={land} /> : null}
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
      {noticeBlock}
      <BriefPanel brief={change.brief} goal={change.goal} />
      {land !== null ? <LandPanel land={land} /> : null}
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
          opened={openedForActions}
          approveBlockedBy={approveBlockedBy}
        />
      ) : null}
    </section>
  );
}
