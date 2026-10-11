import type { OsqConfig } from '../foundation/config.js';
import { type ValidatorRun, readValidatorRuns } from '../report/validator-runs.js';
import { listChanges } from './change-locations.js';

/**
 * The latest failing validator run across the archived changes, if any:
 * `change` is the folder name, `outcome` and `error` are the latest run's,
 * and `runs` counts the latest runs in a row with a failing outcome.
 */
export interface ValidatorFailing {
  readonly change: string;
  readonly outcome: string;
  readonly runs: number;
  readonly error: string;
}

/** The outcomes that keep the failing line up. */
const FAILING_OUTCOMES = new Set(['failed', 'timed_out', 'unreadable']);

/** Epoch milliseconds of a run's timestamp, or 0 when it is absent or invalid. */
function runTimeMs(run: ValidatorRun): number {
  if (run.timestamp === null) return 0;
  const ms = Date.parse(run.timestamp);
  return Number.isFinite(ms) ? ms : 0;
}

/** The first non-blank line of a run's output, trimmed, or null. */
function firstNonBlankLine(output: string | null): string | null {
  if (output === null) return null;
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (line !== '') return line;
  }
  return null;
}

/**
 * The latest failing validator run across every archived change, or null when
 * the latest run is anything else, so one `validated` run clears the failing
 * line. Reads only; the archive never waits on it.
 *
 * @scenario status-inspection: Validator failing
 * @scenario status-inspection: No validator runs
 * @adr 010
 */
export async function readValidatorFailing(
  projectRoot: string,
  config: OsqConfig,
): Promise<ValidatorFailing | null> {
  const changes = await listChanges(projectRoot, config, ['archived']);
  const runs: Array<{ folderName: string; run: ValidatorRun }> = [];
  for (const change of changes) {
    for (const run of await readValidatorRuns(change.folderPath)) {
      if (run.outcome === 'not_run') continue;
      runs.push({ folderName: change.folderName, run });
    }
  }
  runs.sort((a, b) => runTimeMs(a.run) - runTimeMs(b.run));

  const latest = runs[runs.length - 1];
  if (latest === undefined) return null;
  const outcome = latest.run.outcome;
  if (outcome === null || !FAILING_OUTCOMES.has(outcome)) return null;

  let count = 0;
  for (let i = runs.length - 1; i >= 0; i--) {
    const current = runs[i]?.run.outcome ?? null;
    if (current === null || !FAILING_OUTCOMES.has(current)) break;
    count++;
  }

  const error = firstNonBlankLine(latest.run.output) ?? outcome;
  return { change: latest.folderName, outcome, runs: count, error };
}
