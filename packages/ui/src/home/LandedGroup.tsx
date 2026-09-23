import type { ReactElement } from 'react';
import type { Inbox } from '../contracts.js';
import type { Route } from '../router.js';
import { routeToHash } from '../router.js';

type LandedItem = Inbox['landed'][number];

export interface LandedGroupProps {
  readonly items: readonly LandedItem[];
  readonly onNavigate: (route: Route) => void;
}

/** The home view's landed group: archive time since the last CLI look. */
export function LandedGroup({ items, onNavigate }: LandedGroupProps): ReactElement {
  return (
    <section className="home-group home-landed" aria-labelledby="home-landed-title">
      <h2 id="home-landed-title">Landed since last look</h2>
      {items.length === 0 ? (
        <p className="state state-empty">Nothing landed since your last look.</p>
      ) : (
        <ul className="home-list">
          {items.map((item, index) => {
            const route: Route = { name: 'change', folderKey: item.change.id };
            return (
              <li key={`${item.change.id}-${index}`}>
                <a
                  href={routeToHash(route)}
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigate(route);
                  }}
                >
                  {item.change.id}: {item.change.title}
                </a>
                <span className="home-archived"> — archived {item.archivedAt}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
