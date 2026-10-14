import type { ReactElement } from 'react';
import type { WebActionResult } from '../contracts.js';

export interface ActionResultProps {
  readonly result: WebActionResult;
}

/**
 * The last tap's answer: its exit code, the captured stdout and stderr, and on
 * failure the error message with its `Next:` step.
 *
 * @scenario web-inspection: Result after a tap
 * @adr 013
 */
export function ActionResult({ result }: ActionResultProps): ReactElement {
  return (
    <output className="action-result">
      <p className="action-exit">Exit code {result.exitCode}</p>
      {result.stdout.length > 0 ? <pre className="action-stdout">{result.stdout}</pre> : null}
      {result.stderr.length > 0 ? <pre className="action-stderr">{result.stderr}</pre> : null}
      {result.error !== null ? (
        <p className="action-error" role="alert">
          <span className="action-error-message">{result.error.message}</span>
          {result.error.next !== null ? (
            <span className="action-next">Next: {result.error.next}</span>
          ) : null}
        </p>
      ) : null}
    </output>
  );
}
