import type { ReactElement } from 'react';
import type { WebChange } from '../contracts.js';
import { formatTimestamp, plannerLabel } from './format.js';

export interface ChangeHeaderProps {
  readonly change: WebChange;
}

/** One runs-after entry exactly as `osq show` prints it, joined with `, `. */
function runsAfterLabel(entries: NonNullable<WebChange['runsAfter']>): string {
  return entries
    .map((entry) => {
      if (entry.capabilities === null) return `${entry.folder} (depends_on)`;
      const suffix = entry.reapproved === true ? '; approved again since' : '';
      return `${entry.folder} (also writes ${entry.capabilities.join(', ')}${suffix})`;
    })
    .join(', ');
}

/**
 * Folder identity, location-derived state, nullable planner, and derivation time.
 *
 * @scenario web-inspection: Change view names what it runs after
 * @scenario web-inspection: No row without a wait
 * @scenario web-inspection: Change view names a re-approved overlap
 * @adr 013
 */
export function ChangeHeader({ change }: ChangeHeaderProps): ReactElement {
  return (
    <dl className="change-meta">
      <dt>Folder key</dt>
      <dd>{change.folderKey}</dd>
      <dt>Location</dt>
      <dd>{change.location}</dd>
      <dt>State</dt>
      <dd>{change.state}</dd>
      {change.runsAfter !== undefined && change.runsAfter.length > 0 ? (
        <>
          <dt>Runs after</dt>
          <dd>{runsAfterLabel(change.runsAfter)}</dd>
        </>
      ) : null}
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
