import type { ReactElement } from 'react';
import type { ApprovalFlag, LandView, WebChange, WebReview } from '../contracts.js';
import { BriefPanel } from './BriefPanel.js';
import { ChangeHeader } from './ChangeHeader.js';
import { DigestPanel } from './DigestPanel.js';
import { LandPanel } from './LandPanel.js';
import { ReviewPanel } from './ReviewPanel.js';
import { TaskTable } from './TaskTable.js';

export interface PageFoldsProps {
  readonly change: WebChange;
  readonly review: WebReview | null;
  readonly land: LandView | null;
  readonly digestFlags: readonly ApprovalFlag[];
}

function doneCount(change: WebChange): number {
  return change.tasks.filter((task) => task.state === 'done').length;
}

function Fold({
  title,
  children,
}: { readonly title: string; readonly children: ReactElement }): ReactElement {
  return (
    <details className="page-fold">
      <summary>{title}</summary>
      {children}
    </details>
  );
}

/**
 * The folded details of the change page, closed at first: the brief, the
 * plan, the land view, the task table inside its own scroll container, the
 * approval digest, and the header's change facts.
 *
 * @scenario web-inspection: Page order
 * @adr 013
 */
export function PageFolds({ change, review, land, digestFlags }: PageFoldsProps): ReactElement {
  const tasksCount = change.tasks.length;
  const tasksTitle = `Tasks · ${doneCount(change)} of ${tasksCount} done`;
  return (
    <>
      <Fold title="Brief">
        <BriefPanel brief={change.brief} goal={change.goal} />
      </Fold>
      {review === null ? null : (
        <Fold title="Plan">
          <ReviewPanel review={review} />
        </Fold>
      )}
      {land === null ? null : (
        <Fold title="Land">
          <LandPanel land={land} />
        </Fold>
      )}
      <Fold title={tasksTitle}>
        <div className="table-scroll">
          <TaskTable tasks={change.tasks} />
        </div>
      </Fold>
      {review === null ? null : (
        <Fold title="Approval digest">
          <DigestPanel digestText={review.digestText} flags={digestFlags} />
        </Fold>
      )}
      <Fold title="About this change">
        <ChangeHeader change={change} />
      </Fold>
    </>
  );
}
