import type { ReactElement } from 'react';
import type { ApprovalFlag } from '../contracts.js';

export interface ApprovalFlagsProps {
  readonly flags: readonly ApprovalFlag[];
}

/** Each approval flag's label and excerpt, or nothing when there are none. */
export function ApprovalFlags({ flags }: ApprovalFlagsProps): ReactElement | null {
  if (flags.length === 0) return null;
  return (
    <ul className="approval-flags">
      {flags.map((flag) => (
        <li key={flag.id} className="approval-flag">
          <strong>{flag.label}</strong> — {flag.excerpt}
        </li>
      ))}
    </ul>
  );
}
