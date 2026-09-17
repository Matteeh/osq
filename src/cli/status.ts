import { type OsqConfig, loadConfig } from '../core/config.js';
import { formatStatusOverview, getStatusOverview } from '../core/status.js';

export async function statusCommand(
  options: { cwd?: string; stdout?: (msg: string) => void; config?: OsqConfig } = {},
): Promise<string> {
  const cwd = options.cwd || process.cwd();
  const config = options.config || (await loadConfig(cwd));

  try {
    const overview = await getStatusOverview(cwd, config);
    const formatted = formatStatusOverview(overview);
    if (options.stdout) {
      options.stdout(formatted);
    } else {
      console.log(formatted);
    }
    return formatted;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Status error: ${message}`);
    process.exit(1);
  }
}
