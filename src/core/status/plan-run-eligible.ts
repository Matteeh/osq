import type { OsqConfig } from '../foundation/config.js';
import type { WebLocation } from '../web/web-data-types.js';
import type { NextStep } from './next-step.js';

/**
 * Whether a human may start a planner for a change. True only when the change
 * is active, `vcs.enabled` is on, and its next step is `unplanned` or
 * `ready-for-approval`, or is `dead` with detail `needs steering`. Reads only
 * its arguments.
 *
 * @scenario status-inspection: Who may start a planner
 * @adr 019
 */
export function canStartPlanner(next: NextStep, location: WebLocation, config: OsqConfig): boolean {
  if (location !== 'active') return false;
  if (config.vcs?.enabled !== true) return false;
  if (next.state === 'unplanned' || next.state === 'ready-for-approval') return true;
  return next.state === 'dead' && next.detail === 'needs steering';
}
