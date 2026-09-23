import type { ReactElement } from 'react';
import type { WebGraph } from '../contracts.js';
import { formatCost } from '../format.js';
import type { Route } from '../router.js';
import { routeToHash } from '../router.js';
import { changeStateLabel } from './labels.js';

type WebChangeNode = WebGraph['changes'][number];

export interface ChangesTableProps {
  readonly changes: readonly WebChangeNode[];
  readonly onNavigate: (route: Route) => void;
}

function changeLabel(node: WebChangeNode): string {
  return node.id === null ? node.title : `${node.id}: ${node.title}`;
}

/** One row per change with state, task progress, costs, and landed date. */
export function ChangesTable({ changes, onNavigate }: ChangesTableProps): ReactElement {
  return (
    <table className="changes-table">
      <thead>
        <tr>
          <th scope="col">Change</th>
          <th scope="col">State</th>
          <th scope="col">Tasks</th>
          <th scope="col">Execution cost</th>
          <th scope="col">Planning cost</th>
          <th scope="col">Landed</th>
        </tr>
      </thead>
      <tbody>
        {changes.map((node) => {
          const route: Route = { name: 'change', folderKey: node.folderKey };
          return (
            <tr key={node.folderKey}>
              <th scope="row">
                <a
                  href={routeToHash(route)}
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigate(route);
                  }}
                >
                  {changeLabel(node)}
                </a>
              </th>
              <td>{changeStateLabel(node)}</td>
              <td>
                {node.doneCount ?? 0} of {node.taskCount}
              </td>
              <td>{formatCost(node.execution.cost, node.execution.costCoverage)}</td>
              <td>{formatCost(node.planning.cost, node.planning.costCoverage)}</td>
              <td>{node.landed ?? '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
