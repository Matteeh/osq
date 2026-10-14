import type { ReactElement } from 'react';
import type { WebTask } from '../../../../src/core/web/web-data-types.js';
import { StatusBadge, statusForTaskState } from '../status.js';
import type { TaskRetry } from './ActionRetry.js';
import { useTaskRetry } from './ActionRetry.js';
import { TaskEvidence } from './TaskEvidence.js';
import {
  UNAVAILABLE,
  costWithCoverage,
  formatCount,
  formatSeconds,
  runningDescription,
} from './format.js';

export interface TaskTableProps {
  readonly tasks: readonly WebTask[];
  /** The task-retry controls; without them the table renders as before. */
  readonly retry?: TaskRetry | null;
}

function TaskRow({
  task,
  retry,
}: {
  readonly task: WebTask;
  readonly retry: TaskRetry | null;
}): ReactElement {
  const running = runningDescription(task);
  return (
    <tr className="task-row" data-task={task.taskNumber}>
      <th scope="row">
        {task.taskNumber}. {task.title}
      </th>
      <td className="task-state">
        <StatusBadge status={statusForTaskState(task.state)} />
        {retry?.targets.includes(task.taskNumber) ? (
          <button
            type="button"
            className="action-retry"
            disabled={retry.pending}
            onClick={() => retry.onRetry(task.taskNumber)}
          >
            Retry task {task.taskNumber}
          </button>
        ) : null}
      </td>
      <td>{formatCount(task.attempts)}</td>
      <td>{task.reason ?? UNAVAILABLE}</td>
      <td>{running ?? formatSeconds(task.duration)}</td>
      <td className="task-cost">{costWithCoverage(task.cost, task.costCoverage)}</td>
      <td>
        <TaskEvidence task={task} />
      </td>
    </tr>
  );
}

/**
 * The semantic summary table of task state, attempts, reason, duration, and
 * cost. A loaded `retry` prop, or the change view's retry context, puts a
 * `Retry task <n>` button in each target task's state cell.
 *
 * @scenario web-inspection: Reject in the menu
 * @adr 013
 */
export function TaskTable({ tasks, retry }: TaskTableProps): ReactElement {
  const contextRetry = useTaskRetry();
  const effective = retry === undefined ? contextRetry : retry;
  if (tasks.length === 0) {
    return <p className="tasks-empty">No tasks are recorded for this change.</p>;
  }
  return (
    <table className="task-table">
      <caption>Task evidence</caption>
      <thead>
        <tr>
          <th scope="col">Task</th>
          <th scope="col">State</th>
          <th scope="col">Attempts</th>
          <th scope="col">Reason</th>
          <th scope="col">Duration</th>
          <th scope="col">Cost</th>
          <th scope="col">Evidence</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((task) => (
          <TaskRow key={task.taskNumber} task={task} retry={effective} />
        ))}
      </tbody>
    </table>
  );
}
