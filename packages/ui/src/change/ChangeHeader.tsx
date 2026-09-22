import type { ReactElement } from 'react';
import type { WebChange } from '../contracts.js';
import { formatTimestamp, plannerLabel } from './format.js';

export interface ChangeHeaderProps {
  readonly change: WebChange;
}

/** Folder identity, location-derived state, nullable planner, and derivation time. */
export function ChangeHeader({ change }: ChangeHeaderProps): ReactElement {
  return (
    <dl className="change-meta">
      <dt>Folder key</dt>
      <dd>{change.folderKey}</dd>
      <dt>Location</dt>
      <dd>{change.location}</dd>
      <dt>State</dt>
      <dd>{change.state}</dd>
      <dt>Planner</dt>
      <dd>{plannerLabel(change.planner)}</dd>
      <dt>Derived</dt>
      <dd>{formatTimestamp(change.asOf)}</dd>
      {change.rejection !== null ? (
        <>
          <dt>Rejection</dt>
          <dd>
            {change.rejection.reason} at {formatTimestamp(change.rejection.timestamp)}
          </dd>
        </>
      ) : null}
    </dl>
  );
}
