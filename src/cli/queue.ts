import type { Command } from 'commander';
import type { OsqConfig } from '../core/foundation/config.js';
import { clearAutopilotStop } from '../core/status/autopilot-stop.js';
import {
  type ItemApproval,
  type QueueApproval,
  itemApproval,
  readQueueApproval,
  writeQueueApproval,
} from '../core/status/queue-approval.js';
import { type QueueItem, formatQueue, projectQueue, readQueue } from '../core/status/queue.js';
import { selectVcs } from '../core/vcs/select.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, resolveInputs } from './command-inputs.js';

export interface QueueCommandOptions extends CommandInputs {}

export interface QueueApproveCommandOptions extends CommandInputs {}

/** The trailing approval words of one item line, for the item's approval. */
function approvalWords(approval: QueueApproval, item: QueueItem): string {
  const verdict: ItemApproval = itemApproval(approval, { slug: item.slug, hash: item.hash });
  if (verdict === 'approved') return ' approved';
  if (verdict === 'changed') return ' changed since approval';
  return ' not approved';
}

/**
 * Insert the approval line right after `Queue:` and end each item line with its
 * approval words, leaving `formatQueue`'s own text for the rows.
 */
function withApproval(
  formatted: string,
  items: readonly QueueItem[],
  approval: QueueApproval,
): string {
  const lines = formatted.split('\n');
  const out = [
    lines[0] ?? 'Queue:',
    `Approved by ${approval.approver} at ${approval.approvedAt} (${approval.hash})`,
  ];
  for (let index = 1; index < lines.length; index += 1) {
    const item = items[index - 1];
    out.push(item === undefined ? lines[index] : `${lines[index]}${approvalWords(approval, item)}`);
  }
  return out.join('\n');
}

/**
 * Thin CLI wrapper: load config, project the read-only queue, and print it. With
 * a queue approval it prints the approval line and each item's approval.
 *
 * @scenario status-inspection: Queue view with an approval
 * @scenario status-inspection: Queue view without an approval
 * @adr 021
 */
export async function queueCommand(options: QueueCommandOptions = {}): Promise<string> {
  const inputs = resolveInputs(options);
  const config = await inputs.config();

  try {
    const items = await readQueue(inputs.cwd, config);
    const approval = await readQueueApproval(inputs.cwd, config);
    const projection = await projectQueue(inputs.cwd, config);
    const formatted = formatQueue(projection);
    const shown = approval === null ? formatted : withApproval(formatted, items, approval);
    inputs.stdout(`${shown}\n`);
    return shown;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CommandError(`Queue error: ${message}`);
  }
}

/** The git user as `Name <email>`, or empty when the project has no git. */
async function readApprover(projectRoot: string, config: OsqConfig): Promise<string> {
  const vcs = await selectVcs(projectRoot, config);
  if (vcs.kind !== 'git') return '';
  const name = (await vcs.configValue('user.name')) ?? '';
  const email = (await vcs.configValue('user.email')) ?? '';
  return `${name} <${email}>`;
}

/**
 * Record the hash of every queue item and clear an autopilot stop, as "Queue
 * approve command" says.
 *
 * @scenario cli-foundation: Queue approved
 * @scenario cli-foundation: Queue approve clears a stop
 * @scenario cli-foundation: Unreadable queue is not approved
 * @adr 021
 */
export async function approveQueue(options: QueueApproveCommandOptions = {}): Promise<void> {
  const inputs = resolveInputs(options);
  const config = await inputs.config();

  let items: readonly QueueItem[];
  try {
    items = await readQueue(inputs.cwd, config);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CommandError(`Queue error: ${message}`);
  }

  const approver = await readApprover(inputs.cwd, config);
  const approval = await writeQueueApproval(
    inputs.cwd,
    config,
    items.map((item) => ({ slug: item.slug, hash: item.hash })),
    approver,
  );
  await clearAutopilotStop(inputs.cwd, config);
  inputs.stdout(`Approved ${items.length} queue items (${approval.hash})\n`);
  if (config.autopilot?.enabled !== true) {
    inputs.stdout('Autopilot is off; set autopilot.enabled in osq.config.ts to run the queue\n');
  }
}

/**
 * Register `osq queue` and its `approve` subcommand.
 *
 * @scenario cli-foundation: Queue approved
 * @scenario cli-foundation: Queue approve clears a stop
 * @adr 021
 */
export function registerQueueCommand(program: Command): void {
  const queue = program
    .command('queue')
    .description('print the read-only brief queue projection')
    .action(async () => {
      await queueCommand();
    });

  queue
    .command('approve')
    .description('record the hash of every queue item and clear an autopilot stop')
    .action(async () => {
      await approveQueue();
    });
}
