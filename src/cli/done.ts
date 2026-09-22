import { type OsqConfig, loadConfig } from '../core/foundation/config.js';
import { markTaskDoneManual } from '../core/lifecycle/done.js';

export interface DoneCommandOptions {
  readonly manual?: string;
  readonly cwd?: string;
  readonly config?: OsqConfig;
}

/**
 * Mark a task done manually with a required justification. Writes the annotated
 * marker, appends the `done_manual` event, and ticks the `tasks.md` checkbox.
 */
export async function doneCommand(
  specId: string,
  taskNumber: string,
  options: DoneCommandOptions = {},
): Promise<void> {
  const reason = options.manual?.trim();
  if (!reason) {
    console.error('Error: --manual <reason> is required to mark a task done');
    process.exit(1);
  }

  const cwd = options.cwd ?? process.cwd();
  const config = options.config ?? (await loadConfig(cwd));

  try {
    const result = await markTaskDoneManual(cwd, specId, taskNumber, reason, config);
    console.log(`Marked task ${result.taskNumber} of ${result.folderName} done (manual)`);
    console.log(`  Reason: ${reason}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error marking task done:\n  ${message}`);
    process.exit(1);
  }
}
