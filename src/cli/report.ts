import { DEFAULT_CONFIG, type OsqConfig } from '../core/config.js';
import { formatMetricsReport, getMetricsReport } from '../core/report.js';

export interface ReportCommandOptions {
  cwd?: string;
  stdout?: (msg: string) => void;
  config?: OsqConfig;
  json?: boolean;
}

export async function reportCommand(options: ReportCommandOptions = {}): Promise<string> {
  const cwd = options.cwd || process.cwd();
  const config = options.config || DEFAULT_CONFIG;

  try {
    const report = await getMetricsReport(cwd, config);
    const output = options.json ? JSON.stringify(report, null, 2) : formatMetricsReport(report);

    if (options.stdout) {
      options.stdout(output);
    } else {
      console.log(output);
    }
    return output;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Report error: ${message}`);
    process.exit(1);
  }
}
