import { formatShowJson, formatShowText, getSpecDetails } from '../core/status/show.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, resolveInputs } from './command-inputs.js';

export interface ShowCommandOptions extends CommandInputs {
  json?: boolean;
}

export async function showCommand(
  specId: string,
  options: ShowCommandOptions = {},
): Promise<string> {
  const inputs = resolveInputs(options);
  const config = await inputs.config();

  if (!specId || !specId.trim()) {
    throw new CommandError('Error: specify a spec ID to show (e.g. osq show 001)');
  }

  try {
    const details = await getSpecDetails(inputs.cwd, specId, config);
    const formatted = options.json ? formatShowJson(details) : formatShowText(details);

    inputs.stdout(`${formatted}\n`);
    return formatted;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CommandError(`Show error: ${message}`);
  }
}
