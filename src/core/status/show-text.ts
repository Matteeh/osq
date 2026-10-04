import { formatDuration } from '../report/report.js';
import { formatNextStep } from './next-step.js';
import { formatFocusedRuns, formatMutationRuns } from './show-run-lines.js';
import {
  formatDependenciesAdded,
  formatDisclosures,
  formatInstructionsChanged,
  formatPreSpawnVerify,
  formatRetries,
  formatStuck,
  formatTaskScenarios,
} from './show-task-lines.js';
import type {
  PlanningSessionDetail,
  RecertificationDetail,
  SpecDetails,
  TaskDetail,
  VerificationHistory,
} from './show-types.js';

function formatEventData(data?: Record<string, unknown>): string {
  if (!data || Object.keys(data).length === 0) return '';
  const entries = Object.entries(data).map(([k, v]) => `${k}: ${v}`);
  return ` (${entries.join(', ')})`;
}

/**
 * Render an archived change's verification history as the `Verification:`
 * section: one line per `check_ran` with its time, command, and exit code, and
 * one per `verification_recorded` with its time, outcome, and note.
 */
function formatVerificationHistory(history: VerificationHistory): string[] {
  const lines = ['Verification:'];
  for (const check of history.checks) {
    const exit = check.exitCode === null ? 'unavailable' : String(check.exitCode);
    lines.push(`  check_ran ${check.time}: ${check.command} (exit ${exit})`);
  }
  for (const outcome of history.outcomes) {
    const note = outcome.note ?? 'none';
    lines.push(
      `  verification_recorded ${outcome.time}: ${outcome.outcome ?? 'unavailable'} (note: ${note})`,
    );
  }
  return lines;
}

/** The change header lines, before the goal, task list and later sections. */
function headerLines(details: SpecDetails): string[] {
  const lines: string[] = [];
  const location = details.isArchived ? 'archived' : 'active';
  const approval = details.approvedHash ? `approved (${details.approvedHash})` : 'unapproved';
  lines.push(`Spec: ${details.folderName} (${details.id})`);
  lines.push(`Title: ${details.title}`);
  lines.push(`Status: [${details.status}]`);
  if (details.next) lines.push(`Next: ${formatNextStep(details.next)}`);
  if (details.verification) lines.push(...formatVerificationHistory(details.verification));
  if (details.afterLanding) {
    lines.push('After landing:');
    for (const afterLine of details.afterLanding.split('\n')) lines.push(`  ${afterLine}`);
  }
  lines.push(`Location: ${location}`);
  lines.push(`Approval: ${approval}`);
  const dependsOnStr = details.dependsOn.length > 0 ? details.dependsOn.join(', ') : 'none';
  lines.push(`Depends on: ${dependsOnStr}`);
  lines.push('Features:');
  const readsStr = details.features.reads.length > 0 ? details.features.reads.join(', ') : 'none';
  const writesStr =
    details.features.writes.length > 0 ? details.features.writes.join(', ') : 'none';
  lines.push(`  Reads: ${readsStr}`);
  lines.push(`  Writes: ${writesStr}`);
  return lines;
}

/** An indented prose section for the goal or contract, or no lines. */
function proseLines(label: string, text: string): string[] {
  if (!text) return [];
  const lines = ['', label];
  for (const line of text.split('\n')) lines.push(`  ${line}`);
  return lines;
}

function taskSectionLines(details: SpecDetails): string[] {
  const lines = ['', 'Tasks:'];
  if (details.tasks.length === 0) {
    lines.push('  (no tasks)');
  } else {
    for (const task of details.tasks) lines.push(...formatTaskLines(task));
  }
  return lines;
}

/** The title, verify and event-derived lines of one task. */
function taskHeaderLines(task: TaskDetail): string[] {
  const lines: string[] = [];
  let indicator = '[ ]';
  if (task.status === 'done') {
    indicator = '[x]';
  } else if (task.status === 'running') {
    indicator = '[>]';
  } else if (task.status === 'dead') {
    indicator = '[!]';
  }
  const deadTag = task.deadReason ? ` (reason: ${task.deadReason})` : '';
  lines.push(`  ${indicator} ${task.taskNumber}. ${task.title} [${task.status}]${deadTag}`);
  if (task.verify) lines.push(`      Verify: ${task.verify}`);
  const preSpawnVerify = formatPreSpawnVerify(task.events);
  if (preSpawnVerify) lines.push(preSpawnVerify);
  const retries = formatRetries(task.events);
  if (retries) lines.push(retries);
  const stuck = formatStuck(task.events);
  if (stuck) lines.push(stuck);
  const instructionsChanged = formatInstructionsChanged(task.events);
  if (instructionsChanged) lines.push(instructionsChanged);
  const dependenciesAdded = formatDependenciesAdded(task.events);
  if (dependenciesAdded) lines.push(dependenciesAdded);
  const taskScenarios = formatTaskScenarios(task.scenarios);
  if (taskScenarios) lines.push(taskScenarios);
  const focusedRuns = formatFocusedRuns(task.events);
  if (focusedRuns) lines.push(focusedRuns);
  const mutationRuns = formatMutationRuns(task.events);
  if (mutationRuns) lines.push(...mutationRuns);
  const disclosures = formatDisclosures(task.resultContent);
  if (disclosures) lines.push(disclosures);
  return lines;
}

