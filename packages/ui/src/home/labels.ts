import type { Inbox } from '../contracts.js';

type NeedsYouKind = Inbox['needsYou'][number]['kind'];

const NEEDS_YOU_LABELS: Record<NeedsYouKind, string> = {
  planning: 'needs planning',
  approval: 'awaiting approval',
  'task-dead': 'task dead',
  'task-regressed': 'task regressed',
  'change-regressed': 'change regressed',
  'change-archived': 'not landed',
  'after-land-failed': 'after-land failed',
};

/**
 * The words a needs-you kind reads as on the home view.
 *
 * @scenario web-inspection: Not landed label
 * @scenario web-inspection: After-land failed label
 */
export function needsYouKindLabel(kind: NeedsYouKind): string {
  return NEEDS_YOU_LABELS[kind];
}
