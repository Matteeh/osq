import type { ReactElement } from 'react';
import { UNAVAILABLE } from './format.js';

export interface ResultDisclosureProps {
  readonly result: string | null;
}

/**
 * Verbatim result text in a native disclosure that is closed initially. An
 * absent or empty result renders explicit unavailable text instead of an empty
 * disclosure.
 */
export function ResultDisclosure({ result }: ResultDisclosureProps): ReactElement {
  const absent = result === null || result.length === 0;
  return (
    <section className="task-result" aria-label="Result">
      <h4>Result</h4>
      {absent ? (
        <p className="evidence-empty">No result recorded ({UNAVAILABLE}).</p>
      ) : (
        <details className="result-disclosure" data-result="true">
          <summary>Show verbatim result</summary>
          <pre className="result-text">{result}</pre>
        </details>
      )}
    </section>
  );
}
