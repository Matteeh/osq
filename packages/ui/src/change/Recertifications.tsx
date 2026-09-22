import type { ReactElement } from 'react';
import type { WebTask } from '../../../../src/core/web-data-types.js';
import { UNAVAILABLE, formatExitCode, formatTimeout, formatTimestamp } from './format.js';

export interface RecertificationsProps {
  readonly task: WebTask;
}

/** Typed human recertification rows in recorded order, or an explicit empty state. */
export function Recertifications({ task }: RecertificationsProps): ReactElement {
  const rows = task.recertifications;
  return (
    <section
      className="task-recertifications"
      aria-label={`Recertifications for task ${task.taskNumber}`}
    >
      <h4>Recertifications</h4>
      {rows.length === 0 ? (
        <p className="evidence-empty">No recertifications recorded.</p>
      ) : (
        <table className="recertification-table">
          <caption>Human recertification history</caption>
          <thead>
            <tr>
              <th scope="col">Actor</th>
              <th scope="col">Outcome</th>
              <th scope="col">Time</th>
              <th scope="col">Verify</th>
              <th scope="col">Exit</th>
              <th scope="col">Timeout</th>
              <th scope="col">Differing paths and attribution</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.taskNumber}-${row.timestamp ?? 'unknown'}-${row.outcome ?? 'none'}-${row.verify ?? 'none'}`}
              >
                <td>{row.actor}</td>
                <td>{row.outcome ?? UNAVAILABLE}</td>
                <td>{formatTimestamp(row.timestamp)}</td>
                <td>
                  <code>{row.verify ?? UNAVAILABLE}</code>
                </td>
                <td>{formatExitCode(row.exitCode)}</td>
                <td>{formatTimeout(row.timedOut)}</td>
                <td>
                  <ul className="recertification-paths">
                    {row.differingPaths.map((differing) => (
                      <li key={differing}>
                        <code>{differing}</code>
                      </li>
                    ))}
                  </ul>
                  <ul className="recertification-attribution">
                    {row.attribution.map((item) => (
                      <li key={`${item.path}:${item.attribution}`}>
                        {item.path}: {item.attribution}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
