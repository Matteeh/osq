import { createContext, useContext } from 'react';

/**
 * The task-table retry controls the change view derives from its loaded
 * actions: the task numbers a `retry` action targets, whether a tap is
 * running, and the tap itself.
 */
export interface TaskRetry {
  /** The task numbers the loaded actions let a human retry, in action order. */
  readonly targets: readonly string[];
  /** True while one tap runs; every retry button is disabled. */
  readonly pending: boolean;
  readonly onRetry: (target: string) => void;
}

/**
 * Carries the one actions hook's retry controls from `ChangeView` down to
 * `TaskTable`, so the task table keeps its prop-free rendering in `PageFolds`
 * while a loaded `retry` still lands in its row.
 *
 * @scenario web-inspection: Reject in the menu
 * @adr 013
 */
export const TaskRetryContext = createContext<TaskRetry | null>(null);

/**
 * The retry controls in context, or null outside the change view.
 *
 * @scenario web-inspection: Reject in the menu
 * @adr 013
 */
export function useTaskRetry(): TaskRetry | null {
  return useContext(TaskRetryContext);
}
