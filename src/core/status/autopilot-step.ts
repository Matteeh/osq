/**
 * Autopilot's next step: a pure function from the file-derived view to one
 * action. `plan-next`, `plan`, `approve` and `land` name the queue item and,
 * except `plan-next`, its change; `stop` names the reason and the one command
 * that resumes the queue. The rows are checked in the order "Autopilot next
 * step" lists them, and the first that matches wins.
 */

import type { PlanRunView } from '../run/plan-run-record.js';
import type { AutopilotStopReason } from './autopilot-stop.js';
import type { AutopilotView } from './autopilot-view.js';

/** Every step autopilot takes. */
export type AutopilotStepKind =
  | 'done'
  | 'wait'
  | 'plan-next'
  | 'plan'
  | 'approve'
  | 'land'
  | 'stop';

/** One next step. `reason` and `command` are set only for `stop`. */
export interface AutopilotStep {
  readonly kind: AutopilotStepKind;
  /** The queue item's slug, or null when the step names no item. */
  readonly item: string | null;
  /** The item's change id, or null when it has none. */
  readonly change: string | null;
  /** The stop reason; null unless `kind` is `stop`. */
  readonly reason: AutopilotStopReason | null;
  /** The command that resumes the queue; null unless `kind` is `stop`. */
  readonly command: string | null;
  /** The parse error, planner outcome, next step's detail, or empty. */
  readonly detail: string;
}

function step(kind: AutopilotStepKind): AutopilotStep {
  return { kind, item: null, change: null, reason: null, command: null, detail: '' };
}

function withItem(
  kind: AutopilotStepKind,
  item: string,
  change: string | null,
  detail = '',
): AutopilotStep {
  return { ...step(kind), item, change, detail };
}

function stopStep(
  reason: AutopilotStopReason,
  item: string | null,
  change: string | null,
  command: string,
  detail: string,
): AutopilotStep {
  return { kind: 'stop', item, change, reason, command, detail };
}

/** The step for an unapproved change of an autopilot item. */
function unapprovedStep(
  item: string,
  change: string,
  hasMarker: boolean,
  markerStarted: boolean,
  planRun: PlanRunView | null,
): AutopilotStep {
  if (!hasMarker) return withItem('wait', item, change);
  if (!markerStarted) return withItem('plan', item, change);
  const outcome = planRun?.outcome;
  if (outcome === 'running') return withItem('wait', item, change);
  if (outcome === 'ready') return withItem('approve', item, change);
  if (outcome !== undefined) {
    return stopStep('planner_not_ready', item, change, `osq plan ${change}`, outcome);
  }
  return withItem('wait', item, change);
}

/**
 * The one next step for the first queue item that has not landed.
 *
 * @scenario status-inspection: Autopilot steps
 * @adr 021
 */
export function autopilotStep(view: AutopilotView): AutopilotStep {
  if (!view.queue.exists) return step('done');
  if (view.queue.error !== null) {
    return stopStep('queue_unreadable', null, null, 'osq queue', view.queue.error);
  }
  if (view.pauseActive) return step('wait');
  const found = view.firstOpenItem;
  if (found === null) return step('done');
  const slug = found.item.slug;
  const changeId = found.row.changeId;
  if (view.approvedChangeIds.some((id) => id !== changeId)) {
    return withItem('wait', slug, changeId);
  }
  if (changeId === null) {
    if (found.approval === 'unapproved') {
      return stopStep('not_approved', slug, null, 'osq queue approve', '');
    }
    if (found.approval === 'changed') {
      return stopStep('changed_since_approval', slug, null, 'osq queue approve', '');
    }
    return withItem('plan-next', slug, null);
  }
  if (found.row.state === 'rejected') {
    return stopStep('rejected', slug, changeId, 'osq plan --next --replan', '');
  }
  if (found.row.state === 'unplanned') return withItem('plan-next', slug, null);
  const change = found.change;
  if (change === null) return withItem('wait', slug, changeId);
  if (!change.approved) {
    return unapprovedStep(
      slug,
      changeId,
      change.marker !== null,
      change.marker?.plannerStartedAt !== undefined,
      change.planRun,
    );
  }
  const next = change.nextStep;
  if (next.state === 'running' || next.state === 'blocked') return withItem('wait', slug, changeId);
  if (next.state === 'dead') {
    return stopStep('halted', slug, changeId, next.command ?? '', next.detail ?? '');
  }
  if (next.state === 'archived') return withItem('land', slug, changeId);
  return withItem('wait', slug, changeId);
}
