import { InvalidArgumentError } from 'commander';
import { rejectSpec } from '../core/lifecycle/reject.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, resolveInputs } from './command-inputs.js';

/** Commander-level guard rejecting an empty or whitespace-only rejection reason. */
export function parseRejectReason(value: string): string {
  if (!value || !value.trim()) {
    throw new InvalidArgumentError('a non-empty rejection reason is required');
  }
  return value;
}

export interface RejectCommandOptions extends CommandInputs {
  reason: string;
}

export async function rejectCommand(specId: string, options: RejectCommandOptions): Promise<void> {
  const inputs = resolveInputs(options);
  const config = await inputs.config();

  try {
    const result = await rejectSpec(inputs.cwd, specId, options.reason, config);
    const lines = [
      `Rejected ${result.specId} (${result.folderName})`,
      `  Reason: ${result.reason}`,
    ];
    if (result.stackedPath !== undefined) {
      lines.push(`  Withdrew stacked approval: ${result.stackedPath}`);
      lines.push(`  Restored draft: ${result.restoredPath}`);
    } else if (result.worktree !== undefined) {
      if (result.worktree.removed) {
        lines.push(`  Worktree removed: ${result.worktree.path}`);
      } else {
        lines.push(`  Worktree kept: ${result.worktree.path} (${result.worktree.why ?? ''})`);
      }
      lines.push(`  Branch kept: ${result.branch}`);
    } else {
      lines.push(`  Destination: ${result.destinationPath}`);
    }
    for (const line of lines) inputs.stdout(`${line}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CommandError(`Error rejecting ${specId}:\n  ${message}`);
  }
}
