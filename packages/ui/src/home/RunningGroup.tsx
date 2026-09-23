import type { ReactElement } from 'react';
import { formatSeconds } from '../change/format.js';
import type { Inbox } from '../contracts.js';
import type { Route } from '../router.js';
import { routeToHash } from '../router.js';
import { StatusBadge } from '../status.js';

type RunningItem = Inbox['running'][number];

export interface RunningGroupProps {
  readonly items: readonly RunningItem[];
  readonly onNavigate: (route: Route) => void;
}

/** The home view's running group: task identity and server-derived elapsed time. */
export function RunningGroup({ items, onNavigate }: RunningGroupProps): ReactElement {
  return (
    <section className="home-group home-running" aria-labelledby="home-running-title">
      <h2 id="home-running-title">Running</h2>
      {items.length === 0 ? (
        <p className="state state-empty">Nothing is running.</p>
      ) : (
        <ul className="home-list">
          {items.map((item, index) => {
            const route: Route = { name: 'change', folderKey: item.change.id };
            return (
              <li key={`${item.change.id}-${item.task.number}-${index}`}>
                <span className="home-kind">
                  <StatusBadge status="running" />
                </span>{' '}
                <a
                  href={routeToHash(route)}
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigate(route);
                  }}
                >
                  {item.change.id}: {item.change.title}
                </a>
                <span className="home-task">
                  {' '}
                  — task {item.task.number}: {item.task.title} —{' '}
                  {formatSeconds(item.elapsedSeconds)} elapsed
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
