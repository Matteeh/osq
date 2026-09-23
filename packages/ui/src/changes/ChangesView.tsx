import type { ReactElement } from 'react';
import type { WebGraph } from '../contracts.js';
import type { Route } from '../router.js';
import { ChangesTable } from './ChangesTable.js';
import { orderChangeNodes } from './order.js';

export interface ChangesViewProps {
  readonly graph: WebGraph;
  readonly onNavigate: (route: Route) => void;
}

/** The changes route: every change once, active first, each linking to its page. */
export function ChangesView({ graph, onNavigate }: ChangesViewProps): ReactElement {
  return (
    <section className="view changes-view" aria-labelledby="changes-view-title">
      <h2 id="changes-view-title">Changes</h2>
      <ChangesTable changes={orderChangeNodes(graph.changes)} onNavigate={onNavigate} />
    </section>
  );
}