/** The scope, acceptance, diagnostic and result lines of one task. */
function taskFooterLines(task: TaskDetail): string[] {
  const lines: string[] = [];
  if (task.scope.length > 0) lines.push(`      Scope: ${task.scope.join(', ')}`);
  if (task.acceptance.length > 0) {
    lines.push('      Acceptance:');
    for (const item of task.acceptance) {
      const itemIndicator = task.status === 'done' ? '[x]' : '[ ]';
      lines.push(`        - ${itemIndicator} ${item}`);
    }
  }
  if (task.deadDiagnostic) {
    lines.push('      Failure diagnostic:');
    for (const dLine of task.deadDiagnostic.split('\n')) lines.push(`        ${dLine}`);
  }
  if (task.resultContent) {
    lines.push('      Result:');
    for (const rLine of task.resultContent.split('\n')) lines.push(`        ${rLine}`);
  }
  return lines;
}

function formatTaskLines(task: TaskDetail): string[] {
  return [...taskHeaderLines(task), ...taskFooterLines(task)];
}

function planningSessionLines(details: SpecDetails): string[] {
  const lines = ['', 'Planning Sessions:'];
  if (details.planningSessions.length === 0) {
    lines.push('  (no planning sessions)');
    return lines;
  }
  for (const session of details.planningSessions) lines.push(formatPlanningSession(session));
  return lines;
}

function formatPlanningSession(session: PlanningSessionDetail): string {
  const agent = session.agent ? ` agent: ${session.agent}` : '';
  const model = session.model ?? 'unavailable';
  const exit = session.exitCode === null ? 'unavailable' : String(session.exitCode);
  const wall =
    session.wallSeconds === null ? 'unavailable' : formatDuration(session.wallSeconds * 1000);
  return `  ${session.startTime} ${session.harness}/${model}${agent} exit: ${exit} wall: ${wall}`;
}

/**
 * The derived, append-only recertification view. It is rendered only when
 * typed decisions exist and never replaces the raw event timeline below.
 */
function recertificationLines(details: SpecDetails): string[] {
  if (details.recertifications.length === 0) return [];
  const lines = ['', 'Recertifications:'];
  for (const row of details.recertifications) lines.push(...recertificationRowLines(row));
  return lines;
}

function recertificationRowLines(row: RecertificationDetail): string[] {
  const label =
    row.outcome === 'passed'
      ? 'recertified'
      : row.outcome === 'requeued'
        ? 'requeued for agent work'
        : 'unavailable';
  const lines = [
    `  Task ${row.taskNumber} ${row.timestamp ?? 'unavailable'} [${label}]`,
    `      Verify: ${row.verify ?? 'unavailable'}`,
    `      Exit code: ${row.exitCode ?? 'unavailable'}`,
    `      Timed out: ${row.timedOut === null ? 'unavailable' : row.timedOut ? 'yes' : 'no'}`,
  ];
  if (row.attribution.length > 0) {
    lines.push('      Differing paths:');
    for (const entry of row.attribution) {
      const attribution =
        entry.attribution === 'ambiguous' || entry.attribution === 'unknown'
          ? entry.attribution
          : `attributed to task ${entry.attribution}`;
      lines.push(`        - ${entry.path} — ${attribution}`);
    }
  }
  return lines;
}

function timelineLines(details: SpecDetails): string[] {
  const lines = ['', 'Event Timeline:'];
  if (details.timeline.length === 0) {
    lines.push('  (no events recorded)');
    return lines;
  }
  for (const event of details.timeline) {
    const eventData = formatEventData(event.data);
    lines.push(`  ${event.timestamp} [Task ${event.taskNumber}] ${event.type}${eventData}`);
  }
  return lines;
}

export function formatSpecDetails(details: SpecDetails): string {
  const lines = [
    ...headerLines(details),
    ...proseLines('Goal:', details.goal),
    ...proseLines('Contract:', details.contract),
    ...taskSectionLines(details),
    ...planningSessionLines(details),
    ...recertificationLines(details),
    ...timelineLines(details),
  ];
  return lines.join('\n');
}

/**
 * Alias for {@link formatSpecDetails} matching the show-output name used by
 * the status-inspection spec. Displays the dead reason (including
 * `undeclared_test_change`) and its failure diagnostic.
 */
export const formatShowOutput = formatSpecDetails;
