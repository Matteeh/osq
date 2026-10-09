import type { ApprovalNotices } from '../contracts.js';
import type { WebActionInput } from './actions-client.js';

/**
 * The labels of red notices the view has not opened, in notice order. Empty
 * exactly when every red notice has been opened or none is red.
 *
 * @scenario web-inspection: Red notice gates Approve
 */
export function unopenedRedLabels(notices: ApprovalNotices, opened: readonly string[]): string[] {
  const open = new Set(opened);
  return notices.notices
    .filter((notice) => notice.severity === 'red' && !open.has(notice.id))
    .map((notice) => notice.label);
}

/**
 * The approve request body: the opened ids sorted when the view has notices to
 * open, and nothing when it does not.
 *
 * @scenario web-inspection: Red notice gates Approve
 */
export function approveInput(opened: readonly string[] | undefined): WebActionInput {
  if (opened === undefined) return { verb: 'approve' };
  return { verb: 'approve', opened: [...opened].sort() };
}
