import path from 'node:path';

/**
 * Canonical OpenSpec path layout.
 *
 * Change folders and `.run/` artifacts derive from a single configurable
 * `openspecRoot`; no independent specs or archive overrides exist.
 */

const RUN_DIR = '.run';
const CHANGES_DIR = 'changes';
const ARCHIVE_DIR = 'archive';
const SPECS_DIR = 'specs';
const TASKS_DIR = 'tasks';
const DONE_DIR = 'done';
const DEAD_DIR = 'dead';
const REGRESSED_DIR = 'regressed';
const EVENTS_DIR = 'events';
const RUNNING_DIR = 'running';
const RESULTS_DIR = 'results';
const APPROVED_MARKER = 'approved';

/** `<openspecRoot>/changes`, optionally anchored to a project root. */
export function getChangesDir(openspecRoot: string, projectRoot = ''): string {
  return path.join(projectRoot, openspecRoot, CHANGES_DIR);
}

/** `<openspecRoot>/changes/archive`, optionally anchored to a project root. */
export function getArchiveDir(openspecRoot: string, projectRoot = ''): string {
  return path.join(projectRoot, openspecRoot, CHANGES_DIR, ARCHIVE_DIR);
}

/** `<openspecRoot>/specs`, optionally anchored to a project root. */
export function getSpecsDir(openspecRoot: string, projectRoot = ''): string {
  return path.join(projectRoot, openspecRoot, SPECS_DIR);
}

/** `<changeFolder>/.run`. */
export function getChangeRunDir(changeFolder: string): string {
  return path.join(changeFolder, RUN_DIR);
}

/** `<changeFolder>/tasks`. */
export function getChangeTasksDir(changeFolder: string): string {
  return path.join(changeFolder, TASKS_DIR);
}

/** `<changeFolder>/.run/approved`. */
export function getApprovedMarkerPath(changeFolder: string): string {
  return path.join(changeFolder, RUN_DIR, APPROVED_MARKER);
}

/** `<changeFolder>/.run/done/<task>`. */
export function getDoneMarkerPath(changeFolder: string, task: string): string {
  return path.join(changeFolder, RUN_DIR, DONE_DIR, task);
}

/** `<changeFolder>/.run/running/<task>.pid`. */
export function getRunningPidPath(changeFolder: string, task: string): string {
  return path.join(changeFolder, RUN_DIR, RUNNING_DIR, `${task}.pid`);
}

/** `<changeFolder>/.run/results/<task>.md`. */
export function getResultPath(changeFolder: string, task: string): string {
  return path.join(changeFolder, RUN_DIR, RESULTS_DIR, `${task}.md`);
}

/** `<changeFolder>/.run/dead/<task>.md`. */
export function getDeadMarkerPath(changeFolder: string, task: string): string {
  return path.join(changeFolder, RUN_DIR, DEAD_DIR, `${task}.md`);
}

/** `<changeFolder>/.run/regressed/<target>.md`. */
export function getRegressedMarkerPath(changeFolder: string, target: string): string {
  return path.join(changeFolder, RUN_DIR, REGRESSED_DIR, `${target}.md`);
}

/** `<changeFolder>/.run/events/<task>.jsonl`. */
export function getEventsPath(changeFolder: string, task: string): string {
  return path.join(changeFolder, RUN_DIR, EVENTS_DIR, `${task}.jsonl`);
}
