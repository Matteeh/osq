import type { Inbox } from '../contracts.js';

type NeedsYouKind = Inbox['needsYou'][number]['kind'];

const NEEDS_YOU_LABELS: Record<NeedsYouKind, string> = {
  planning: 'needs planning',
  approval: 'awaiting approval',
  'task-dead': 'task dead',
  'task-regressed': 'task regressed',
  'change-regressed': 'change regressed',
  'verification-pending': 'verification pending',
  'verification-failed': 'verification failed',
};

/** The words a needs-you kind reads as on the home view. */
export function needsYouKindLabel(kind: NeedsYouKind): string {
  return NEEDS_YOU_LABELS[kind];
}
