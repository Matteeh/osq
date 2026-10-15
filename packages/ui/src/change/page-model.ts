import type { LandView, WebChange } from '../contracts.js';

/**
 * The change page model: pure functions that turn a `WebChange` into what the
 * change page shows. They read only their argument, with no I/O, no clock and
 * no React, so the same document always yields the same page.
 */

type WebTask = WebChange['tasks'][number];
type NextStepState = NonNullable<WebChange['nextStep']>['state'];

/** The state the change page renders. */
export type ChangePageState = NextStepState | 'revised' | 'rejected' | 'unknown';

/** The page's main button, or null when the page shows none. */
export type ChangePageMain = 'copy' | 'approve' | 'plan-it' | 'land' | null;

/** The page's secondary button, or null when the page shows none. */
export type ChangePageSecond = 'plan-again' | 'plan-it-myself' | null;

/** The head and buttons one state of a change page shows. */
export interface ChangePage {
  readonly state: ChangePageState;
  readonly label: string;
  readonly summary: string;
  readonly main: ChangePageMain;
  readonly second: ChangePageSecond;
}

/** What the top block says when a change stopped. */
export interface HaltFacts {
  readonly heading: string;
  readonly reason: string;
  readonly touched: readonly string[];
}

/** The noun after a count: `task` for one, `tasks` otherwise. */
function noun(count: number): string {
  return count === 1 ? 'task' : 'tasks';
}

function doneCount(change: WebChange): number {
  return change.tasks.filter((task) => task.state === 'done').length;
}

function pageState(change: WebChange): ChangePageState {
  if (change.location === 'rejected') return 'rejected';
  const next = change.nextStep;
  if (!next) return 'unknown';
  if (next.state === 'dead' && change.autoSteer?.outcome === 'ready') return 'revised';
  return next.state;
}

/**
 * The head and buttons for a change document's state.
 *
 * @scenario web-inspection: Page per state
 * @scenario web-inspection: Planning page
 * @adr 013
 */
export function changePage(change: WebChange): ChangePage {
  const state = pageState(change);
  const n = change.tasks.length;
  const done = `${doneCount(change)} of ${n} ${noun(n)} done`;
  switch (state) {
    case 'unplanned':
      return {
        state,
        label: 'Needs a plan',
        summary: 'Not planned yet',
        main: 'copy',
        second: null,
      };
    case 'ready-for-approval':
      return {
        state,
        label: 'Waiting for you',
        summary: change.planner
          ? `${n} ${noun(n)} · planned by ${change.planner}`
          : `${n} ${noun(n)}`,
        main: 'approve',
        second: 'plan-again',
      };
    case 'running':
      return { state, label: 'Running', summary: done, main: null, second: null };
    case 'planning':
      return { state, label: 'Planning', summary: 'Planner running', main: null, second: null };
    case 'blocked':
      return { state, label: 'Blocked', summary: done, main: null, second: null };
    case 'dead':
      return { state, label: 'Halted', summary: done, main: 'plan-it', second: null };
    case 'revised':
      return {
        state,
        label: 'Waiting for you',
        summary: 'Halted · revised by the automatic planner',
        main: 'approve',
        second: 'plan-it-myself',
      };
    case 'archived':
      return {
        state,
        label: 'Ready to land',
        summary: `${n} ${noun(n)} done · archived`,
        main: 'land',
        second: 'plan-again',
      };
    case 'landed':
      return {
        state,
        label: 'Landed',
        summary: `${n} ${noun(n)} done · landed`,
        main: null,
        second: null,
      };
    case 'rejected':
      return { state, label: 'Rejected', summary: `${n} ${noun(n)}`, main: null, second: null };
    case 'unknown':
      return { state, label: 'Change', summary: done, main: null, second: null };
  }
}

