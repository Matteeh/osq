import type { ReactElement } from 'react';

/** The dashboard's one status vocabulary; manual reuses the verified color. */
export type Status = 'verified' | 'manual' | 'dead' | 'regressed' | 'running' | 'pending';

export interface StatusBadgeProps {
  readonly status: Status;
}

const STATUS_COLOR: Record<Status, string> = {
  verified: '--status-verified',
  manual: '--status-verified',
  dead: '--status-dead',
  regressed: '--status-regressed',
  running: '--status-running',
  pending: '--status-pending',
};

/** One status: an aria-hidden dot in the status color, then the status word. */
export function StatusBadge({ status }: StatusBadgeProps): ReactElement {
  return (
    <span className={`status-badge status-${status}`}>
      <span
        className="status-dot"
        aria-hidden="true"
        style={{ backgroundColor: `var(${STATUS_COLOR[status]})` }}
      />
      {status}
    </span>
  );
}

/** Maps a derived task state onto the dashboard status vocabulary. */
export function statusForTaskState(state: string): Status {
  switch (state) {
    case 'done':
      return 'verified';
    case 'manual':
      return 'manual';
    case 'dead':
      return 'dead';
    case 'regressed':
      return 'regressed';
    case 'running':
      return 'running';
    default:
      return 'pending';
  }
}
