import type { ReactElement } from 'react';
import type { ApprovalFlag } from '../contracts.js';
import { ApprovalFlags } from './ApprovalFlags.js';

export interface DigestPanelProps {
  readonly digestText: string;
  readonly flags?: readonly ApprovalFlag[];
}

/** The rendered approval digest, with its flags when there are no actions. */
export function DigestPanel({ digestText, flags = [] }: DigestPanelProps): ReactElement {
  return (
    <section className="review-digest">
      <h3>Approval digest</h3>
      <pre className="review-text">{digestText}</pre>
      <ApprovalFlags flags={flags} />
    </section>
  );
}
