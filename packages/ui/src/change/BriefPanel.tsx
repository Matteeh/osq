import type { ReactElement } from 'react';

export interface BriefPanelProps {
  readonly brief: string | null;
  readonly goal: string;
}

/**
 * The brief body when present; otherwise a plain `Brief` heading, a note that
 * the proposal goal follows, and the complete goal. Both bodies are plain
 * escaped React text.
 */
export function BriefPanel({ brief, goal }: BriefPanelProps): ReactElement {
  if (brief !== null && brief.length > 0) {
    return (
      <section className="change-brief" aria-labelledby="change-brief-title">
        <h3 id="change-brief-title">Brief</h3>
        <pre className="brief-body">{brief}</pre>
      </section>
    );
  }
  return (
    <section className="change-brief" aria-labelledby="change-brief-title">
      <h3 id="change-brief-title">Brief</h3>
      <p className="brief-absent">No brief was recorded; the proposal goal follows.</p>
      <pre className="brief-goal">{goal}</pre>
    </section>
  );
}
