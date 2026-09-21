import { type OsqConfig, loadConfig } from '../core/config.js';
import { rejectSpec } from '../core/reject.js';

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
    console.log(`  Destination: ${result.destinationPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error rejecting ${specId}:\n  ${message}`);
    process.exit(1);
  }
}
