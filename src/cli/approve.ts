import { approveSpec } from '../core/approve.js';
import { type OsqConfig, loadConfig } from '../core/config.js';

export async function approveCommand(
  specIds: string[],
  options: { cwd?: string; config?: OsqConfig } = {},
): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const config = options.config || (await loadConfig(cwd));

  if (!specIds || specIds.length === 0) {
    console.error('Error: specify at least one spec ID to approve (e.g. osq approve 001)');
    process.exit(1);
  }

  for (const specId of specIds) {
    try {
      const result = await approveSpec(cwd, specId, config);
      console.log(`Approved ${result.specId} (${result.folderName})`);
      console.log(`  Hash: ${result.hash}`);
      for (const warning of result.warnings) {
        console.warn(`  Warning: ${warning}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error approving ${specId}:\n  ${message}`);
      process.exit(1);
    }
  }
}
