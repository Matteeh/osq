import fs from 'node:fs/promises';
import path from 'node:path';
import { CLAUDE_PLAN_COMMAND_PATH } from '../core/foundation/init-blocks.js';
import { formatPlanHandoff } from '../core/foundation/plan-handoff.js';
import type { Writer } from './command-inputs.js';

/** Everything the default plan handoff needs to write and print. */
export interface WritePromptHandoffOptions {
  readonly folderPath: string;
  readonly openingPrompt: string;
  readonly nextStep: string;
  readonly specId: string;
  readonly cwd: string;
  readonly changesDir: string;
  readonly stdout: Writer;
}

/**
 * The change's id when the managed Claude Code command can find the folder,
 * else null. The command looks for the change directly in the working
 * directory's changes folder, so only that layout qualifies.
 */
async function resolveSlashCommandId(options: WritePromptHandoffOptions): Promise<string | null> {
  if (path.dirname(options.folderPath) !== options.changesDir) return null;
  const commandPath = path.join(options.cwd, CLAUDE_PLAN_COMMAND_PATH);
  const exists = await fs
    .stat(commandPath)
    .then(() => true)
    .catch(() => false);
  return exists ? options.specId : null;
}

/**
 * Persist the transient prompt beside the change and print the full default
 * handoff, adding the Claude Code command only when that command can find the
 * folder.
 *
 * @scenario cli-foundation: Handoff with the Claude Code command
 * @scenario cli-foundation: Handoff without the Claude Code command
 * @scenario cli-foundation: Queue handoff gives the same block
 * @scenario cli-foundation: Steered change in its worktree
 */
export async function writePromptHandoff(options: WritePromptHandoffOptions): Promise<void> {
  await fs.writeFile(
    path.join(options.folderPath, 'plan-prompt.md'),
    options.openingPrompt,
    'utf8',
  );
  const slashCommandId = await resolveSlashCommandId(options);
  options.stdout(
    formatPlanHandoff({
      folderPath: options.folderPath,
      nextStep: options.nextStep,
      slashCommandId,
    }),
  );
}
