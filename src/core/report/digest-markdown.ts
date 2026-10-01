/** Deterministic Markdown rendering of the change digest. */

import type {
  ChangeDigest,
  DigestAdrEntry,
  DigestCapability,
  DigestChange,
  DigestSelection,
  DigestTasks,
} from './change-digest.js';
import { formatCost, formatDuration } from './report.js';

const NOT_RECORDED = 'not recorded';

/** `# osq digest: ...` heading naming the selection. */
function selectionHeading(selection: DigestSelection): string {
  if (selection.kind === 'ids') return `# osq digest: ${selection.ids.join(', ')}`;
  if (selection.until === null) return `# osq digest: since ${selection.since}`;
  return `# osq digest: ${selection.since} to ${selection.until}`;
}

/** The heading and empty-range message, or just the heading for a selection. */
function emptyMessage(selection: DigestSelection): string {
  if (selection.kind === 'ids') return 'No changes selected.';
  if (selection.until === null) return `No changes archived since ${selection.since}.`;
  return `No changes archived from ${selection.since} to ${selection.until}.`;
}

/** One capability and the requirement bullets its delta wrote. */
function formatCapability(capability: DigestCapability): string {
  const bullets: string[] = [];
  for (const entry of capability.added) bullets.push(`- Added: ${entry.name}`);
  for (const entry of capability.modified) bullets.push(`- Modified: ${entry.name}`);
  for (const entry of capability.removed) bullets.push(`- Removed: ${entry.name}`);
  for (const entry of capability.renamed) bullets.push(`- Renamed: ${entry.from} → ${entry.name}`);
  return `#### ${capability.name}\n\n${bullets.length > 0 ? bullets.join('\n') : '- none'}`;
}

function formatRequirements(capabilities: readonly DigestCapability[]): string {
  if (capabilities.length === 0) return '### Requirements\n\nnone';
  return `### Requirements\n\n${capabilities.map(formatCapability).join('\n\n')}`;
}

function formatDecisions(decisions: readonly DigestAdrEntry[]): string {
  if (decisions.length === 0) return '### Decisions\n\nnone';
  const bullets = decisions.map((entry) => `- ADR ${entry.number}: ${entry.rule ?? NOT_RECORDED}`);
  return `### Decisions\n\n${bullets.join('\n')}`;
}

function formatDead(tasks: DigestTasks): string {
  if (tasks.dead === null) return NOT_RECORDED;
  if (tasks.dead.length === 0) return 'none';
  return tasks.dead.map((entry) => `task ${entry.task} (${entry.reason})`).join('; ');
}

function formatTasks(tasks: DigestTasks): string {
  const bullets = [
    `- Tasks: ${tasks.count}`,
    `- Attempts: ${tasks.attempts ?? NOT_RECORDED}`,
    `- Dead: ${formatDead(tasks)}`,
    `- Halts that needed a human: ${tasks.halts ?? NOT_RECORDED}`,
  ];
  return `### Tasks\n\n${bullets.join('\n')}`;
}

function formatModels(change: DigestChange, models: readonly string[]): string {
  const list = models.length > 0 ? models.join(', ') : 'none';
  return `Models: ${list}; planner ${change.planner ?? NOT_RECORDED}`;
}

function formatRun(change: DigestChange): string | null {
  const bullets = [
    `- Elapsed: ${change.elapsedMs === null ? NOT_RECORDED : formatDuration(change.elapsedMs)}`,
  ];
  if (change.cost !== undefined) {
    bullets.push(`- Cost: ${change.cost === null ? NOT_RECORDED : formatCost(change.cost)}`);
  }
  if (change.executorModels !== undefined) {
    bullets.push(`- ${formatModels(change, change.executorModels)}`);
  }
  return `### Run\n\n${bullets.join('\n')}`;
}

/** One change's Markdown block. */
function formatChange(change: DigestChange): string {
  const parts = [
    `## ${change.id} ${change.title ?? NOT_RECORDED}`,
    `Archived: ${change.archivedOn ?? NOT_RECORDED}`,
    `### Goal\n\n${change.goal ?? NOT_RECORDED}`,
    formatRequirements(change.capabilities),
    formatDecisions(change.decisions),
    formatTasks(change.tasks),
  ];
  const run = formatRun(change);
  if (run !== null) parts.push(run);
  return parts.join('\n\n');
}

/** The range's `## Period` totals. */
function formatPeriod(digest: ChangeDigest): string | null {
  const period = digest.period;
  if (period === null) return null;
  const capabilities =
    period.capabilities.length > 0
      ? period.capabilities.map((entry) => `${entry.name} (${entry.changes})`).join(', ')
      : 'none';
  const adrs =
    period.adrs.length > 0
      ? period.adrs.map((adr) => `ADR ${adr.number} ${adr.title} (${adr.date})`).join('; ')
      : 'none';
  const requirements = period.requirements;
  const bullets = [
    `- Changes: ${period.changeCount}`,
    `- Requirements: ${requirements.added} added, ${requirements.modified} modified, ${requirements.removed} removed, ${requirements.renamed} renamed`,
    `- Capabilities: ${capabilities}`,
    `- ADRs dated in range: ${adrs}`,
    `- Halts that needed a human: ${period.halts}`,
    `- Elapsed: ${formatDuration(period.elapsedMs.total)} (${period.elapsedMs.recorded} of ${period.changeCount} changes recorded)`,
  ];
  if (period.cost !== undefined) {
    bullets.push(
      `- Cost: ${formatCost(period.cost.total)} (${period.cost.recorded} of ${period.changeCount} changes reported)`,
    );
  }
  return `## Period\n\n${bullets.join('\n')}`;
}

/** Renders the digest document as stable Markdown. */
export function formatDigestMarkdown(digest: ChangeDigest): string {
  const parts = [selectionHeading(digest.selection)];
  if (digest.changes.length === 0) {
    parts.push(emptyMessage(digest.selection));
    return parts.join('\n\n');
  }
  const period = formatPeriod(digest);
  if (period !== null) parts.push(period);
  for (const change of digest.changes) parts.push(formatChange(change));
  return parts.join('\n\n');
}
