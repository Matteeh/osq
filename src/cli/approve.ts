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
import { resolveCheckoutRoot } from '../core/vcs/checkout-root.js';
import { readClaudePlanningSessions } from '../harness/claude/claude-usage.js';
import { readCodexPlanningSessions } from '../harness/codex/codex-observe-usage.js';
import { readOpencodePlanningSessions } from '../harness/opencode/opencode-observe-usage.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, type Writer, resolveInputs } from './command-inputs.js';
import { refusalMessage, requestApproval } from './confirm.js';

export interface ApproveCommandOptions extends CommandInputs {
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
function printApprovalResult(result: ApproveResult, stdout: Writer, stderr: Writer): void {
  const summary = summarizeApprovalFlags(result.digest.flags);
  stdout(`Approved ${result.specId} (${result.folderName})${summary ? ` with ${summary}` : ''}\n`);
  stdout(`  Hash: ${result.hash}\n`);
  if (result.keptBranch !== undefined) {
    stdout(`  Kept rejected branch: ${result.keptBranch}\n`);
  }
  if (result.stackedPath !== undefined) {
    stdout(`  Waiting for: ${(result.waitingFor ?? []).join(', ')}\n`);
    stdout(`  Stacked: ${result.stackedPath}\n`);
  } else if (result.worktreePath !== undefined && result.branch !== undefined) {
    stdout(`  Worktree: ${result.worktreePath}\n`);
    stdout(`  Branch: ${result.branch}\n`);
    if (result.restarted !== undefined) {
      stdout(
        `  Restarted from ${result.restarted.defaultBranch}; kept the old branch as ${result.restarted.keptBranch}\n`,
      );
    } else if (result.merged !== undefined) {
      stdout(`  Merged ${result.merged.defaultBranch} into ${result.branch}\n`);
    }
  }
  if (result.continuesFrom !== undefined) {
    stdout(`  Continues from task ${result.continuesFrom}\n`);
  }
  for (const warning of result.warnings) {
    stderr(`  Warning: ${warning}\n`);
  }
  if (result.planningMatches === 0) {
    stdout(`No planning record found for ${result.specId}.\n`);
  }
  for (const model of result.missingPrices) {
    stdout(`Planning cost for ${model} stays unreported; add ${formatPriceKey(model)}.\n`);
  }
}

export async function approveCommand(
  specIds: string[],
  options: ApproveCommandOptions = {},
): Promise<void> {
  const inputs = resolveInputs(options);
  const rootConfig = await inputs.config();
  const checkoutRoot = await resolveCheckoutRoot(inputs.cwd, rootConfig);
  const config =
    options.config ?? (checkoutRoot === inputs.cwd ? rootConfig : await loadConfig(checkoutRoot));
  if (checkoutRoot !== inputs.cwd) {
    inputs.stderr(`Approving from the checkout ${checkoutRoot}\n`);
  }

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
      inputs.stdout(`${formatApprovalDigest(digest)}\n`);
      if (!options.confirm || digest.flags.length === 0) {
        for (const line of formatApprovalFlags(digest.flags)) {
          inputs.stdout(`${line}\n`);
        }
        return 'proceed';
      }
      if (!isTerminal()) {
        throw new CommandError(refusalMessage(specId, digest));
      }
      return requestApproval(specId, digest, {
        ask,
        print: (line) => inputs.stdout(`${line}\n`),
      });
    };

    try {
      const result = await approveSpec(checkoutRoot, specId, config, {
        planningReaders,
        now: options.now,
        review,
        baseOk: options.baseOk,
        ignoreDirty: options.ignoreDirty,
      });
      printApprovalResult(result, inputs.stdout, inputs.stderr);
    } catch (error) {
      if (error instanceof CommandError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      let next: string | undefined;
      try {
        const { folderPath } = await findChange(checkoutRoot, config, specId);
        const nextStep = await readNextStep(checkoutRoot, folderPath, config);
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
