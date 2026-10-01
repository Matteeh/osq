import type { Command } from 'commander';
import { type OsqConfig, loadConfig } from '../core/foundation/config.js';
import { resolveHarnessExecutable } from '../core/foundation/harness-catalog.js';
import type { PlanningSessionReader } from '../core/report/planning-observed.js';
import { formatPriceKey } from '../core/report/planning-price-gaps.js';
import { type ApprovalReview, type ApproveResult, approveSpec } from '../core/spec/approve.js';
import {
  type ApprovalDigest,
  formatApprovalDigest,
  formatApprovalFlags,
  summarizeApprovalFlags,
} from '../core/spec/digest.js';
import { findChange } from '../core/status/change-locations.js';
import { formatNextStep, readNextStep } from '../core/status/next-step.js';
import { readClaudePlanningSessions } from '../harness/claude/claude-usage.js';
import { readCodexPlanningSessions } from '../harness/codex/codex-observe-usage.js';
import { readOpencodePlanningSessions } from '../harness/opencode/opencode-observe-usage.js';
import { CommandError } from './command-error.js';
import { refusalMessage, requestApproval } from './confirm.js';

export interface ApproveCommandOptions {
  cwd?: string;
  config?: OsqConfig;
  planningReaders?: readonly PlanningSessionReader[];
  now?: Date | string;
  /** Block on flagged approvals by asking before the seal is written. */
  confirm?: boolean;
  /** Approve from a branch other than the default branch. */
  baseOk?: boolean;
  /** Approve despite uncommitted changes covered by a task's scope. */
  ignoreDirty?: boolean;
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

/** Print the approval lines for one approved change. */
function printApprovalResult(result: ApproveResult): void {
  const summary = summarizeApprovalFlags(result.digest.flags);
  console.log(
    `Approved ${result.specId} (${result.folderName})${summary ? ` with ${summary}` : ''}`,
  );
  console.log(`  Hash: ${result.hash}`);
  if (result.keptBranch !== undefined) {
    console.log(`  Kept rejected branch: ${result.keptBranch}`);
  }
  if (result.stackedPath !== undefined) {
    console.log(`  Waiting for: ${(result.waitingFor ?? []).join(', ')}`);
    console.log(`  Stacked: ${result.stackedPath}`);
  } else if (result.worktreePath !== undefined && result.branch !== undefined) {
    console.log(`  Worktree: ${result.worktreePath}`);
    console.log(`  Branch: ${result.branch}`);
    if (result.restarted !== undefined) {
      console.log(
        `  Restarted from ${result.restarted.defaultBranch}; kept the old branch as ${result.restarted.keptBranch}`,
      );
    } else if (result.merged !== undefined) {
      console.log(`  Merged ${result.merged.defaultBranch} into ${result.branch}`);
    }
  }
  if (result.continuesFrom !== undefined) {
    console.log(`  Continues from task ${result.continuesFrom}`);
  }
  for (const warning of result.warnings) {
    console.warn(`  Warning: ${warning}`);
  }
  if (result.planningMatches === 0) {
    console.log(`No planning record found for ${result.specId}.`);
  }
  for (const model of result.missingPrices) {
    console.log(`Planning cost for ${model} stays unreported; add ${formatPriceKey(model)}.`);
  }
}

export async function approveCommand(
  specIds: string[],
  options: ApproveCommandOptions = {},
): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const config = options.config || (await loadConfig(cwd));

  if (!specIds || specIds.length === 0) {
    throw new CommandError('Error: specify at least one spec ID to approve (e.g. osq approve 001)');
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
        throw new CommandError(refusalMessage(specId, digest));
      }
      return requestApproval(specId, digest, { ask });
    };

    try {
      const result = await approveSpec(cwd, specId, config, {
        planningReaders,
        now: options.now,
        review,
        baseOk: options.baseOk,
        ignoreDirty: options.ignoreDirty,
      });
      printApprovalResult(result);
    } catch (error) {
      if (error instanceof CommandError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      let next: string | undefined;
      try {
        const { folderPath } = await findChange(cwd, config, specId);
        const nextStep = await readNextStep(cwd, folderPath, config);
        next = formatNextStep(nextStep);
      } catch {}
      throw new CommandError(`Error approving ${specId}:\n  ${message}`, { next });
    }
  }
}

/** Register `osq approve` and its approval-only flags. */
export function registerApproveCommand(program: Command): void {
  program
    .command('approve <ids...>')
    .description('lint, hash, and approve change folders')
    .option('--confirm', 'ask about approval flags before sealing')
    .option('--base-ok', 'approve even when HEAD is not the default branch')
    .option('--ignore-dirty', 'approve despite uncommitted changes in task scope')
    .action(
      async (
        ids: string[],
        options: { confirm?: boolean; baseOk?: boolean; ignoreDirty?: boolean },
      ) => {
        await approveCommand(ids, {
          confirm: options.confirm,
          baseOk: options.baseOk,
          ignoreDirty: options.ignoreDirty,
        });
      },
    );
}
