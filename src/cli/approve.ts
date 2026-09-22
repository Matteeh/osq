import { approveSpec } from '../core/approve.js';
import { type OsqConfig, loadConfig } from '../core/config.js';
import { resolveHarnessExecutable } from '../core/harness-catalog.js';
import type { PlanningSessionReader } from '../core/planning-observed.js';
import { readClaudePlanningSessions } from '../harness/claude-usage.js';
import { readCodexPlanningSessions } from '../harness/codex-observe-usage.js';
import { readOpencodePlanningSessions } from '../harness/opencode-observe-usage.js';

export interface ApproveCommandOptions {
  cwd?: string;
  config?: OsqConfig;
  planningReaders?: readonly PlanningSessionReader[];
  now?: Date | string;
}

/** Build the three local observation readers without constructing an adapter. */
function defaultPlanningReaders(config: OsqConfig): readonly PlanningSessionReader[] {
  const opencodeBin = resolveHarnessExecutable('opencode', config) ?? 'opencode';
  return [
    readCodexPlanningSessions,
    () => readOpencodePlanningSessions(opencodeBin),
    readClaudePlanningSessions,
  ];
}

export async function approveCommand(
  specIds: string[],
  options: ApproveCommandOptions = {},
): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const config = options.config || (await loadConfig(cwd));

  if (!specIds || specIds.length === 0) {
    console.error('Error: specify at least one spec ID to approve (e.g. osq approve 001)');
    process.exit(1);
  }

  const planningReaders = options.planningReaders ?? defaultPlanningReaders(config);

  for (const specId of specIds) {
    try {
      const result = await approveSpec(cwd, specId, config, {
        planningReaders,
        now: options.now,
      });
      console.log(`Approved ${result.specId} (${result.folderName})`);
      console.log(`  Hash: ${result.hash}`);
      for (const warning of result.warnings) {
        console.warn(`  Warning: ${warning}`);
      }
      if (result.planningMatches === 0) {
        console.log(`No planning record found for ${result.specId}.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error approving ${specId}:\n  ${message}`);
      process.exit(1);
    }
  }
}
