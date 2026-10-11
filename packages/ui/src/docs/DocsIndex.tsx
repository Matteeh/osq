import type { ReactElement } from 'react';
import type { DocsSite } from '../contracts.js';
import type { Route } from '../router.js';
import { DocsLink } from './DocsLink.js';

export interface DocsIndexProps {
  readonly site: DocsSite;
  readonly onNavigate: (route: Route) => void;
}

/**
 * The docs index: each group in order with one link per capability and its
 * purpose, then each ADR with its number, title and status.
 *
 * @scenario web-inspection: Docs index view
 * @adr 016
 */
export function DocsIndex({ site, onNavigate }: DocsIndexProps): ReactElement {
  const purposes = new Map(site.capabilities.map((page) => [page.name, page.purpose]));
  return (
    <section className="view docs-view" aria-labelledby="docs-index-title">
      <h2 id="docs-index-title">Capabilities</h2>
      {site.groups.map((group) => (
        <section key={group.name} className="docs-group">
          <h3>{group.name}</h3>
          <ul className="docs-list">
            {group.capabilities.map((name) => (
              <li key={name}>
                <DocsLink
                  route={{ name: 'docs-capability', capability: name }}
                  onNavigate={onNavigate}
                >
                  {name}
                </DocsLink>
                : {purposes.get(name) ?? ''}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <h2>Decisions</h2>
      <ul className="docs-list">
        {site.adrs.map((adr) => (
          <li key={adr.number}>
            <DocsLink route={{ name: 'docs-adr', number: adr.number }} onNavigate={onNavigate}>
              ADR {adr.number}: {adr.title} ({adr.status})
            </DocsLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
