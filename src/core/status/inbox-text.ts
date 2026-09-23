import { formatDuration } from '../report/report.js';
import type { Inbox, InboxTaskRef, LandedItem, NeedsYouItem, RunningItem } from './inbox.js';

const REJECT_HINT = '--reason <text>';

function needsYouLine(item: NeedsYouItem): string {
  const head = `  ${item.change.id}: ${item.change.title}`;
  if (item.kind === 'approval') return `${head} — ${item.command}`;
  if (item.kind === 'change-regressed') return `${head} — change regressed — ${item.command}`;
  const task = item.task as InboxTaskRef;
  const row = `${head} — task ${task.number}: ${task.title}`;
  if (!item.stuck) return `${row} — ${item.command}`;
  return `${row} — stuck: same failure twice; amend the spec or osq reject ${item.change.id} ${REJECT_HINT} — ${item.command}`;
}

function runningLine(item: RunningItem): string {
  const duration = formatDuration(item.elapsedSeconds * 1000);
  return `  ${item.change.id}: ${item.change.title} — task ${item.task.number}: ${item.task.title} — ${duration} — ${item.command}`;
}

function landedLine(item: LandedItem): string {
  return `  ${item.change.id}: ${item.change.title} — archived ${item.archivedAt} — ${item.command}`;
}

/** Concise text rendering of the three inbox groups. */
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
