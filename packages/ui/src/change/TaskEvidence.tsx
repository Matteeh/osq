import type { ReactElement } from 'react';
import type { WebTask } from '../../../../src/core/web/web-data-types.js';
import { Recertifications } from './Recertifications.js';
import { ResultDisclosure } from './ResultDisclosure.js';

export interface TaskEvidenceProps {
  readonly task: WebTask;
}

function List({
  items,
  empty,
  label,
}: {
  readonly items: readonly string[];
  readonly empty: string;
  readonly label: string;
}): ReactElement {
  if (items.length === 0) return <p className="evidence-empty">{empty}</p>;
  return (
    <ul aria-label={label}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * Verbose per-task evidence in a nested native disclosure: declared scope,
 * resolved scope files, acceptance lines, verify command, recertifications, and
 * verbatim results all remain available without interpreting any of it.
 */
export function TaskEvidence({ task }: TaskEvidenceProps): ReactElement {
  return (
    <details className="task-evidence">
      <summary>Task {task.taskNumber} evidence</summary>
      <section className="task-scope" aria-label={`Declared scope for task ${task.taskNumber}`}>
        <h4>Declared scope</h4>
        {task.declaredScope.length === 0 ? (
          <p className="evidence-empty">No declared scope.</p>
        ) : (
          <ul aria-label={`Declared scope entries for task ${task.taskNumber}`}>
            {task.declaredScope.map((entry) => (
              <li key={entry}>
                <code>{entry}</code>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="task-resolved" aria-label={`Resolved scope for task ${task.taskNumber}`}>
        <h4>Resolved scope files</h4>
        {task.resolvedScope.length === 0 ? (
          <p className="evidence-empty">No resolved scope files.</p>
        ) : (
          <ul aria-label={`Resolved scope files for task ${task.taskNumber}`}>
            {task.resolvedScope.map((entry) => (
              <li key={entry.relativePath}>
                <code>{entry.relativePath}</code>
                {entry.absolutePath === null ? ' — not present' : ' — present'}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="task-acceptance" aria-label={`Acceptance for task ${task.taskNumber}`}>
        <h4>Acceptance lines</h4>
        <List
          items={task.acceptance}
          empty="No acceptance lines."
          label={`Acceptance lines for task ${task.taskNumber}`}
        />
      </section>
      <section className="task-verify" aria-label={`Verify command for task ${task.taskNumber}`}>
        <h4>Verify command</h4>
        <pre>{task.verify}</pre>
      </section>
      <Recertifications task={task} />
      <ResultDisclosure result={task.result} />
    </details>
  );
}
