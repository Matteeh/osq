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
  'validator-failing': 'validator failing',
  'autopilot-stopped': 'autopilot stopped',
  'overlap-reapproved': 'overlap approved again',
};

/**
 * The words a needs-you kind reads as on the home view.
 *
 * @scenario web-inspection: Not landed label
 * @scenario web-inspection: After-land failed label
 * @scenario web-inspection: Validator failing label
 * @scenario web-inspection: Autopilot stopped label
 * @scenario web-inspection: Overlap approved again label
 * @adr 021
 * @adr 010
 */
export function needsYouKindLabel(kind: NeedsYouKind): string {
  return NEEDS_YOU_LABELS[kind];
}
