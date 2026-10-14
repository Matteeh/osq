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

/** Format a pause time from its ISO string, as `YYYY-MM-DD HH:MM UTC`. */
function formatPausedUntil(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number): string => String(value).padStart(2, '0');
  const day = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  return `${day} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

/**
 * The home view's running group: task identity and server-derived elapsed time,
 * or the pause time for a paused item.
 *
 * @scenario web-inspection: Paused task on home
 */
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
            const timing =
              'pausedUntil' in item
                ? `paused until ${formatPausedUntil(item.pausedUntil)}`
                : `${formatSeconds(item.elapsedSeconds)} elapsed`;
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
                  — task {item.task.number}: {item.task.title} — {timing}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
