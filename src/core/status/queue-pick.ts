import type { QueueRow, QueueStateSnapshot } from './queue-state.js';

/** The queue row chosen to plan, with its index in the queue file's order. */
export interface QueueRowPick {
  readonly row: QueueRow;
  readonly index: number;
}

export type QueuePickResult =
  | { readonly kind: 'picked'; readonly pick: QueueRowPick }
  | { readonly kind: 'refused'; readonly message: string };

/** Render every row as the no-eligible explanation lists it. */
function summarizeRows(rows: readonly QueueRow[]): string {
  return rows
    .map((row) => {
      const waiting =
        row.unmetDependencies.length > 0 ? ` (waiting on ${row.unmetDependencies.join(', ')})` : '';
      return `  - ${row.slug}: ${row.state}${waiting}`;
    })
    .join('\n');
}

/** The refusal for a named row that cannot be planned yet, or null when it can. */
function namedRefusal(row: QueueRow, slug: string): string | null {
  if (row.state !== 'unplanned' && row.state !== 'rejected') {
    return `Queue item "${slug}" already has change ${row.changeId ?? ''} (${row.state}).`;
  }
  if (row.unmetDependencies.length > 0) {
    return `Queue item "${slug}" is waiting on ${row.unmetDependencies.join(', ')}.`;
  }
  return null;
}

/**
 * Choose the queue row to plan: the named slug when given, otherwise the first
 * unplanned or rejected row whose dependencies and fixes are landed.
 *
 * @scenario cli-foundation: Named queue item
 * @scenario cli-foundation: Named queue item refused
 * @adr 016
 */
export function pickQueueRow(state: QueueStateSnapshot, slug?: string): QueuePickResult {
  if (slug !== undefined) {
    const index = state.rows.findIndex((row) => row.slug === slug);
    if (index === -1) {
      return { kind: 'refused', message: `Queue item "${slug}" is not in the queue.` };
    }
    const row = state.rows[index];
    const refusal = namedRefusal(row, slug);
    if (refusal !== null) return { kind: 'refused', message: refusal };
    return { kind: 'picked', pick: { row, index } };
  }
  const index = state.rows.findIndex(
    (row) =>
      (row.state === 'unplanned' || row.state === 'rejected') && row.unmetDependencies.length === 0,
  );
  if (index === -1) {
    return {
      kind: 'refused',
      message: `No queue item is eligible to plan.\n${summarizeRows(state.rows)}`,
    };
  }
  return { kind: 'picked', pick: { row: state.rows[index], index } };
}
