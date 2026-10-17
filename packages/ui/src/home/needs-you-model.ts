import type { Inbox } from '../contracts.js';
import type { Route } from '../router.js';

type NeedsYouItem = Inbox['needsYou'][number];

/**
 * The route a needs-you row links to, or null when the row names no change.
 * Only an autopilot stop before its queue item has a change is plain text.
 *
 * @scenario web-inspection: Stop rows on the home view
 * @adr 020
 * @adr 021
 */
export function needsYouRoute(item: NeedsYouItem): Route | null {
  if (item.kind === 'autopilot-stopped' && (item.autopilotStopped?.change ?? null) === null) {
    return null;
  }
  return { name: 'change', folderKey: item.change.id };
}

/**
 * The reason text a needs-you row reads after its title, or null when it
 * reads none. Only an autopilot stop shows ` — <reason>`.
 *
 * @scenario web-inspection: Stop rows on the home view
 * @adr 020
 * @adr 021
 */
export function needsYouReason(item: NeedsYouItem): string | null {
  if (item.kind !== 'autopilot-stopped') return null;
  const reason = item.autopilotStopped?.reason;
  return reason === undefined ? null : ` — ${reason}`;
}
