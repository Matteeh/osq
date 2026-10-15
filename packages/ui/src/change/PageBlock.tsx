import type { ReactElement, ReactNode } from 'react';
import type { ApprovalNotices, WebChange } from '../contracts.js';
import { HandoffBlock, type HandoffStart } from './HandoffBlock.js';
import { NoticePanel } from './NoticePanel.js';
import type { ChangePage } from './page-model.js';
import { haltFacts, landLine, landedLine, planningLine, progressLine } from './page-model.js';

export interface PageBlockProps {
  readonly change: WebChange;
  readonly page: ChangePage;
  readonly notices: ApprovalNotices | null;
  readonly onOpenNotice: (id: string) => void;
  /** The Start planning affordance when the change's actions hold a plan. */
  readonly start?: HandoffStart | null;
  /** `planRunLine(change)`: the last planner run's outcome, or null. */
  readonly outcome?: string | null;
  /** The change view's render time, for the planning line. */
  readonly now?: number;
}

/** The next step's detail with its first letter in capitals. */
function capitalize(text: string): string {
  if (text.length === 0) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** One path per line, or nothing when the list is empty. */
function pathList(className: string, paths: readonly string[]): ReactElement | null {
  if (paths.length === 0) return null;
  return (
    <ul className={className}>
      {paths.map((entry) => (
        <li key={entry}>
          <code>{entry}</code>
        </li>
      ))}
    </ul>
  );
}

function runningTask(change: WebChange): ReactElement | null {
  const running = change.tasks.find((task) => task.state === 'running');
  if (running === undefined) return null;
  return <p className="page-task-title">{running.title}</p>;
}

const NOTHING = 'Nothing for you to do. The inbox shows it when it needs you.';

function blockContent({
  change,
  page,
  notices,
  onOpenNotice,
  start = null,
  outcome = null,
  now = Date.now(),
}: PageBlockProps): ReactNode {
  switch (page.state) {
    case 'unplanned': {
      const handoff = change.planHandoff ?? null;
      return handoff === null ? null : (
        <HandoffBlock handoff={handoff} start={start} outcome={outcome} />
      );
    }
    case 'planning':
      return (
        <>
          <p className="page-planning">{planningLine(change, now)}</p>
          <p className="page-note">The plan comes back here when it lints clean.</p>
        </>
      );
    case 'ready-for-approval':
    case 'unknown':
      return notices === null ? null : <NoticePanel notices={notices} onOpen={onOpenNotice} />;
    case 'running':
      return (
        <>
          <p className="page-progress">{progressLine(change)}</p>
          {runningTask(change)}
          <p className="page-note">{NOTHING}</p>
        </>
      );
    case 'blocked': {
      const detail = change.nextStep?.detail ?? null;
      return (
        <>
          <p className="page-progress">{progressLine(change)}</p>
          {detail === null ? null : <p className="page-detail">{capitalize(detail)}</p>}
          {runningTask(change)}
          <p className="page-note">{NOTHING}</p>
        </>
      );
    }
    case 'dead': {
      const facts = haltFacts(change);
      return (
        <>
          <p className="page-halt">{facts.heading}</p>
          <p className="page-reason">Reason: {facts.reason}</p>
          {facts.touched.length === 0 ? null : (
            <>
              <p className="page-touched-label">Touched</p>
              {pathList('page-touched', facts.touched)}
            </>
          )}
        </>
      );
    }
    case 'revised': {
      const changed = change.autoSteer?.changed ?? [];
      return (
        <>
          <p className="page-revised">Revised plan ready</p>
          <p className="page-note">The automatic planner changed the plan, and it lints clean.</p>
          {changed.length === 0 ? null : (
            <>
              <p className="page-changed-label">Changed</p>
              {pathList('page-changed', changed)}
            </>
          )}
        </>
      );
    }
    case 'archived': {
      const land = change.land ?? null;
      if (land === null) return null;
      return (
        <>
          <p className="page-land">{landLine(land)}</p>
          {land.diff === null ? null : (
            <p className="page-diff">
              {land.diff.files} files changed, +{land.diff.added} -{land.diff.removed}
            </p>
          )}
        </>
      );
    }
    case 'landed':
      return (
        <>
          <p className="page-landed">Landed</p>
          <p className="page-landed-line">{landedLine(change)}</p>
        </>
      );
    case 'rejected': {
      const reason = change.rejection?.reason ?? null;
      return (
        <p className="page-rejected">{reason === null ? 'Rejected' : `Rejected: ${reason}`}</p>
      );
    }
    default:
      return null;
  }
}

/**
 * The one top block of the change page, chosen by the model's state. It
 * reuses the notice panel and the hand-off block and reads only its props.
 *
 * @scenario web-inspection: Top block per state
 * @scenario web-inspection: Page order
 * @scenario web-inspection: Planning top block
 * @adr 013
 * @adr 019
 */
export function PageBlock(props: PageBlockProps): ReactElement | null {
  const content = blockContent(props);
  if (content === null) return null;
  return <section className="page-block">{content}</section>;
}
