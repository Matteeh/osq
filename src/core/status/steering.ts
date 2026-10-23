import { parseFrontmatter } from '../spec/parser.js';
import { getDeadMarkerPath, getRegressedMarkerPath } from './layout.js';
import type { ChangeFolderSnapshot, SpecState } from './state.js';

export type SteeringTriggerName =
  | 'stuck'
  | 'blocked'
  | 'dead'
  | 'regression'
  | 'conflict'
  | 'requirement_changed';

export interface SteeringTrigger {
  readonly target: string;
  readonly trigger: SteeringTriggerName;
  readonly reason: string;
}

/** Change-level regressions the run and sync steps write; every task regression counts. */
const CHANGE_REGRESSION_REASONS: ReadonlySet<string> = new Set([
  'verify_red',
  'verify_path_missing',
  'sync_verify_red',
]);

function markerReason(content: string): string {
  const reason = parseFrontmatter(content).data.reason;
  return typeof reason === 'string' ? reason : '';
}

/** Numeric-prefix order without importing state.ts at runtime. */
function compareTaskNumbers(a: string, b: string): number {
  const matchA = a.match(/^(\d+)/);
  const matchB = b.match(/^(\d+)/);
  if (matchA && matchB) {
    const diff = Number.parseInt(matchA[1], 10) - Number.parseInt(matchB[1], 10);
    if (diff !== 0) return diff;
  }
  return a.localeCompare(b);
}

/**
 * One task's active trigger, if any. Regression wins, then done markers
 * suppress a dead marker, then a blocked or stuck reason is a trigger.
 */
function taskTrigger(snapshot: ChangeFolderSnapshot, taskNumber: string): SteeringTrigger | null {
  const regressed = snapshot.regressedMarkers?.get(taskNumber);
  if (regressed !== undefined) {
    const { data } = parseFrontmatter(regressed);
    const reason = typeof data.reason === 'string' ? data.reason : '';
    // A scope regression whose recorded verify passed recertifies in place:
    // the task's own verify still holds, so it is no trigger.
    if (reason === 'scope_regression' && data.verification_passed === true) return null;
    return { target: taskNumber, trigger: 'regression', reason };
  }
  if (snapshot.doneMarkers.has(taskNumber)) return null;
  const dead = snapshot.deadMarkers.get(taskNumber);
  if (dead === undefined) return null;
  const { data } = parseFrontmatter(dead);
  const reason = typeof data.reason === 'string' ? data.reason : '';
  if (reason === 'blocked' || reason === 'entry_missing') {
    return { target: taskNumber, trigger: 'blocked', reason };
  }
  if (data.stuck === true) return { target: taskNumber, trigger: 'stuck', reason };
  return null;
}

/** The change-level trigger a `regressed/change.md` marker yields, if any. */
function changeTrigger(marker: string | undefined): SteeringTrigger | null {
  if (marker === undefined) return null;
  const reason = markerReason(marker);
  if (reason === 'sync_conflict') return { target: 'change', trigger: 'conflict', reason };
  if (reason === 'requirement_changed') {
    return { target: 'change', trigger: 'requirement_changed', reason };
  }
  if (CHANGE_REGRESSION_REASONS.has(reason)) {
    return { target: 'change', trigger: 'regression', reason };
  }
  return null;
}

/**
 * The active steering triggers of an approved change, derived from markers the
 * snapshot already read: the change-level trigger first, then tasks in
 * numeric order. An unapproved change yields none.
 *
 * @scenario status-inspection: Passing scope regression
 * @scenario status-inspection: Failing scope regression
 */
export function deriveSteering(snapshot: ChangeFolderSnapshot): SteeringTrigger[] {
  if (!snapshot.approvedHash) return [];
  const triggers: SteeringTrigger[] = [];
  const change = changeTrigger(snapshot.regressedMarkers?.get('change'));
  if (change) triggers.push(change);
  const taskNumbers = [...snapshot.taskFiles.keys()]
    .map((fileName) => fileName.replace(/\.md$/, ''))
    .sort(compareTaskNumbers);
  for (const taskNumber of taskNumbers) {
    const trigger = taskTrigger(snapshot, taskNumber);
    if (trigger) triggers.push(trigger);
  }
  return triggers;
}

/**
 * The triggers a human may steer an approved change by: the derived steering
 * unchanged when any exists, otherwise one `dead` trigger per dead task.
 *
 * @scenario status-inspection: Dead task without a trigger
 * @scenario status-inspection: Run triggers win
 * @scenario status-inspection: Nothing died
 * @adr 018
 * @adr 021
 */
export function humanSteering(state: SpecState): SteeringTrigger[] {
  if (state.steering && state.steering.length > 0) return state.steering;
  return state.tasks
    .filter((task) => task.status === 'dead')
    .map((task) => ({ target: task.taskNumber, trigger: 'dead', reason: task.deadReason ?? '' }));
}

/** Whether a trigger is one the default branch stops a change with. */
export function isDefaultBranchTrigger(trigger: SteeringTrigger): boolean {
  if (trigger.trigger === 'conflict' || trigger.trigger === 'requirement_changed') return true;
  return trigger.trigger === 'regression' && trigger.reason === 'sync_verify_red';
}

/** Human-readable label: `task <n> <trigger> (<reason>)` or `change ...`. */
export function describeTrigger(trigger: SteeringTrigger): string {
  const target = trigger.target === 'change' ? 'change' : `task ${trigger.target}`;
  return `${target} ${trigger.trigger} (${trigger.reason})`;
}

/** The marker carrying the trigger's evidence: regressed for a change or regression, dead otherwise. */
export function steeringMarkerPath(folderPath: string, trigger: SteeringTrigger): string {
  const regressed = trigger.trigger === 'regression' || trigger.target === 'change';
  return regressed
    ? getRegressedMarkerPath(folderPath, trigger.target)
    : getDeadMarkerPath(folderPath, trigger.target);
}
