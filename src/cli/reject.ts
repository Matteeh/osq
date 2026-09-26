import { type OsqConfig, loadConfig } from '../core/foundation/config.js';
import { rejectSpec } from '../core/lifecycle/reject.js';

export interface RejectCommandOptions {
  cwd?: string;
  config?: OsqConfig;
  reason: string;
}

export async function rejectCommand(specId: string, options: RejectCommandOptions): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const config = options.config || (await loadConfig(cwd));

  try {
    const result = await rejectSpec(cwd, specId, options.reason, config);
    console.log(`Rejected ${result.specId} (${result.folderName})`);
    console.log(`  Reason: ${result.reason}`);
    if (result.stackedPath !== undefined) {
      console.log(`  Withdrew stacked approval: ${result.stackedPath}`);
    } else if (result.worktree !== undefined) {
      if (result.worktree.removed) {
        console.log(`  Worktree removed: ${result.worktree.path}`);
      } else {
        console.log(`  Worktree kept: ${result.worktree.path} (${result.worktree.why ?? ''})`);
      }
      console.log(`  Branch kept: ${result.branch}`);
    } else {
      console.log(`  Destination: ${result.destinationPath}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error rejecting ${specId}:\n  ${message}`);
    process.exit(1);
  }
}
