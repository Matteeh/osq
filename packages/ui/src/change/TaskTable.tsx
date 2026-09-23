import type { ReactElement } from 'react';
import type { WebTask } from '../../../../src/core/web/web-data-types.js';
import { StatusBadge, statusForTaskState } from '../status.js';
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
}

function TaskRow({ task }: { readonly task: WebTask }): ReactElement {
  const running = runningDescription(task);
  return (
    <tr className="task-row" data-task={task.taskNumber}>
      <th scope="row">
        {task.taskNumber}. {task.title}
      </th>
      <td className="task-state">
        <StatusBadge status={statusForTaskState(task.state)} />
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

/** The semantic summary table of task state, attempts, reason, duration, and cost. */
export function TaskTable({ tasks }: TaskTableProps): ReactElement {
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
          <TaskRow key={task.taskNumber} task={task} />
        ))}
      </tbody>
    </table>
  );
}