function elapsedText(seconds: number | null): string {
  if (seconds === null) return 'unavailable';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)} min`;
}

/**
 * The progress line of a change: its first running task, or its done count.
 *
 * @scenario web-inspection: Progress line
 * @adr 013
 */
export function progressLine(change: WebChange): string {
  const n = change.tasks.length;
  const running = change.tasks.find((task) => task.state === 'running');
  if (running) {
    return `Task ${running.taskNumber} of ${n} running · ${elapsedText(running.runningElapsedSeconds)}`;
  }
  return `${doneCount(change)} of ${n} ${noun(n)} done`;
}

/**
 * @scenario web-inspection: Planning line
 * @adr 013
 */
export function planningLine(change: WebChange, now: number): string {
  const started = change.planRun?.startedAt;
  const parsed = started === null || started === undefined ? Number.NaN : Date.parse(started);
  if (Number.isNaN(parsed)) return 'Planning on server · unavailable';
  return `Planning on server · ${elapsedText(Math.max(0, Math.floor((now - parsed) / 1000)))}`;
}

/**
 * @scenario web-inspection: Planner run line
 * @adr 013
 */
export function planRunLine(change: WebChange): string | null {
  const run = change.planRun;
  if (!run) return null;
  if (run.outcome === 'unchanged') return 'The last planner run changed nothing.';
  if (run.outcome === 'lint_red') return 'The last planner run left the plan failing osq lint.';
  if (run.outcome === 'timed_out') return 'The last planner run timed out.';
  if (run.outcome === 'failed') {
    const line = run.detail?.split('\n')[0];
    return line ? `The last planner run failed: ${line}` : 'The last planner run failed.';
  }
  return null;
}

function touchedPaths(task: WebTask): string[] {
  if (!task.result) return [];
  const lines = task.result.split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index] ?? '';
    if (line.startsWith('Touched: ')) {
      return line
        .slice('Touched: '.length)
        .split(', ')
        .filter((path) => path.length > 0);
    }
  }
  return [];
}

/**
 * What the top block says when a change stopped: the first dead or regressed
 * task, else the change's own next-step detail.
 *
 * @scenario web-inspection: Halt facts
 * @adr 013
 */
export function haltFacts(change: WebChange): HaltFacts {
  const stopped = change.tasks.find((task) => task.state === 'dead' || task.state === 'regressed');
  if (stopped) {
    return {
      heading: `Task ${stopped.taskNumber} stopped: ${stopped.title}`,
      reason: stopped.reason ?? 'unavailable',
      touched: touchedPaths(stopped),
    };
  }
  return {
    heading: 'The change stopped',
    reason: change.nextStep?.detail ?? 'unavailable',
    touched: [],
  };
}

function gateName(gate: LandView['gates'][number]): string {
  if (gate.kind === 'task') return `Task ${gate.task ?? ''}`.trimEnd();
  if (gate.kind === 'verify') return 'Verify';
  if (gate.kind === 'check') return 'Check';
  return 'Validator';
}

/**
 * The first land line that applies to a land view: a halt, a sync stop, a
 * failed gate, no gates, or every gate passed.
 *
 * @scenario web-inspection: Land line
 * @adr 013
 */
export function landLine(land: LandView): string {
  if (land.halt) return `Halted: ${land.halt.message}`;
  if (land.lastSyncStop) return `Sync stopped: ${land.lastSyncStop.message}`;
  const failed = land.gates.find((gate) => gate.outcome === 'failed');
  if (failed) return `${gateName(failed)} failed`;
  const g = land.gates.length;
  if (g === 0) return 'No gates recorded';
  return `All ${g} ${g === 1 ? 'gate' : 'gates'} passed`;
}

/**
 * The landed line: how many tasks and how many of them passed first try.
 *
 * @scenario web-inspection: Landed line
 * @adr 013
 */
export function landedLine(change: WebChange): string {
  const n = change.tasks.length;
  const firstTry = change.tasks.filter(
    (task) => task.state === 'done' && task.attempts === 1,
  ).length;
  return `${n} ${noun(n)}, ${firstTry} first try`;
}
