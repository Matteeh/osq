import type { ReactElement } from 'react';
import type { WebChange } from '../contracts.js';
import { BriefPanel } from './BriefPanel.js';
import { ChangeHeader } from './ChangeHeader.js';
import { TaskTable } from './TaskTable.js';

export interface ChangeViewProps {
  readonly change: WebChange;
  readonly error?: string | null;
  readonly onRefresh?: () => void;
}

/**
 * The change route: identity and location, the brief or its absent fallback,
 * and per-task summary and evidence. The view owns no subscription, timer, or
 * marker read; it renders exactly the `WebChange` it is given.
 */
export function ChangeView({ change, error = null, onRefresh }: ChangeViewProps): ReactElement {
  return (
    <section className="view change-view" aria-labelledby="change-view-title">
      <h2 id="change-view-title">{change.title}</h2>
      <ChangeHeader change={change} />
      {error !== null ? (
        <p className="state state-error" role="alert">
          {error}{' '}
          {onRefresh !== undefined ? (
            <button type="button" className="change-retry" onClick={onRefresh}>
              Retry
            </button>
          ) : null}
        </p>
      ) : null}
      <BriefPanel brief={change.brief} goal={change.goal} />
      <TaskTable tasks={change.tasks} />
    </section>
  );
}
