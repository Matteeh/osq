import type { ReactElement } from 'react';
import type { ApprovalNotice, ApprovalNotices, NoticeSeverity } from '../contracts.js';

export interface NoticePanelProps {
  readonly notices: ApprovalNotices;
  readonly onOpen: (id: string) => void;
}

const SEVERITY_WORD: Record<NoticeSeverity, string> = {
  red: 'Red',
  amber: 'Amber',
  grey: 'Grey',
};

function NoticeItem({
  notice,
  onOpen,
}: {
  readonly notice: ApprovalNotice;
  readonly onOpen: (id: string) => void;
}): ReactElement {
  return (
    <details
      className={`notice notice-${notice.severity}`}
      onToggle={(event) => {
        if (event.currentTarget.open) onOpen(notice.id);
      }}
    >
      <summary className="notice-summary">
        <span className="notice-severity">{SEVERITY_WORD[notice.severity]}</span>{' '}
        <span className="notice-label">{notice.label}</span>
      </summary>
      <p className="notice-detail">{notice.detail}</p>
    </details>
  );
}

/**
 * The `Notices` block that leads the change view: `Nothing unusual` when
 * nothing red or amber fired, one openable item per shown notice, and one item
 * holding the rest when there are more than `maxShown`.
 *
 * @scenario web-inspection: Nothing unusual
 * @scenario web-inspection: Folded notices
 */
export function NoticePanel({ notices, onOpen }: NoticePanelProps): ReactElement {
  const shown = notices.notices.slice(0, notices.maxShown);
  const folded = notices.notices.slice(notices.maxShown);
  return (
    <section className="notices" aria-labelledby="notices-title">
      <h3 id="notices-title">Notices</h3>
      {notices.unusual ? null : <p className="notices-none">Nothing unusual</p>}
      {shown.map((notice) => (
        <NoticeItem key={notice.id} notice={notice} onOpen={onOpen} />
      ))}
      {folded.length > 0 ? (
        <details className="notices-folder">
          <summary className="notice-summary">{folded.length} more</summary>
          {folded.map((notice) => (
            <NoticeItem key={notice.id} notice={notice} onOpen={onOpen} />
          ))}
        </details>
      ) : null}
    </section>
  );
}
