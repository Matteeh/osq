import { assertPlanCommitted } from '../core/lifecycle/retry-plan-edits.js';
import { retrySpec } from '../core/lifecycle/retry.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, resolveInputs } from './command-inputs.js';

export type RetryCommandOptions = CommandInputs;

/**
 * Refuse a retry while the change's worktree holds uncommitted plan edits,
 * then run the preserving retry transition.
 * @scenario watcher-and-harness: Plan edits not committed
 * @adr 003
 */
export async function retryCommand(
  specId: string,
  target: string,
  options: RetryCommandOptions = {},
): Promise<void> {
  const inputs = resolveInputs(options);
  const config = await inputs.config();

  try {
    await assertPlanCommitted(inputs.cwd, specId, config);
    const result = await retrySpec(inputs.cwd, specId, target, config);
    const label = result.target === 'change' ? 'change' : `task ${result.target}`;
    const lines: string[] = [];
    if (result.recertification === 'passed') {
      lines.push(`Recertified ${result.specId} ${label} (scope regression cleared)`);
    } else if (result.recertification === 'requeued') {
      lines.push(
        `Requeued ${result.specId} ${label} for agent work (next attempt: ${result.attempt})`,
      );
    } else {
      lines.push(`Retried ${result.specId} ${label} (next attempt: ${result.attempt})`);
    }
    lines.push(`  Reason: ${result.reason}`);
    for (const marker of result.retainedMarkers) {
      lines.push(`  Retained: ${marker}`);
    }
    for (const line of lines) inputs.stdout(`${line}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CommandError(`Error retrying ${specId} ${target}:\n  ${message}`);
  }
}
