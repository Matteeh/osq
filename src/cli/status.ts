import { readWatchState } from '../core/run/watch-state.js';
import { formatStatusOverview, getStatusOverview } from '../core/status/status.js';
import { formatWatcherLine } from '../core/status/watcher-line.js';
import { readAfterLandFailure } from '../core/vcs/land-after.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, resolveInputs } from './command-inputs.js';

export interface StatusCommandOptions extends CommandInputs {
  /** Injectable home root so tests never read the developer's real watch state. */
  home?: string;
}

/**
 * @scenario status-inspection: Failed after-land command waiting
 */
export async function statusCommand(options: StatusCommandOptions = {}): Promise<string> {
  const inputs = resolveInputs(options);
  const config = await inputs.config();

  try {
    const overview = await getStatusOverview(inputs.cwd, config);
    const watch = await readWatchState(inputs.cwd, options.home);
    const lines = [formatStatusOverview(overview), '', formatWatcherLine(watch)];
    if (watch.logExists) lines.push(`Log: ${watch.log}`);
    const failure = await readAfterLandFailure(inputs.cwd, options.home);
    if (failure !== null) {
      const id = failure.change.match(/^(\d+)/)?.[1] ?? failure.change;
      lines.push(`After-land command failed for ${id}: ${failure.command} — osq land ${id}`);
    }
    const formatted = lines.join('\n');
    inputs.stdout(`${formatted}\n`);
    return formatted;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CommandError(`Status error: ${message}`);
  }
}
