import { type OsqConfig, loadConfig } from '../core/config.js';
import { formatSpecDetails, getSpecDetails } from '../core/show.js';

export async function showCommand(
  specId: string,
  options: { cwd?: string; stdout?: (msg: string) => void; config?: OsqConfig } = {},
): Promise<string> {
  const cwd = options.cwd || process.cwd();
  const config = options.config || (await loadConfig(cwd));

  if (!specId || !specId.trim()) {
    console.error('Error: specify a spec ID to show (e.g. osq show 001)');
    process.exit(1);
  }

  try {
    const details = await getSpecDetails(cwd, specId, config);
    const formatted = formatSpecDetails(details);
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
