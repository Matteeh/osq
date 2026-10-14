import path from 'node:path';

/**
 * The text a human pastes into a new agent session to plan the change in
 * `folderPath`. Names the prompt file by its absolute path, so the agent finds
 * it from any working directory. Reads no file, so the CLI, a server and the
 * dashboard can give the same text.
 *
 * @scenario cli-foundation: Paste block text
 */
export function formatPlanPasteBlock(folderPath: string): string {
  const folder = path.basename(folderPath);
  const promptPath = path.join(folderPath, 'plan-prompt.md');
  return (
    `You are the planner for osq change ${folder}.\n` +
    `Read ${promptPath} and follow it exactly; it is your complete prompt.\n`
  );
}

/** The inputs the default plan handoff prints. */
export interface PlanHandoffOptions {
  readonly folderPath: string;
  readonly nextStep: string;
  readonly slashCommandId: string | null;
}

/**
 * The full default handoff: the one-line handoff, then the paste block, then
 * the shorter Claude Code command only when the managed command can find the
 * folder. Reads no file.
 *
 * @scenario cli-foundation: Handoff with the Claude Code command
 * @scenario cli-foundation: Handoff without the Claude Code command
 * @scenario cli-foundation: Queue handoff gives the same block
 * @scenario cli-foundation: Steered change in its worktree
 */
export function formatPlanHandoff(options: PlanHandoffOptions): string {
  const { folderPath, nextStep, slashCommandId } = options;
  const folder = path.basename(folderPath);
  let text = `${folderPath}: ask your planning tool to plan change ${folder} \u2014 next: ${nextStep}\n\nPaste this into a new agent session to plan it:\n\n${formatPlanPasteBlock(folderPath)}`;
  if (slashCommandId !== null) {
    text += `\nIn Claude Code, /osq-plan ${slashCommandId} does the same.\n`;
  }
  return text;
}
