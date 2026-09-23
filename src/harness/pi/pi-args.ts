import type { OsqConfig } from '../../core/foundation/config.js';
import { resolvePiModel } from '../../core/foundation/harness-catalog.js';
import { buildExecutorPrompt } from '../prompt.js';
import type { SpawnTaskOptions } from '../types.js';

/** Pi flags that keep a task run headless, offline, and extension-free. */
const PI_BASE_ARGS = [
  '--mode',
  'json',
  '--no-session',
  '--no-approve',
  '--offline',
  '--no-extensions',
  '--no-skills',
  '--no-prompt-templates',
] as const;

/**
 * Noninteractive Pi argv with the shared executor prompt as one literal
 * argument. Configured provider, model, and thinking levels are added in that
 * order; unset flags are omitted so Pi uses its native selection.
 */
export function buildPiArgs(options: SpawnTaskOptions, config?: OsqConfig): string[] {
  const args: string[] = [...PI_BASE_ARGS];

  const provider = config?.pi?.provider?.trim();
  if (provider) args.push('--provider', provider);

  const model = resolvePiModel(config);
  if (model) args.push('--model', model);

  const thinking = config?.pi?.thinking?.trim();
  if (thinking) args.push('--thinking', thinking);

  args.push('--', buildExecutorPrompt(options));
  return args;
}
