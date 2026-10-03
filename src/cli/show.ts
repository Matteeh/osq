import {
  buildApprovalDigest,
  formatApprovalDigest,
  formatApprovalFlags,
} from '../core/spec/digest.js';
import { formatSpecDetails, getSpecDetails } from '../core/status/show.js';
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
    // Only an unapproved change carries a digest; an approved one reports null.
    const digest =
      details.approvedHash === null
        ? await buildApprovalDigest(inputs.cwd, details.folderPath, config)
        : null;

    let formatted: string;
    if (options.json) {
      formatted = JSON.stringify({ ...details, digest }, null, 2);
    } else {
      formatted = formatSpecDetails(details);
      if (digest) {
        formatted += `\n${formatApprovalDigest(digest)}`;
        for (const line of formatApprovalFlags(digest.flags)) {
          formatted += `\n${line}`;
        }
      }
    }

    inputs.stdout(`${formatted}\n`);
    return formatted;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CommandError(`Show error: ${message}`);
  }
}
