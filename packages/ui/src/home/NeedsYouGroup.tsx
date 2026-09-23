import type { ReactElement } from 'react';
import type { Inbox } from '../contracts.js';
import type { Route } from '../router.js';
import { routeToHash } from '../router.js';
import { type Status, StatusBadge } from '../status.js';
import { needsYouKindLabel } from './labels.js';

type NeedsYouItem = Inbox['needsYou'][number];

export interface NeedsYouGroupProps {
  readonly items: readonly NeedsYouItem[];
  readonly onNavigate: (route: Route) => void;
}

function changeRoute(item: NeedsYouItem): Route {
  return { name: 'change', folderKey: item.change.id };
}

/** The task status a needs-you kind names, or null for change-level kinds. */
function taskStatusForKind(kind: NeedsYouItem['kind']): Status | null {
  if (kind === 'task-dead') return 'dead';
  if (kind === 'task-regressed') return 'regressed';
  return null;
}

/** The kind's lead word, kept so the kind still reads in words beside its badge. */
function kindLead(kind: NeedsYouItem['kind']): string | null {
  if (kind === 'task-dead' || kind === 'task-regressed') return 'task';
  return null;
}

/** The home view's attention group: one actionable row per needs-you item. */
export function NeedsYouGroup({ items, onNavigate }: NeedsYouGroupProps): ReactElement {
  return (
    <section className="home-group home-needs-you" aria-labelledby="home-needs-you-title">
      <h2 id="home-needs-you-title">Needs you</h2>
      {items.length === 0 ? (
        <p className="state state-empty">Nothing needs your attention.</p>
      ) : (
        <ul className="home-list">
          {items.map((item, index) => {
            const route = changeRoute(item);
            const status = taskStatusForKind(item.kind);
            const lead = kindLead(item.kind);
            return (
              <li key={`${item.change.id}-${item.kind}-${index}`}>
                <span className="home-kind">
                  {status === null || lead === null ? (
                    needsYouKindLabel(item.kind)
                  ) : (
                    <>
                      {lead} <StatusBadge status={status} />
                    </>
                  )}
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
                {item.task === null ? null : (
                  <span className="home-task">
                    {' '}
                    — task {item.task.number}: {item.task.title}
                  </span>
                )}{' '}
                <code>{item.command}</code>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
