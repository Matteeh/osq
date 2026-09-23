import { type OsqConfig, loadConfig } from '../core/foundation/config.js';
import { resolveHarnessExecutable } from '../core/foundation/harness-catalog.js';
import type { PlanningSessionReader } from '../core/report/planning-observed.js';
import { type ApprovalReview, approveSpec } from '../core/spec/approve.js';
import {
  type ApprovalDigest,
  formatApprovalDigest,
  formatApprovalFlags,
  summarizeApprovalFlags,
} from '../core/spec/digest.js';
import { readClaudePlanningSessions } from '../harness/claude/claude-usage.js';
import { readCodexPlanningSessions } from '../harness/codex/codex-observe-usage.js';
import { readOpencodePlanningSessions } from '../harness/opencode/opencode-observe-usage.js';
import { refusalMessage, requestApproval } from './confirm.js';

export interface ApproveCommandOptions {
  cwd?: string;
  config?: OsqConfig;
  planningReaders?: readonly PlanningSessionReader[];
  now?: Date | string;
  /** Block on flagged approvals by asking before the seal is written. */
  confirm?: boolean;
  /** Injectable terminal check; defaults to both stdio streams being TTYs. */
  isTerminal?: () => boolean;
  /** Injectable prompt; defaults to a `node:readline/promises` question. */
  ask?: (question: string) => Promise<string | null>;
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

function defaultIsTerminal(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

async function defaultAsk(question: string): Promise<string | null> {
  const readline = await import('node:readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
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
  const isTerminal = options.isTerminal ?? defaultIsTerminal;
  const ask = options.ask ?? defaultAsk;

  for (const specId of specIds) {
    // The digest prints before the seal is written; `--confirm` turns any
    // fired flag into a prompted, default-no gate.
    const review = async (digest: ApprovalDigest): Promise<ApprovalReview> => {
      console.log(formatApprovalDigest(digest));
      if (!options.confirm || digest.flags.length === 0) {
        for (const line of formatApprovalFlags(digest.flags)) {
          console.log(line);
        }
        return 'proceed';
      }
      if (!isTerminal()) {
        console.error(refusalMessage(specId, digest));
        process.exit(1);
      }
      return requestApproval(specId, digest, { ask });
    };

    try {
      const result = await approveSpec(cwd, specId, config, {
        planningReaders,
        now: options.now,
        review,
      });
      const summary = summarizeApprovalFlags(result.digest.flags);
      console.log(
        `Approved ${result.specId} (${result.folderName})${summary ? ` with ${summary}` : ''}`,
      );
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
