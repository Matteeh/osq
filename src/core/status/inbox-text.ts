import { formatDuration } from '../report/report.js';
import type { Inbox, LandedItem, NeedsYouItem, RunningItem } from './inbox.js';

function needsYouLine(item: NeedsYouItem): string {
  const head = `  ${item.change.id}: ${item.change.title}`;
  if (item.kind === 'planning') return `${head} — unplanned — ${item.command}`;
  if (item.kind === 'approval') {
    return item.beforeApproval
      ? `${head} — do the steps before approval first — ${item.command}`
      : `${head} — ${item.command}`;
  }
  if (item.kind === 'change-archived') {
    return `${head} — archived, not landed — ${item.command}`;
  }
  if (item.kind === 'change-regressed' && !item.steering) {
    return `${head} — change regressed — ${item.command}`;
  }
  const task = item.task;
  const row = task ? `${head} — task ${task.number}: ${task.title}` : head;
  if (item.steering) {
    const need = item.blocked ? `: ${item.blocked.need.replace(/\s+/g, ' ')}` : '';
    return `${row} — needs steering: ${item.steering.trigger} (${item.steering.reason})${need} — ${item.command}`;
  }
  return `${row} — ${item.command}`;
}

function runningLine(item: RunningItem): string {
  const duration = formatDuration(item.elapsedSeconds * 1000);
  return `  ${item.change.id}: ${item.change.title} — task ${item.task.number}: ${item.task.title} — ${duration} — ${item.command}`;
}

/**
 * The `— disclosed: ...` suffix for a landed item whose tasks disclosed a gap.
 * Counts appear in the order deviated, missing context, outside scope, and an
 * item without disclosures contributes nothing.
 */
function disclosedSuffix(item: LandedItem): string {
  const disclosures = item.disclosures;
  if (!disclosures) return '';
  const parts: string[] = [];
  if (disclosures.deviated > 0) parts.push(`deviated ${disclosures.deviated}`);
  if (disclosures.missingContext > 0) parts.push(`missing context ${disclosures.missingContext}`);
  if (disclosures.outsideScope > 0) parts.push(`outside scope ${disclosures.outsideScope}`);
  return parts.length > 0 ? ` — disclosed: ${parts.join(', ')}` : '';
}

function landedLine(item: LandedItem): string {
  return `  ${item.change.id}: ${item.change.title} — archived ${item.archivedAt}${disclosedSuffix(item)} — ${item.command}`;
}

/**
 * Concise text rendering of the three inbox groups.
 *
 * @scenario status-inspection: Archived change waiting to land
 */
export function formatInboxText(inbox: Inbox): string {
  const { needsYou, running, landed } = inbox;
  if (needsYou.length === 0 && running.length === 0 && landed.length === 0) {
    return 'Inbox empty.';
  }

  const lines: string[] = ['Needs you'];
  if (needsYou.length === 0) lines.push('  (none)');
  else for (const item of needsYou) lines.push(needsYouLine(item));

  lines.push('Running');
  if (running.length === 0) lines.push('  (none)');
  else for (const item of running) lines.push(runningLine(item));

  lines.push('Landed since last look');
  if (landed.length === 0) lines.push('  (none)');
  else for (const item of landed) lines.push(landedLine(item));

  return lines.join('\n');
}
