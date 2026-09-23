import { resolveCodexEffort, resolveCodexModel } from '../../core/foundation/config-codex.js';
import { buildExecutorPrompt } from '../prompt.js';
import type { SpawnTaskOptions } from '../types.js';

/** Full one-attempt executor prompt naming every file the task needs. */
export async function buildCodexPrompt(options: SpawnTaskOptions): Promise<string> {
  return buildExecutorPrompt(options);
}

export interface CodexExecControls {
  readonly model?: string;
  readonly effort?: string;
}

/** Noninteractive `exec` argv, excluding the literal prompt argument. */
export function buildCodexExecArgs(controls: CodexExecControls = {}): string[] {
  const args: string[] = [
    '--ask-for-approval',
    'never',
    'exec',
    '--json',
    '--sandbox',
    'workspace-write',
    '-c',
    'web_search="disabled"',
    '-c',
    'sandbox_workspace_write.network_access=false',
  ];
  if (controls.model) args.push('--model', controls.model);
  if (controls.effort) args.push('-c', `model_reasoning_effort="${controls.effort}"`);
  return args;
}

/** Noninteractive task argv with the prompt as a single literal argument. */
export async function buildCodexArgs(options: SpawnTaskOptions): Promise<string[]> {
  const controls: CodexExecControls = {
    model: resolveCodexModel(options.config),
    effort: resolveCodexEffort(options.config),
  };
  return [...buildCodexExecArgs(controls), await buildCodexPrompt(options)];
}

/** Interactive terminal UI argv: on-request approvals, no exec/JSON/effort flags. */
export function buildCodexInteractiveArgs(options: {
  prompt: string;
  model?: string;
}): string[] {
  const args: string[] = ['--ask-for-approval', 'on-request', '--sandbox', 'workspace-write'];
  if (options.model) args.push('--model', options.model);
  args.push(options.prompt);
  return args;
}
