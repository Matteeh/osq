import { type OsqConfig, loadConfig } from '../core/foundation/config.js';
import {
  buildApprovalDigest,
  formatApprovalDigest,
  formatApprovalFlags,
} from '../core/spec/digest.js';
import { formatSpecDetails, getSpecDetails } from '../core/status/show.js';

export async function showCommand(
  specId: string,
  options: {
    cwd?: string;
    stdout?: (msg: string) => void;
    config?: OsqConfig;
    json?: boolean;
  } = {},
): Promise<string> {
  const cwd = options.cwd || process.cwd();
  const config = options.config || (await loadConfig(cwd));

  if (!specId || !specId.trim()) {
    console.error('Error: specify a spec ID to show (e.g. osq show 001)');
    process.exit(1);
  }

  try {
    const details = await getSpecDetails(cwd, specId, config);
    // Only an unapproved change carries a digest; an approved one reports null.
    const digest =
      details.approvedHash === null
        ? await buildApprovalDigest(cwd, details.folderPath, config)
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

    if (options.stdout) {
      options.stdout(formatted);
    } else {
      console.log(formatted);
    }
    return formatted;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Show error: ${message}`);
    process.exit(1);
  }
}
