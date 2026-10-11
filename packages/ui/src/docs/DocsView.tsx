import type { ReactElement } from 'react';
import type { DocsSite } from '../contracts.js';
import type { Route } from '../router.js';
import { DocsAdr } from './DocsAdr.js';
import { DocsCapability } from './DocsCapability.js';
import { DocsIndex } from './DocsIndex.js';

export interface DocsViewProps {
  readonly site: DocsSite;
  readonly route: Route;
  readonly onNavigate: (route: Route) => void;
}

/** A name or number the site lacks shows one line instead of a page. */
function NoSuchPage(): ReactElement {
  return <p className="state state-empty">No such page.</p>;
}

/**
 * The docs section: the index, one capability page, or one ADR page, chosen by
 * the route. A capability name or ADR number the site lacks shows
 * `No such page.`.
 *
 * @scenario web-inspection: Docs index view
 * @scenario web-inspection: Capability and ADR views
 * @adr 016
 */
export function DocsView({ site, route, onNavigate }: DocsViewProps): ReactElement {
  if (route.name === 'docs-capability') {
    const page = site.capabilities.find((entry) => entry.name === route.capability);
    return page === undefined ? (
      <NoSuchPage />
    ) : (
      <DocsCapability page={page} onNavigate={onNavigate} />
    );
  }
  if (route.name === 'docs-adr') {
    const page = site.adrs.find((entry) => entry.number === route.number);
    return page === undefined ? <NoSuchPage /> : <DocsAdr page={page} onNavigate={onNavigate} />;
  }
  return <DocsIndex site={site} onNavigate={onNavigate} />;
}
