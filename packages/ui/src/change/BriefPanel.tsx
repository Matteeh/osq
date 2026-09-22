import type { ReactElement } from 'react';

export interface BriefPanelProps {
  readonly brief: string | null;
  readonly goal: string;
}

/**
 * The brief body when present; otherwise a visible `brief absent` label and the
 * complete proposal goal. Both bodies are plain escaped React text.
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
      <h3 id="change-brief-title">
        Brief <span className="brief-absent">brief absent</span>
      </h3>
      <p className="brief-absent-note">The complete proposal goal follows.</p>
      <pre className="brief-goal">{goal}</pre>
    </section>
  );
}
